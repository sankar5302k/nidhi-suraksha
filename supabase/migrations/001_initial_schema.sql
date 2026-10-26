-- ==============================================================================
-- Nidhi Suraksha - "Verify. Track. Release."
-- Migration 001: Initial Schema, Institutions, Profiles, RLS, and Triggers
-- ==============================================================================

-- 1. Create Institutions table
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aicte_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for AICTE ID lookup
CREATE INDEX IF NOT EXISTS idx_institutions_aicte_id ON public.institutions (aicte_id);

-- 2. Create Profiles table (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT CHECK (role IN ('INSTITUTION', 'SCRUTINY_OFFICER', 'APPROVING_AUTHORITY', 'ADMIN', 'AUDITOR')),
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for institution lookup
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id ON public.profiles (institution_id);

-- 3. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Profiles
-- Users can SELECT only their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Prevent client-side updates to role or institution_id. 
-- Only service_role can perform INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "Service role full access on profiles" ON public.profiles;
CREATE POLICY "Service role full access on profiles"
    ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. RLS Policies for Institutions
-- Institutions are readable only by server (service_role) or restricted authenticated users
DROP POLICY IF EXISTS "Service role full access on institutions" ON public.institutions;
CREATE POLICY "Service role full access on institutions"
    ON public.institutions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read their own institution" ON public.institutions;
CREATE POLICY "Users can read their own institution"
    ON public.institutions
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT institution_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- 6. Trigger to automatically provision a profile on auth.users creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, institution_id, is_active)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', ''),
        NULL, -- Role is null by default; only ADMIN via service_role sets app_metadata and role
        NULL,
        false -- Inactive by default; requires administrative approval/activation
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Comments for security documentation
COMMENT ON TABLE public.profiles IS 'Nidhi Suraksha user profiles linked to auth.users. Role in app_metadata is authoritative.';
COMMENT ON TABLE public.institutions IS 'AICTE registered technical institutions submitting security deposits.';
