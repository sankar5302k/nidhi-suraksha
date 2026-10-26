import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file if available
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  // Supabase Auth & Relational DB
  SUPABASE_URL: z.string().url().default('https://mock-project-id.supabase.co'),
  SUPABASE_ANON_KEY: z.string().min(1).default('mock-anon-key-placeholder'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('mock-service-role-key-placeholder'),
  SUPABASE_JWT_SECRET: z.string().min(16).default('development-supabase-jwt-secret-placeholder-32bytes!'),

  // MongoDB 7 with replica set
  MONGODB_URI: z.string().min(1).default('mongodb://app:AppSecretPassword123!@127.0.0.1:27017/nidhi_suraksha?authSource=nidhi_suraksha&replicaSet=rs0'),

  // Cryptographic Keys (AES-256-GCM master key and HMAC blind index key)
  ENCRYPTION_MASTER_KEY: z.string().length(64, 'ENCRYPTION_MASTER_KEY must be a 64-char hex string (32 bytes)')
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  HMAC_KEY: z.string().length(64, 'HMAC_KEY must be a 64-char hex string (32 bytes)')
    .default('fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'),
  CSRF_SECRET: z.string().min(16).default('csrf_secret_random_token_key_change_in_production_min32'),

  // LLM Configuration
  LLM_PROVIDER: z.enum(['groq', 'mock']).default('mock'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com'),
  AI_DAILY_BUDGET: z.coerce.number().positive().default(50),

  // Storage
  STORAGE_PROVIDER: z.enum(['gridfs', 'supabase']).default('gridfs')
}).superRefine((data, ctx) => {
  if (data.LLM_PROVIDER === 'groq' && (!data.GROQ_API_KEY || data.GROQ_API_KEY.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GROQ_API_KEY'],
      message: 'GROQ_API_KEY is required when LLM_PROVIDER is set to groq'
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(overrides?: Record<string, string | undefined>): Env {
  if (overrides) {
    const merged = { ...process.env, ...overrides };
    return envSchema.parse(merged);
  }
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

export function resetCachedEnv(): void {
  cachedEnv = null;
}
