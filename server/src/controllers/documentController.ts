import { Request, Response } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { Fdr } from '../models/fdr.js';
import { DocumentModel, DocumentType } from '../models/document.js';
import { Extraction } from '../models/extraction.js';
import { checkFdrAccess, AuthorizationError } from '../utils/authz.js';
import { processDocumentUpload, downloadAndDecryptDocument, UploadValidationError } from '../services/uploadService.js';
import { runDocumentAiExtraction } from '../services/documentAiService.js';
import { mockBankProvider } from '../services/bank/MockBankProvider.js';
import { recordAuditLog } from '../services/auditService.js';
import { decryptField } from '../utils/crypto.js';

// Multer in-memory storage: file never touches disk unencrypted
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB max
  }
}).single('file');

export async function uploadDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const fdrId = req.params.id as string;
    if (!fdrId || !mongoose.Types.ObjectId.isValid(fdrId)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const fdr = await Fdr.findById(fdrId);
    checkFdrAccess(req.user!, fdr);

    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Bad Request', message: 'No document file uploaded.' });
      return;
    }

    const documentType = (req.body.type as DocumentType) || 'FDR_SCAN';

    const doc = await processDocumentUpload({
      fdrId,
      fileBuffer: req.file.buffer,
      clientOriginalName: req.file.originalname,
      documentType,
      uploadedBy: req.user!.id
    });

    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'DOCUMENT',
      entityId: doc.id,
      after: {
        fdrId,
        type: doc.type,
        originalName: doc.originalName,
        sizeBytes: doc.sizeBytes,
        version: doc.version
      }
    });

    res.status(201).json({
      message: 'Document uploaded and securely encrypted.',
      data: {
        id: doc.id,
        fdrId: doc.fdrId,
        type: doc.type,
        originalName: doc.originalName,
        sizeBytes: doc.sizeBytes,
        version: doc.version,
        createdAt: doc.createdAt
      }
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    if (error instanceof UploadValidationError) {
      res.status(error.statusCode).json({ error: 'Bad Request', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process document upload.' });
  }
}

export async function downloadDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const docId = req.params.docId as string;
    if (!id || !docId || !mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(docId)) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found.' });
      return;
    }

    if (req.user?.role === 'ADMIN') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Administrators are restricted from accessing confidential financial documents.'
      });
      return;
    }

    const fdr = await Fdr.findById(id);
    checkFdrAccess(req.user!, fdr);

    const doc = await DocumentModel.findOne({ _id: docId, fdrId: id });
    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found.' });
      return;
    }

    const { plaintextBuffer, mimeType, originalName } = await downloadAndDecryptDocument(doc);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    res.status(200).send(plaintextBuffer);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to download document.' });
  }
}

export async function extractDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const docId = req.params.docId as string;
    if (!id || !docId || !mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(docId)) {
      res.status(404).json({ error: 'Not Found', message: 'Document or FDR not found.' });
      return;
    }

    const fdr = await Fdr.findById(id);
    checkFdrAccess(req.user!, fdr);

    const doc = await DocumentModel.findOne({ _id: docId, fdrId: id });
    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found.' });
      return;
    }

    const result = await runDocumentAiExtraction(fdr!, doc, req.user!.id, req.user!.role);

    res.status(200).json({
      message: 'AI document extraction completed. Suggestions require human confirmation.',
      data: {
        extraction: result.extraction,
        riskScore: result.riskScore,
        riskReasons: result.riskReasons,
        discrepancies: result.discrepancies,
        notice: 'AI extracted suggestions are untrusted until explicitly confirmed by an officer.'
      }
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({
      error: 'Extraction Error',
      message: error instanceof Error ? error.message : 'AI extraction pipeline encountered an error.'
    });
  }
}

export async function confirmExtractionHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const extId = req.params.extId as string;
    if (!id || !extId || !mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(extId)) {
      res.status(404).json({ error: 'Not Found', message: 'Extraction not found.' });
      return;
    }

    const fdr = await Fdr.findById(id);
    checkFdrAccess(req.user!, fdr);

    const extraction = await Extraction.findOne({ _id: extId, fdrId: id });
    if (!extraction) {
      res.status(404).json({ error: 'Not Found', message: 'Extraction record not found.' });
      return;
    }

    extraction.status = 'CONFIRMED';
    extraction.fields.forEach(f => {
      f.confirmedBy = req.user!.id;
    });
    await extraction.save();

    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'AI_EXTRACTION_CONFIRMED',
      entityType: 'EXTRACTION',
      entityId: extraction.id,
      after: {
        fdrId: id,
        confirmedBy: req.user!.id
      }
    });

    res.status(200).json({
      message: 'Extraction successfully verified and confirmed by human reviewer.',
      data: extraction
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(error.statusCode).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to confirm extraction.' });
  }
}

export async function verifyBankHandler(req: Request, res: Response): Promise<void> {
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

    // Decrypt FDR number for bank verification
    let fdrPlainNumber = '';
    try {
      fdrPlainNumber = decryptField(
        fdr.fdrNumberEnc.ciphertext,
        fdr.fdrNumberEnc.iv,
        fdr.fdrNumberEnc.authTag
      );
    } catch {
      fdrPlainNumber = fdr.last4;
    }

    // Call Bank Verification Provider adapter
    const bankResponse = await mockBankProvider.verifyFdr({
      bankName: fdr.bankName,
      fdrNumber: fdrPlainNumber,
      amount: fdr.amount,
      maturityDate: fdr.maturityDate
    });

    const beforeStatus = fdr.verificationStatus;

    if (bankResponse.status === 'VERIFIED') {
      fdr.verificationStatus = 'BANK_VERIFIED';
      fdr.status = 'ACTIVE';
      fdr.history.push({
        action: 'BANK_VERIFIED',
        actorId: req.user!.id,
        actorRole: req.user!.role,
        timestamp: new Date(),
        note: `Bank confirmed via ref: ${bankResponse.verificationReference}`
      });
    } else if (bankResponse.status === 'MISMATCH') {
      fdr.verificationStatus = 'DISCREPANCY_FLAGGED';
      fdr.riskScore = Math.min(100, fdr.riskScore + 30);
      fdr.riskReasons.push(`BANK_MISMATCH: ${bankResponse.discrepancyNotes || 'Discrepancy reported by bank'}`);
      fdr.history.push({
        action: 'BANK_DISCREPANCY_FLAGGED',
        actorId: req.user!.id,
        actorRole: req.user!.role,
        timestamp: new Date(),
        note: bankResponse.discrepancyNotes
      });
    } else {
      fdr.verificationStatus = 'VERIFICATION_FAILED';
      fdr.riskScore = Math.min(100, fdr.riskScore + 40);
      fdr.riskReasons.push(`BANK_NOT_FOUND: ${bankResponse.discrepancyNotes || 'No record at bank'}`);
      fdr.history.push({
        action: 'BANK_VERIFICATION_FAILED',
        actorId: req.user!.id,
        actorRole: req.user!.role,
        timestamp: new Date(),
        note: bankResponse.discrepancyNotes
      });
    }

    await fdr.save();

    // Audit log bank verification outcome
    await recordAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: bankResponse.status === 'VERIFIED' ? 'BANK_VERIFICATION_SUCCESS' : 'BANK_VERIFICATION_FAILED',
      entityType: 'FDR',
      entityId: fdr.id,
      before: { verificationStatus: beforeStatus },
      after: {
        verificationStatus: fdr.verificationStatus,
        status: fdr.status,
        bankStatus: bankResponse.status,
        ref: bankResponse.verificationReference
      }
    });

    res.status(200).json({
      message: `Bank verification finished: ${bankResponse.status}`,
      data: {
        fdrId: fdr.id,
        verificationStatus: fdr.verificationStatus,
        status: fdr.status,
        riskScore: fdr.riskScore,
        riskReasons: fdr.riskReasons,
        bankResponse
      }
    });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Bank verification failed.' });
  }
}
