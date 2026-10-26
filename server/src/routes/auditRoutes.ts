import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { requireMfa } from '../middleware/requireMfa.js';
import { verifyAuditChain } from '../services/auditService.js';

const router = Router();

/**
 * GET /audit/verify-chain
 * Allows AUDITOR and ADMIN roles to inspect the cryptographic hash chain of all audit entries.
 * Enforces AAL2 multi-factor authentication.
 */
router.get(
  '/verify-chain',
  authenticateToken,
  requireRole('AUDITOR', 'ADMIN'),
  requireMfa,
  async (req: Request, res: Response) => {
    try {
      const result = await verifyAuditChain();
      res.status(200).json({
        data: result
      });
    } catch {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify cryptographic audit log chain.'
      });
    }
  }
);

export default router;
