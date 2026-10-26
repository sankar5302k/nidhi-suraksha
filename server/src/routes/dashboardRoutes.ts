import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { getDashboardSummary, generateFdrCsv } from '../services/reportService.js';
import { runMaturityScheduler } from '../services/schedulerService.js';

const router = Router();

/**
 * GET /dashboard/summary
 * Returns status distribution, high risk counts, upcoming expiries, and volume metrics
 */
router.get('/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const summary = await getDashboardSummary(req.user!);
    res.status(200).json({ data: summary });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to generate dashboard summary.' });
  }
});

/**
 * GET /reports/export-csv
 * Streams CSV export protected with formula-injection sanitization
 * Strictly forbidden for INSTITUTION role (exposes portfolio-wide data)
 */
router.get(
  '/export-csv',
  authenticateToken,
  requireRole('SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'ADMIN', 'AUDITOR'),
  async (req: Request, res: Response) => {
    try {
      const csvContent = await generateFdrCsv(req.user!);
      const filename = `fdr_report_${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.status(200).send(csvContent);
    } catch {
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to generate CSV export.' });
    }
  }
);

const simulateDateSchema = z.object({
  targetDate: z.string().refine(d => !isNaN(Date.parse(d)), 'Invalid targetDate format (use YYYY-MM-DD)')
}).strict();

/**
 * POST /admin/simulate-date
 * Admin tool to simulate date advancement for interactive demo mode only.
 * Strictly disabled in production environments.
 */
router.post('/simulate-date', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Time-travel date simulator is strictly disabled in production.'
    });
    return;
  }

  try {
    const parsed = simulateDateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Bad Request', message: 'Valid targetDate string is required.' });
      return;
    }

    const simDate = new Date(parsed.data.targetDate);
    const result = await runMaturityScheduler(simDate);

    res.status(200).json({
      message: `Date simulation evaluated at ${simDate.toISOString().slice(0, 10)}`,
      data: result
    });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Date simulation failed.' });
  }
});

export default router;
