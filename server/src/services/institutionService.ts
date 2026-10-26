import { getSupabaseAdmin } from '../db/supabase.js';

interface CachedInstitution {
  id: string;
  name: string;
  expiresAt: number;
}

const institutionCache = new Map<string, CachedInstitution>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes short cache

export const DEMO_INSTITUTIONS: Record<string, { id: string; name: string }> = {
  '10000000-0000-0000-0000-000000000001': {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Delhi Institute of Engineering & Technology'
  },
  '10000000-0000-0000-0000-000000000002': {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Mumbai College of Advance Technology'
  },
  '10000000-0000-0000-0000-000000000003': {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'Bengaluru Institute of Science & Research'
  },
  '10000000-0000-0000-0000-000000000004': {
    id: '10000000-0000-0000-0000-000000000004',
    name: 'Chennai Polytechnic & Technical University'
  },
  '10000000-0000-0000-0000-000000000005': {
    id: '10000000-0000-0000-0000-000000000005',
    name: 'Kolkata Academy of Technical Studies'
  },
  '11111111-1111-1111-1111-111111111111': {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Delhi Institute of Engineering & Technology (Default)'
  }
};

export async function validateInstitutionExists(institutionId: string): Promise<boolean> {
  if (!institutionId || typeof institutionId !== 'string') {
    return false;
  }

  // 1. Pre-configured sample institutions fallback
  if (DEMO_INSTITUTIONS[institutionId]) {
    return true;
  }

  // 2. Check in-memory cache
  const now = Date.now();
  const cached = institutionCache.get(institutionId);
  if (cached && cached.expiresAt > now) {
    return true;
  }

  // 3. Query Supabase
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('id', institutionId)
      .maybeSingle();

    if (data && !error) {
      institutionCache.set(institutionId, {
        id: data.id,
        name: data.name,
        expiresAt: now + CACHE_TTL_MS
      });
      return true;
    }

    // In development mode, if Supabase is unreachable/not seeded, allow valid UUID format
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institutionId)) {
      institutionCache.set(institutionId, {
        id: institutionId,
        name: `Affiliated Institution (${institutionId.slice(0, 8)})`,
        expiresAt: now + CACHE_TTL_MS
      });
      return true;
    }

    return false;
  } catch {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institutionId)) {
      institutionCache.set(institutionId, {
        id: institutionId,
        name: `Affiliated Institution (${institutionId.slice(0, 8)})`,
        expiresAt: now + CACHE_TTL_MS
      });
      return true;
    }
    return false;
  }
}

/**
 * Helper to prime cache in testing or seeds
 */
export function cacheInstitution(id: string, name: string): void {
  institutionCache.set(id, {
    id,
    name,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export function clearInstitutionCache(): void {
  institutionCache.clear();
}
