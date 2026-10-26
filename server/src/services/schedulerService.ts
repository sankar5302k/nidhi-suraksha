import cron from 'node-cron';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { Fdr, IFdr } from '../models/fdr.js';
import { ReminderLog } from '../models/reminderLog.js';
import { recordAuditLog } from './auditService.js';
import { assertTransition } from './fdrStateMachine.js';

export const REMINDER_TRIGGERS = [7, 30, 60, 90];

// Transport for notification delivery (console/json logging in dev/test)
export const mailTransport = nodemailer.createTransport({
  jsonTransport: true
});

export interface SchedulerRunResult {
  evaluationDate: string;
  evaluatedCount: number;
  markedExpiringCount: number;
  markedMaturedCount: number;
  remindersSentCount: number;
  details: Array<{
    fdrId: string;
    last4: string;
    daysToMaturity: number;
    newStatus?: string;
    reminderSentForDays?: number;
  }>;
}

/**
 * Runs maturity check across all non-terminal FDRs.
 * Supports date simulation for demonstration and time-travel testing.
 */
export async function runMaturityScheduler(referenceDate = new Date()): Promise<SchedulerRunResult> {
  const isSimulated = referenceDate.getTime() !== new Date().getTime();
  const targetTime = referenceDate.getTime();

  // Find all FDRs that are not in terminal states (RELEASED, REJECTED, RENEWED)
  const activeFdrs = await Fdr.find({
    status: mongoose.trusted({ $in: ['ACTIVE', 'EXPIRING', 'SUBMITTED', 'UNDER_SCRUTINY'] })
  });

  let markedExpiring = 0;
  let markedMatured = 0;
  let remindersSent = 0;
  const details = [];

  for (const fdr of activeFdrs) {
    const maturityTime = new Date(fdr.maturityDate).getTime();
    const diffDays = Math.ceil((maturityTime - targetTime) / (1000 * 60 * 60 * 24));

    let statusUpdated = false;
    let oldStatus = fdr.status;

    // 1. Mark MATURED if maturity date has passed
    if (diffDays <= 0 && fdr.status !== 'MATURED') {
      try {
        assertTransition(fdr.status, 'MATURED');
        fdr.status = 'MATURED';
        markedMatured++;
        statusUpdated = true;
      } catch {
        // Transition not permitted from current state
      }
    }
    // 2. Mark EXPIRING if within 90 days
    else if (diffDays <= 90 && diffDays > 0 && fdr.status === 'ACTIVE') {
      try {
        assertTransition(fdr.status, 'EXPIRING');
        fdr.status = 'EXPIRING';
        markedExpiring++;
        statusUpdated = true;
      } catch {
        // Transition not permitted
      }
    }

    if (statusUpdated) {
      fdr.history.push({
        action: fdr.status === 'MATURED' ? 'FDR_MATURED' : 'FDR_MARKED_EXPIRING',
        actorId: 'system_scheduler',
        actorRole: 'SYSTEM',
        timestamp: new Date(),
        note: `Triggered at ${diffDays} days to maturity (Ref date: ${referenceDate.toISOString().slice(0, 10)})`
      });
      await fdr.save();

      await recordAuditLog({
        actorId: 'system_scheduler',
        actorRole: 'SYSTEM',
        action: fdr.status === 'MATURED' ? 'FDR_MATURED' : 'FDR_MARKED_EXPIRING',
        entityType: 'FDR',
        entityId: fdr.id,
        before: { status: oldStatus },
        after: { status: fdr.status, daysToMaturity: diffDays, simulated: isSimulated }
      }).catch(() => {});
    }

    // 3. Process Reminders at 90, 60, 30, 7 days
    let reminderTriggerMatched: number | undefined;
    for (const trigger of REMINDER_TRIGGERS) {
      if (diffDays <= trigger) {
        // Check if reminder was already sent for this trigger
        const alreadyLogged = await ReminderLog.findOne({
          fdrId: fdr._id,
          triggerDays: trigger
        });

        if (!alreadyLogged) {
          const subject = `[AICTE Nidhi Suraksha] Security Deposit FDR Ending in ${trigger} Days (Ending ${new Date(fdr.maturityDate).toISOString().slice(0, 10)})`;
          const recipientEmail = `institute_${fdr.institutionId.slice(0, 8)}@aicte-portal.in`;

          await mailTransport.sendMail({
            from: '"AICTE Regulation Bureau" <noreply@aicte-nidhi-suraksha.gov.in>',
            to: recipientEmail,
            subject,
            text: `Dear Institution Registrar,\n\nYour Fixed Deposit Receipt (Last 4 digits: ${fdr.last4}, Bank: ${fdr.bankName}) with deposit amount ₹${fdr.amount.toLocaleString('en-IN')} is reaching maturity in ${diffDays} days.\n\nPlease log in to Nidhi Suraksha portal to submit a renewal or request authorized release.\n\nVerify. Track. Release.\nAICTE Regulation Bureau`
          }).catch(() => {});

          await ReminderLog.create({
            fdrId: fdr._id,
            institutionId: fdr.institutionId,
            triggerDays: trigger,
            recipientEmail,
            subject,
            channel: 'EMAIL',
            status: 'SENT',
            simulated: isSimulated
          });

          remindersSent++;
          reminderTriggerMatched = trigger;
          break; // Send highest-priority matched reminder in this cycle
        }
      }
    }

    details.push({
      fdrId: fdr.id,
      last4: fdr.last4,
      daysToMaturity: diffDays,
      newStatus: statusUpdated ? fdr.status : undefined,
      reminderSentForDays: reminderTriggerMatched
    });
  }

  return {
    evaluationDate: referenceDate.toISOString(),
    evaluatedCount: activeFdrs.length,
    markedExpiringCount: markedExpiring,
    markedMaturedCount: markedMatured,
    remindersSentCount: remindersSent,
    details
  };
}

/**
 * Initializes daily background cron schedule (runs at 00:00 every day)
 */
export function initDailyCronJob(): cron.ScheduledTask {
  return cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[Nidhi Suraksha] Running daily automated FDR maturity and renewal scheduler...');
      const result = await runMaturityScheduler(new Date());
      console.log(`[Nidhi Suraksha] Scheduler completed: ${result.markedExpiringCount} marked expiring, ${result.markedMaturedCount} matured, ${result.remindersSentCount} reminders sent.`);
    } catch (err) {
      console.error('[Nidhi Suraksha] Scheduler error:', err);
    }
  });
}
