export type UserRole =
  | 'INSTITUTION'
  | 'SCRUTINY_OFFICER'
  | 'APPROVING_AUTHORITY'
  | 'ADMIN'
  | 'AUDITOR';

export interface AuthenticatedUser {
  id: string; // Supabase UUID
  email?: string;
  role: UserRole;
  institutionId?: string | null;
  aal: 'aal1' | 'aal2';
  isActive: boolean;
  fullName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
