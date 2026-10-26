import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTestDb } from './helpers/testDb.js';
import { checkDailyAiBudget, AiBudgetExceededError } from '../src/services/llm/LlmProvider.js';
import { MockLlmProvider } from '../src/services/llm/MockLlmProvider.js';
import { AiUsage } from '../src/models/aiUsage.js';
import { getEnv } from '../src/config/env.js';

describe('AI Daily Budget Enforcement & Usage Privacy', () => {
  const TEST_USER = 'budget-test-user-123';
  const provider = new MockLlmProvider();

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('allows calls within the configured daily budget', async () => {
    await expect(checkDailyAiBudget(TEST_USER)).resolves.not.toThrow();

    const result = await provider.extractFdr(
      'State Bank of India Receipt #998877 Amount Rs. 1000000',
      TEST_USER
    );

    expect(result.fdrNumber.value).toBe('998877');

    const usageRecords = await AiUsage.find({ userId: TEST_USER });
    expect(usageRecords).toHaveLength(1);
    expect(usageRecords[0].tokensIn).toBeGreaterThan(0);
    expect(usageRecords[0].tokensOut).toBeGreaterThan(0);
    expect(usageRecords[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(usageRecords[0].status).toBe('SUCCESS');

    // CRITICAL: Ensure neither prompts nor document text are stored in usage collection
    const rawDoc = usageRecords[0].toObject() as Record<string, unknown>;
    expect(rawDoc['prompt']).toBeUndefined();
    expect(rawDoc['completion']).toBeUndefined();
    expect(rawDoc['text']).toBeUndefined();
  });

  it('blocks calls and throws AiBudgetExceededError once daily limit is reached', async () => {
    const env = getEnv();
    const budgetLimit = env.AI_DAILY_BUDGET;

    // Simulate usage up to the limit
    const dummyRecords = [];
    for (let i = 0; i < budgetLimit; i++) {
      dummyRecords.push({
        userId: TEST_USER,
        feature: 'document_extraction',
        tokensIn: 50,
        tokensOut: 50,
        latencyMs: 10,
        status: 'SUCCESS'
      });
    }
    await AiUsage.insertMany(dummyRecords);

    // Next check must throw
    await expect(checkDailyAiBudget(TEST_USER)).rejects.toThrow(AiBudgetExceededError);

    // Provider call must also be blocked
    await expect(
      provider.extractFdr('Any FDR text', TEST_USER)
    ).rejects.toThrow(/Daily AI call budget/);
  });
});
