import { describe, it, expect, beforeEach } from 'vitest';
import { getEnv, resetCachedEnv } from '../src/config/env.js';

describe('Environment Configuration Validation (Fail-Fast)', () => {
  beforeEach(() => {
    resetCachedEnv();
  });

  it('validates default mock configuration successfully', () => {
    const env = getEnv({ LLM_PROVIDER: 'mock' });
    expect(env.LLM_PROVIDER).toBe('mock');
    expect(env.PORT).toBe(5000);
    expect(env.ENCRYPTION_MASTER_KEY).toHaveLength(64);
    expect(env.HMAC_KEY).toHaveLength(64);
  });

  it('rejects invalid encryption key length', () => {
    expect(() => {
      getEnv({
        ENCRYPTION_MASTER_KEY: 'too-short-key'
      });
    }).toThrow(/ENCRYPTION_MASTER_KEY/);
  });

  it('requires GROQ_API_KEY when LLM_PROVIDER is set to groq', () => {
    expect(() => {
      getEnv({
        LLM_PROVIDER: 'groq',
        GROQ_API_KEY: ''
      });
    }).toThrow(/GROQ_API_KEY is required/);
  });

  it('accepts valid groq configuration when GROQ_API_KEY is present', () => {
    const env = getEnv({
      LLM_PROVIDER: 'groq',
      GROQ_API_KEY: 'gsk_test_api_key_for_groq_models'
    });
    expect(env.LLM_PROVIDER).toBe('groq');
    expect(env.GROQ_API_KEY).toBe('gsk_test_api_key_for_groq_models');
  });
});
