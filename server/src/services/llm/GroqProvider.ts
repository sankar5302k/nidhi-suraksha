import Groq from 'groq-sdk';
import crypto from 'crypto';
import { LlmProvider, checkDailyAiBudget } from './LlmProvider.js';
import { fdrExtractionSchema, FDR_EXTRACTION_JSON_SCHEMA, FdrExtractionOutput } from './schema.js';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_PROMPT_VERSION, buildExtractionUserMessage } from './prompts.js';
import { AiUsage } from '../../models/aiUsage.js';
import { getEnv } from '../../config/env.js';

export class GroqProvider implements LlmProvider {
  private client: Groq;
  private model: string;

  constructor() {
    const env = getEnv();
    const rawBaseUrl = env.GROQ_BASE_URL?.trim();
    const baseURL = rawBaseUrl ? rawBaseUrl.replace(/\/openai\/v1\/?$/, '') : 'https://api.groq.com';
    this.client = new Groq({
      apiKey: env.GROQ_API_KEY,
      baseURL,
      timeout: 20000 // 20-second timeout
    });
    this.model = env.GROQ_MODEL;
  }

  async extractFdr(redactedText: string, userId: string): Promise<FdrExtractionOutput> {
    await checkDailyAiBudget(userId);

    const inputHash = crypto.createHash('sha256').update(redactedText).digest('hex');
    const start = Date.now();
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          reasoning_format: 'hidden',
          max_completion_tokens: 2048,
          messages: [
            {
              role: 'system',
              content: EXTRACTION_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: buildExtractionUserMessage(redactedText)
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: FDR_EXTRACTION_JSON_SCHEMA
          } as unknown as { type: 'json_object' }
        });

        const latencyMs = Date.now() - start;
        const choice = response.choices[0];
        const rawContent = choice?.message?.content;

        if (!rawContent) {
          throw new Error('Empty response received from Groq LLM API');
        }

        // Re-validate strictly with Zod server-side
        const parsedJson = JSON.parse(rawContent);
        const validatedOutput = fdrExtractionSchema.parse(parsedJson);

        // Record usage without recording prompt/completion
        const usage = response.usage;
        await AiUsage.create({
          userId,
          feature: 'document_extraction',
          tokensIn: usage?.prompt_tokens || Math.ceil(redactedText.length / 4),
          tokensOut: usage?.completion_tokens || 200,
          latencyMs,
          status: 'SUCCESS'
        }).catch(() => {});

        return validatedOutput;
      } catch (err: unknown) {
        const isLastAttempt = attempts >= maxAttempts;
        const errObj = err as { status?: number; message?: string };
        const isRateLimitOr5xx = errObj?.status === 429 || (errObj?.status && errObj.status >= 500);

        if (isLastAttempt || !isRateLimitOr5xx) {
          await AiUsage.create({
            userId,
            feature: 'document_extraction',
            tokensIn: Math.ceil(redactedText.length / 4),
            tokensOut: 0,
            latencyMs: Date.now() - start,
            status: errObj?.status === 429 ? 'RATE_LIMITED' : 'ERROR'
          }).catch(() => {});

          throw new Error(
            errObj?.status === 429
              ? 'AI extraction rate limit reached. Please proceed with manual verification.'
              : `AI extraction failed: ${errObj?.message || 'Unexpected LLM error'}. Please verify manually.`
          );
        }

        // Exponential backoff with jitter (e.g. 1s, 2s)
        const delay = Math.pow(2, attempts) * 500 + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('AI extraction failed after maximum retries. Please verify manually.');
  }

  async parseQuery(question: string, userId: string): Promise<Record<string, unknown>> {
    await checkDailyAiBudget(userId);
    // Structured copilot parsing will be implemented in Copilot module
    return { status: ['ACTIVE'] };
  }

  async draftNotice(context: Record<string, unknown>, userId: string): Promise<string> {
    await checkDailyAiBudget(userId);
    // Notice drafting will be implemented in Copilot module
    return 'Official AICTE Notice regarding FDR compliance.';
  }
}
