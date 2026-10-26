import mongoose from 'mongoose';
import { FdrExtractionOutput } from './schema.js';
import { AiUsage } from '../../models/aiUsage.js';
import { getEnv } from '../../config/env.js';

export interface LlmProvider {
  extractFdr(redactedText: string, userId: string): Promise<FdrExtractionOutput>;
  parseQuery(question: string, userId: string): Promise<Record<string, unknown>>;
  draftNotice(context: Record<string, unknown>, userId: string): Promise<string>;
}

export class AiBudgetExceededError extends Error {
  constructor(message = 'Daily AI usage quota exceeded. Please try again tomorrow or contact AICTE administrator.') {
    super(message);
    this.name = 'AiBudgetExceededError';
  }
}

/**
 * Checks if the user or global AI quota for the day has been exceeded
 */
export async function checkDailyAiBudget(userId: string): Promise<void> {
  const env = getEnv();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const userUsageCount = await AiUsage.countDocuments({
    userId,
    createdAt: mongoose.trusted({ $gte: startOfDay })
  });

  if (userUsageCount >= env.AI_DAILY_BUDGET) {
    throw new AiBudgetExceededError(
      `Daily AI call budget of ${env.AI_DAILY_BUDGET} reached for user. Operation blocked.`
    );
  }
}
