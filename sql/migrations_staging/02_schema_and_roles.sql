CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('ADMIN', 'OPERATOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura da propria role"
ON public.user_roles;

CREATE POLICY "Leitura da propria role"
ON public.user_roles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.user_roles
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_roles
TO authenticated;

GRANT ALL ON TABLE public.user_roles
TO service_role;

CREATE OR REPLACE FUNCTION private.get_user_role(p_user_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role VARCHAR(20);
BEGIN
    IF p_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF auth.role() <> 'service_role' THEN
        RETURN NULL;
    END IF;

    SELECT ur.role
    INTO v_role
    FROM public.user_roles AS ur
    WHERE ur.user_id = p_user_id;

    RETURN v_role;
END;
$$;

REVOKE ALL
ON FUNCTION private.get_user_role(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION private.get_user_role(UUID)
TO service_role;

ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS qr_token_hash VARCHAR(64) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_qr_token_hash_unique
ON public.students (qr_token_hash)
WHERE qr_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    performed_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION
        'Registros de auditoria são imutáveis.'
        USING ERRCODE = '42501';
END;
$$;

REVOKE ALL
ON FUNCTION private.prevent_audit_modification()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_audit_mod
ON public.audit_logs;

CREATE TRIGGER trg_prevent_audit_mod
BEFORE UPDATE OR DELETE
ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION private.prevent_audit_modification();

REVOKE ALL ON TABLE public.audit_logs
FROM PUBLIC, anon, authenticated;

REVOKE UPDATE, DELETE, TRUNCATE
ON TABLE public.audit_logs
FROM service_role;

GRANT SELECT, INSERT
ON TABLE public.audit_logs
TO service_role;

ALTER TABLE public.meal_logs
ADD COLUMN IF NOT EXISTS meal_date DATE,
ADD COLUMN IF NOT EXISTS qr_token_hash_used VARCHAR(64),
ADD COLUMN IF NOT EXISTS idempotency_key UUID;

UPDATE public.meal_logs
SET meal_date = date
WHERE meal_date IS NULL;

UPDATE public.meal_logs
SET idempotency_key = extensions.gen_random_uuid()
WHERE idempotency_key IS NULL;

ALTER TABLE public.meal_logs
ALTER COLUMN student_id SET NOT NULL,
ALTER COLUMN meal_date SET NOT NULL,
ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE public.meal_logs
DROP CONSTRAINT IF EXISTS unique_meal_idempotency;

ALTER TABLE public.meal_logs
ADD CONSTRAINT unique_meal_idempotency
UNIQUE (idempotency_key);

ALTER TABLE public.meal_logs
DROP CONSTRAINT IF EXISTS unique_student_meal_per_day;

ALTER TABLE public.meal_logs
ADD CONSTRAINT unique_student_meal_per_day
UNIQUE (meal_date, student_id);

GRANT ALL ON TABLE public.students TO service_role;
GRANT ALL ON TABLE public.meal_logs TO service_role;