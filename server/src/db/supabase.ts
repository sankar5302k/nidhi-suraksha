import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';

let supabaseAdminClient: SupabaseClient | null = null;

/**
 * Returns the Supabase service-role client.
 * This client is strictly server-side and has administrative privileges.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminClient) {
    const env = getEnv();
    supabaseAdminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseAdminClient;
}

/**
 * Override the client for mocking in tests
 */
export function setSupabaseAdmin(client: SupabaseClient | null): void {
  supabaseAdminClient = client;
}
