import { getSupabaseAdmin } from '../db/supabase.js';
import { UserRole } from '../types/auth.js';

export interface UserProfile {
  id: string;
  fullName: string;
  role: UserRole;
  institutionId?: string | null;
  isActive: boolean;
  createdAt: string;
}

const profileCache = new Map<string, { profile: UserProfile; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export const DEMO_PROFILES: Record<string, UserProfile> = {
  '10000000-0000-0000-0000-000000000001': {
    id: '10000000-0000-0000-0000-000000000001',
    fullName: 'Dr. Rajiv Malhotra (Delhi Institute)',
    role: 'INSTITUTION',
    institutionId: '10000000-0000-0000-0000-000000000001',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  '20000000-0000-0000-0000-000000000002': {
    id: '20000000-0000-0000-0000-000000000002',
    fullName: 'Shri A. K. Sharma (Scrutiny Officer)',
    role: 'SCRUTINY_OFFICER',
    institutionId: null,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  '30000000-0000-0000-0000-000000000003': {
    id: '30000000-0000-0000-0000-000000000003',
    fullName: 'Prof. T. G. Sitharam (Approving Authority)',
    role: 'APPROVING_AUTHORITY',
    institutionId: null,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  '40000000-0000-0000-0000-000000000004': {
    id: '40000000-0000-0000-0000-000000000004',
    fullName: 'System Administrator (AICTE Cell)',
    role: 'ADMIN',
    institutionId: null,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  '50000000-0000-0000-0000-000000000005': {
    id: '50000000-0000-0000-0000-000000000005',
    fullName: 'Chief Vigilance Auditor',
    role: 'AUDITOR',
    institutionId: null,
    isActive: true,
    createdAt: new Date().toISOString()
  }
};

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const now = Date.now();
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.profile;
  }

  // Pre-configured persona fallback
  if (DEMO_PROFILES[userId]) {
    profileCache.set(userId, { profile: DEMO_PROFILES[userId], expiresAt: now + CACHE_TTL_MS });
    return DEMO_PROFILES[userId];
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, institution_id, is_active, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const profile: UserProfile = {
      id: data.id,
      fullName: data.full_name || '',
      role: data.role as UserRole,
      institutionId: data.institution_id,
      isActive: Boolean(data.is_active),
      createdAt: data.created_at
    };

    profileCache.set(userId, { profile, expiresAt: now + CACHE_TTL_MS });
    return profile;
  } catch {
    return null;
  }
}

export function cacheUserProfile(profile: UserProfile): void {
  profileCache.set(profile.id, {
    profile,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export function invalidateUserProfile(userId: string): void {
  profileCache.delete(userId);
}

export function clearProfileCache(): void {
  profileCache.clear();
}
