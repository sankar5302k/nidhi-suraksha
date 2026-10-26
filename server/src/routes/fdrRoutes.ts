import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireMfa } from '../middleware/requireMfa.js';
import { Fdr } from '../models/fdr.js';
import { DocumentModel } from '../models/document.js';
import { Extraction } from '../models/extraction.js';
import { AuditLog } from '../models/auditLog.js';
import { buildFdrQueryFilter, checkFdrAccess, AuthorizationError } from '../utils/authz.js';
import { encryptField, computeBlindIndex } from '../utils/crypto.js';
import { validateInstitutionExists } from '../services/institutionService.js';
import { recordAuditLog } from '../services/auditService.js';
import { assertTransition, InvalidStateTransitionError } from '../services/fdrStateMachine.js';
import { createReleaseRequest, ReleaseWorkflowError } from '../services/releaseService.js';
import {
  uploadMiddleware,
  uploadDocumentHandler,
  downloadDocumentHandler,
  extractDocumentHandler,
  confirmExtractionHandler,
  verifyBankHandler
} from '../controllers/documentController.js';

const router = Router();

// Strict Zod schema for FDR creation
const createFdrSchema = z.object({
  fdrNumber: z.string().min(5).max(40),
  bankName: z.string().min(2).max(100),
  branch: z.string().min(2).max(100),
  amount: z.number().positive(),
  issueDate: z.string().refine(d => !isNaN(Date.parse(d)), 'Invalid issueDate'),
  maturityDate: z.string().refine(d => !isNaN(Date.parse(d)), 'Invalid maturityDate'),
  lienInFavourOfAicte: z.boolean().default(false),
  // institutionId can only be provided by admin/scrutiny roles; for INSTITUTION role, it is strictly ignored & derived
  institutionId: z.string().uuid().optional()
}).strict();

/**
 * GET /fdrs
 * Lists FDRs with role-based object-level authorization filter
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const filter = buildFdrQueryFilter(user);

    const fdrs = await Fdr.find(filter)
      .select('-fdrNumberEnc') // Never send raw encrypted ciphertext to client
      .sort({ createdAt: -1 })
      .lean();

    // Response shaping: strip sensitive risk reasons or fields by role
    const shapedFdrs = fdrs.map(fdr => {
      const copy = { ...fdr };
      if (user.role === 'INSTITUTION') {
        // Strip forensic risk reasons; provide neutral message if discrepancy found
        if ((copy.riskScore && copy.riskScore >= 20) || copy.verificationStatus === 'DISCREPANCY_FLAGGED') {
          copy.riskReasons = ['Discrepancy found, please resubmit or contact the Bureau.'];
        } else {
          copy.riskReasons = [];
        }
      } else if (user.role === 'ADMIN') {
        // Admin does not inspect risk breakdown
        copy.riskReasons = [];
      }
      return copy;
    });

    res.status(200).json({
      data: shapedFdrs
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve FDRs.' });
  }
});

/**
 * GET /fdrs/:id
 * Retrieves an FDR by ID with object-level authorization (returns 404 on cross-tenant access to prevent IDOR)
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const fdr = await Fdr.findById(id);
    const authorizedFdr = checkFdrAccess(req.user!, fdr);

    const fdrObj = authorizedFdr.toObject();
    delete (fdrObj as unknown as Record<string, unknown>).fdrNumberEnc;

    const [documents, extractions, auditLogs] = await Promise.all([
      DocumentModel.find({ fdrId: id }).sort({ version: -1, createdAt: -1 }).lean(),
      Extraction.find({ fdrId: id }).sort({ createdAt: -1 }).lean(),
      AuditLog.find({ entityId: id }).sort({ seq: 1 }).lean()
    ]);

    // Response shaping: strip fields according to statutory role
    let documentsToReturn = documents;
    if (req.user!.role === 'INSTITUTION') {
      if ((fdrObj.riskScore && fdrObj.riskScore >= 20) || fdrObj.verificationStatus === 'DISCREPANCY_FLAGGED') {
        fdrObj.riskReasons = ['Discrepancy found, please resubmit or contact the Bureau.'];
      } else {
        fdrObj.riskReasons = [];
      }
    } else if (req.user!.role === 'ADMIN') {
      // Admin: cannot inspect risk reasons or access confidential bank certificates
      fdrObj.riskReasons = [];
      documentsToReturn = [];
    }

    res.status(200).json({
      data: {
        ...fdrObj,
        documents: documentsToReturn,
        extractions,
        auditLogs
      }
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve FDR.' });
  }
});

/**
 * POST /fdrs
 * Creates a new FDR record with application-level AES-256-GCM encryption and blind index
 */
router.post(
  '/',
  authenticateToken,
  requireRole('INSTITUTION'),
  async (req: Request, res: Response) => {
    try {
      const parseResult = createFdrSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid FDR submission payload.',
          details: parseResult.error.flatten().fieldErrors
        });
        return;
      }

      const data = parseResult.data;
      const user = req.user!;

      // 1. Resolve institutionId: NEVER trust client input for INSTITUTION role
      let targetInstitutionId: string;
      if (user.role === 'INSTITUTION') {
        if (!user.institutionId) {
          res.status(403).json({
            error: 'Forbidden',
            message: 'User profile does not belong to an institution.'
          });
          return;
        }
        targetInstitutionId = user.institutionId;
      } else {
        if (!data.institutionId) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'institutionId is required when creating an FDR as an Administrator.'
          });
          return;
        }
        targetInstitutionId = data.institutionId;
      }

      // 2. Validate foreign key: check if institution exists in Supabase
      const institutionExists = await validateInstitutionExists(targetInstitutionId);
      if (!institutionExists) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Referenced institution does not exist in Supabase.'
        });
        return;
      }

      // 3. Encrypt FDR number and compute HMAC-SHA256 blind index
      const fdrClean = data.fdrNumber.trim();
      const last4 = fdrClean.slice(-4);
      const fdrNumberEnc = encryptField(fdrClean);
      const fdrNumberHash = computeBlindIndex(fdrClean);

      // 4. Duplicate check using blind index and bankName
      const existing = await Fdr.findOne({
        bankName: data.bankName,
        fdrNumberHash
      });

      if (existing) {
        res.status(409).json({
          error: 'Conflict',
          message: 'An FDR with this number already exists for this bank.'
        });
        return;
      }

      // 5. Create FDR document
      const newFdr = new Fdr({
        institutionId: targetInstitutionId,
        fdrNumberEnc,
        fdrNumberHash,
        last4,
        bankName: data.bankName,
        branch: data.branch,
        amount: data.amount,
        issueDate: new Date(data.issueDate),
        maturityDate: new Date(data.maturityDate),
        lienInFavourOfAicte: data.lienInFavourOfAicte,
        status: 'DRAFT',
        verificationStatus: 'SUBMITTED_UNVERIFIED',
        createdBy: user.id,
        history: [
          {
            action: 'FDR_CREATED',
            actorId: user.id,
            actorRole: user.role,
            timestamp: new Date(),
            note: 'Initial draft created'
          }
        ]
      });

      await newFdr.save();

      // 6. Record audit log
      try {
        await recordAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: 'FDR_CREATED',
          entityType: 'FDR',
          entityId: newFdr.id,
          ip: req.ip || '127.0.0.1',
          userAgent: req.headers['user-agent'] || 'unknown',
          after: {
            institutionId: targetInstitutionId,
            bankName: data.bankName,
            amount: data.amount,
            last4
          }
        });
      } catch {
        // Log recorded
      }

      const responseObj = newFdr.toObject();
      delete (responseObj as unknown as Record<string, unknown>).fdrNumberEnc;

      res.status(201).json({
        message: 'FDR created successfully',
        data: responseObj
      });
    } catch {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create FDR.'
      });
    }
  }
);

/**
 * POST /fdrs/:id/documents
 * Uploads an FDR receipt scan or supporting document (memory storage, envelope encryption)
 */
router.post(
  '/:id/documents',
  authenticateToken,
  requireRole('INSTITUTION'),
  uploadMiddleware,
  uploadDocumentHandler
);

/**
 * GET /fdrs/:id/documents/:docId
 * Securely streams and decrypts a document with attachment disposition
 */
router.get(
  '/:id/documents/:docId',
  authenticateToken,
  downloadDocumentHandler
);

/**
 * POST /fdrs/:id/documents/:docId/extract
 * Triggers Document AI extraction pipeline (OCR, PII redaction, Groq/Mock LLM, risk re-scoring)
 */
router.post(
  '/:id/documents/:docId/extract',
  authenticateToken,
  requireRole('INSTITUTION', 'SCRUTINY_OFFICER'),
  extractDocumentHandler
);

/**
 * POST /fdrs/:id/extractions/:extId/confirm
 * Human confirmation of AI suggested fields
 */
router.post(
  '/:id/extractions/:extId/confirm',
  authenticateToken,
  requireRole('SCRUTINY_OFFICER'),
  confirmExtractionHandler
);

/**
 * POST /fdrs/:id/verify
 * Bank verification trigger: only Scrutiny Officers and Admins with MFA AAL2 can verify against bank adapter
 */
router.post(
  '/:id/verify',
  authenticateToken,
  requireRole('SCRUTINY_OFFICER'),
  requireMfa,
  verifyBankHandler
);

/**
 * POST /fdrs/:id/submit
 * Institution formally submits draft FDR
 */
router.post('/:id/submit', authenticateToken, requireRole('INSTITUTION'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const fdr = await Fdr.findById(id);
    checkFdrAccess(req.user!, fdr);

    assertTransition(fdr!.status, 'SUBMITTED');
    const oldStatus = fdr!.status;
    fdr!.status = 'SUBMITTED';
    fdr!.history.push({
      action: 'FDR_SUBMITTED',
      actorId: req.user!.id,
      actorRole: req.user!.role,
      timestamp: new Date()
    });
    await fdr!.save();

    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'FDR_SUBMITTED',
      entityType: 'FDR',
      entityId: fdr!.id,
      before: { status: oldStatus },
      after: { status: fdr!.status }
    }).catch(() => {});

    res.status(200).json({ message: 'FDR successfully submitted for scrutiny.', data: fdr });
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) {
      res.status(error.statusCode).json({ error: 'Conflict', message: error.message });
      return;
    }
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to submit FDR.' });
  }
});

/**
 * POST /fdrs/:id/scrutiny
 * Scrutiny Officer takes FDR under official review
 */
router.post('/:id/scrutiny', authenticateToken, requireRole('SCRUTINY_OFFICER'), requireMfa, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const fdr = await Fdr.findById(id);
    if (!fdr) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    assertTransition(fdr.status, 'UNDER_SCRUTINY');
    const oldStatus = fdr.status;
    fdr.status = 'UNDER_SCRUTINY';
    fdr.history.push({
      action: 'FDR_UNDER_SCRUTINY',
      actorId: req.user!.id,
      actorRole: req.user!.role,
      timestamp: new Date()
    });
    await fdr.save();

    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'FDR_UNDER_SCRUTINY',
      entityType: 'FDR',
      entityId: fdr.id,
      before: { status: oldStatus },
      after: { status: fdr.status }
    }).catch(() => {});

    res.status(200).json({ message: 'FDR is now under official scrutiny.', data: fdr });
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) {
      res.status(error.statusCode).json({ error: 'Conflict', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update FDR status.' });
  }
});

/**
 * POST /fdrs/:id/flag
 * Scrutiny Officer flags discrepancy on FDR
 */
const flagSchema = z.object({
  reason: z.string().min(5)
}).strict();

router.post('/:id/flag', authenticateToken, requireRole('SCRUTINY_OFFICER'), requireMfa, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const parsed = flagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Bad Request', message: 'Discrepancy reason is required.' });
      return;
    }

    const fdr = await Fdr.findById(id);
    if (!fdr) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    fdr.verificationStatus = 'DISCREPANCY_FLAGGED';
    fdr.riskReasons.push(`OFFICER_DISCREPANCY: ${parsed.data.reason}`);
    fdr.riskScore = Math.min(100, fdr.riskScore + 25);
    fdr.history.push({
      action: 'DISCREPANCY_FLAGGED_BY_OFFICER',
      actorId: req.user!.id,
      actorRole: req.user!.role,
      timestamp: new Date(),
      note: parsed.data.reason
    });
    await fdr.save();

    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'DISCREPANCY_FLAGGED_BY_OFFICER',
      entityType: 'FDR',
      entityId: fdr.id,
      after: { reason: parsed.data.reason, riskScore: fdr.riskScore }
    }).catch(() => {});

    res.status(200).json({ message: 'Discrepancy recorded and flagged.', data: fdr });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to flag discrepancy.' });
  }
});

/**
 * POST /fdrs/:id/renew
 * Submits renewal child FDR replacing expiring/matured parent FDR
 */
const renewSchema = z.object({
  fdrNumber: z.string().min(5),
  bankName: z.string().min(2),
  branch: z.string().min(2),
  amount: z.number().positive(),
  issueDate: z.string(),
  maturityDate: z.string(),
  lienInFavourOfAicte: z.boolean().default(true)
}).strict();

router.post('/:id/renew', authenticateToken, requireRole('INSTITUTION'), async (req: Request, res: Response) => {
  try {
    const parentId = req.params.id as string;
    if (!parentId || !mongoose.Types.ObjectId.isValid(parentId)) {
      res.status(404).json({ error: 'Not Found', message: 'Parent FDR record not found.' });
      return;
    }

    const parentFdr = await Fdr.findById(parentId);
    checkFdrAccess(req.user!, parentFdr);

    if (!['ACTIVE', 'EXPIRING', 'MATURED'].includes(parentFdr!.status)) {
      res.status(409).json({ error: 'Conflict', message: `Cannot renew an FDR in '${parentFdr!.status}' status.` });
      return;
    }

    const parse = renewSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid renewal data.', details: parse.error.flatten().fieldErrors });
      return;
    }

    const data = parse.data;
    const fdrClean = data.fdrNumber.trim();
    const last4 = fdrClean.slice(-4);
    const fdrNumberEnc = encryptField(fdrClean);
    const fdrNumberHash = computeBlindIndex(fdrClean);

    // Duplicate check
    const existing = await Fdr.findOne({ bankName: data.bankName, fdrNumberHash });
    if (existing) {
      res.status(409).json({ error: 'Conflict', message: 'An FDR with this number already exists.' });
      return;
    }

    // Create Child FDR
    const childFdr = new Fdr({
      institutionId: parentFdr!.institutionId,
      fdrNumberEnc,
      fdrNumberHash,
      last4,
      bankName: data.bankName,
      branch: data.branch,
      amount: data.amount,
      issueDate: new Date(data.issueDate),
      maturityDate: new Date(data.maturityDate),
      lienInFavourOfAicte: data.lienInFavourOfAicte,
      status: 'SUBMITTED',
      verificationStatus: 'SUBMITTED_UNVERIFIED',
      parentFdrId: String(parentFdr!._id),
      createdBy: req.user!.id,
      history: [
        {
          action: 'FDR_RENEWAL_CREATED',
          actorId: req.user!.id,
          actorRole: req.user!.role,
          timestamp: new Date(),
          note: `Renewal for parent FDR ${parentFdr!.last4}`
        }
      ]
    });
    await childFdr.save();

    // Mark parent FDR as RENEWED
    assertTransition(parentFdr!.status, 'RENEWED');
    parentFdr!.status = 'RENEWED';
    parentFdr!.history.push({
      action: 'FDR_RENEWED',
      actorId: req.user!.id,
      actorRole: req.user!.role,
      timestamp: new Date(),
      note: `Replaced by renewal child FDR ${childFdr.last4}`
    });
    await parentFdr!.save();

    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'FDR_RENEWED',
      entityType: 'FDR',
      entityId: parentFdr!.id,
      after: { childFdrId: childFdr.id, childLast4: childFdr.last4 }
    }).catch(() => {});

    const childObj = childFdr.toObject();
    delete (childObj as unknown as Record<string, unknown>).fdrNumberEnc;

    res.status(201).json({
      message: 'Renewal FDR created successfully; parent marked as RENEWED.',
      data: childObj
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to renew FDR.' });
  }
});

/**
 * POST /fdrs/:id/release-request
 * Institution initiates release workflow
 */
const releaseReqSchema = z.object({
  reason: z.string().min(5)
}).strict();

router.post('/:id/release-request', authenticateToken, requireRole('INSTITUTION'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const parsed = releaseReqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Bad Request', message: 'Release justification reason is required.' });
      return;
    }

    const result = await createReleaseRequest(id, req.user!, parsed.data.reason);

    res.status(201).json({
      message: 'Release request initiated and submitted for Scrutiny Officer review.',
      data: result
    });
  } catch (error) {
    if (error instanceof ReleaseWorkflowError) {
      res.status(error.statusCode).json({ error: 'Workflow Error', message: error.message });
      return;
    }
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    console.error('RELEASE REQ ERROR:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Failed to request release.' });
  }
});

export default router;
