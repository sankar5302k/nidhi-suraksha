import { LlmProvider } from './LlmProvider.js';
import { GroqProvider } from './GroqProvider.js';
import { MockLlmProvider } from './MockLlmProvider.js';
import { getEnv } from '../../config/env.js';

let activeLlmProvider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (activeLlmProvider) {
    return activeLlmProvider;
  }

  const env = getEnv();
  if (env.LLM_PROVIDER === 'groq' && env.GROQ_API_KEY) {
    try {
      activeLlmProvider = new GroqProvider();
      return activeLlmProvider;
    } catch {
      // Fallback gracefully to MockLlmProvider
      activeLlmProvider = new MockLlmProvider();
      return activeLlmProvider;
    }
  }

  activeLlmProvider = new MockLlmProvider();
  return activeLlmProvider;
}

export function setLlmProvider(provider: LlmProvider | null): void {
  activeLlmProvider = provider;
}
