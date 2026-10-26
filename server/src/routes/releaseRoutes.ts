import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireMfa } from '../middleware/requireMfa.js';
import { ReleaseRequest } from '../models/releaseRequest.js';
import {
  processReleaseRequest,
  decideReleaseRequest,
  ReleaseWorkflowError
} from '../services/releaseService.js';

const router = Router();

/**
 * GET /release-requests
 * Lists release requests with role-based scoping
 */
router.get(
  '/',
  authenticateToken,
  requireRole('INSTITUTION', 'SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'AUDITOR'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const filter: Record<string, unknown> = {};

      if (user.role === 'INSTITUTION') {
        filter.institutionId = user.institutionId;
      }

      const requests = await ReleaseRequest.find(filter)
        .populate('fdrId', 'last4 bankName amount maturityDate status verificationStatus')
        .sort({ createdAt: -1 })
        .lean();

      // Response shaping: For Institution, only show sanctionOrder if status is APPROVED
      const shapedRequests = requests.map(r => {
        const copy = { ...r };
        if (user.role === 'INSTITUTION' && copy.status !== 'APPROVED') {
          delete (copy as Record<string, unknown>).sanctionOrder;
        }
        return copy;
      });

      res.status(200).json({ data: shapedRequests });
    } catch {
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve release requests.' });
    }
  }
);

/**
 * POST /release-requests/:id/process
 * Scrutiny Officer processes/recommends or rejects release request (Tier 1)
 */
const processSchema = z.object({
  decision: z.enum(['RECOMMEND', 'REJECT']),
  notes: z.string().optional()
}).strict();

router.post(
  '/:id/process',
  authenticateToken,
  requireRole('SCRUTINY_OFFICER'),
  requireMfa,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ error: 'Not Found', message: 'Release request not found.' });
        return;
      }

      const parsed = processSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Bad Request', message: 'Invalid process decision body.' });
        return;
      }

      const result = await processReleaseRequest(
        id,
        req.user!,
        parsed.data.decision,
        parsed.data.notes
      );

      res.status(200).json({
        message: `Release request ${parsed.data.decision === 'RECOMMEND' ? 'recommended for approval' : 'rejected'}.`,
        data: result
      });
    } catch (error) {
      if (error instanceof ReleaseWorkflowError) {
        res.status(error.statusCode).json({ error: 'Workflow Error', message: error.message });
        return;
      }
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process release request.' });
    }
  }
);

/**
 * POST /release-requests/:id/decision
 * Approving Authority approves or rejects release (Separation of duties enforced)
 */
const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional()
}).strict();

router.post(
  '/:id/decision',
  authenticateToken,
  requireRole('APPROVING_AUTHORITY'),
  requireMfa,
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ error: 'Not Found', message: 'Release request not found.' });
        return;
      }

      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Bad Request', message: 'Invalid decision payload.' });
        return;
      }

      const result = await decideReleaseRequest(
        id,
        req.user!,
        parsed.data.decision,
        parsed.data.notes
      );

      res.status(200).json({
        message: `Release request ${parsed.data.decision === 'APPROVE' ? 'officially approved and FDR released' : 'rejected'}.`,
        data: result
      });
    } catch (error) {
      if (error instanceof ReleaseWorkflowError) {
        res.status(error.statusCode).json({ error: 'Workflow Error', message: error.message });
        return;
      }
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to make release decision.' });
    }
  }
);

export default router;
