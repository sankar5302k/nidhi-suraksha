import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { executeCopilotQuery, draftCaseNotice } from '../services/copilotService.js';
import { AiBudgetExceededError } from '../services/llm/LlmProvider.js';

const router = Router();

const querySchema = z.object({
  question: z.string().min(2).max(500)
}).strict();

/**
 * POST /copilot/query
 * Converts human query into structured filter, runs strictly through authorized query layer
 * Admin is excluded (does not participate in financial/case investigation)
 */
router.post(
  '/query',
  authenticateToken,
  requireRole('INSTITUTION', 'SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'AUDITOR'),
  apiLimiter,
  async (req: Request, res: Response) => {
    try {
      const parse = querySchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ error: 'Bad Request', message: 'Question parameter is required.' });
        return;
      }

      const { question } = parse.data;
      const response = await executeCopilotQuery(question, req.user!);

      res.status(200).json({
        message: 'Query executed within authorized scope',
        data: response
      });
    } catch (error) {
      if (error instanceof AiBudgetExceededError) {
        res.status(429).json({ error: 'Rate Limited', message: error.message });
        return;
      }
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process Copilot query.' });
    }
  }
);

/**
 * POST /copilot/draft-notice/:id
 * Drafts official deficiency/reminder notice from case facts for human review
 * Strictly restricted to Scrutiny Officers and Approving Authorities
 */
router.post(
  '/draft-notice/:id',
  authenticateToken,
  requireRole('SCRUTINY_OFFICER', 'APPROVING_AUTHORITY'),
  apiLimiter,
  async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'Not Found', message: 'FDR record not found.' });
      return;
    }

    const noticeText = await draftCaseNotice(id, req.user!);

    res.status(200).json({
      message: 'Notice drafted for human review. Rendered as plain text and not sent automatically.',
      data: {
        fdrId: id,
        noticeText
      }
    });
  } catch (error) {
    if (error instanceof AiBudgetExceededError) {
      res.status(429).json({ error: 'Rate Limited', message: error.message });
      return;
    }
    res.status(500).json({
      error: 'Notice Draft Error',
      message: error instanceof Error ? error.message : 'Failed to draft notice.'
    });
  }
});

export default router;
