-- ============================================================================
-- SANTOS DUMONT - STAGING MIGRATION 02: SCHEMA, ROLES & AUDIT LOGS
-- ============================================================================

-- 1. Garantir Extensão Criptográfica no Schema 'extensions'
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Tabela Protegida de Roles do Usuário
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper Privado no Schema 'private' (Sem Fallback Nulo)
CREATE OR REPLACE FUNCTION private.get_user_role(p_user_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_role VARCHAR(20);
BEGIN
    IF p_user_id IS NULL OR (p_user_id != auth.uid() AND auth.role() != 'service_role') THEN
        RETURN NULL;
    END IF;

    SELECT ur.role INTO v_role 
    FROM public.user_roles ur 
    WHERE ur.user_id = p_user_id;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION private.get_user_role(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_role(UUID) TO service_role;

-- Política RLS Sem Recursão Infinita
DROP POLICY IF EXISTS "Leitura Segura de Roles" ON public.user_roles;
CREATE POLICY "Leitura Segura de Roles" ON public.user_roles
    FOR SELECT USING (
        auth.uid() = user_id 
        OR private.get_user_role(auth.uid()) = 'ADMIN'
    );

-- 3. Atualizar Tabela Students com Soft Delete e SHA-256 Token Hash
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS qr_token_hash VARCHAR(64) UNIQUE DEFAULT NULL;

-- Migrar Tokens QR Existentes calculando o Hash SHA-256
UPDATE public.students
SET qr_token_hash = pg_catalog.encode(extensions.digest(qr_token::bytea, 'sha256'::text), 'hex')
WHERE qr_token IS NOT NULL AND qr_token_hash IS NULL;

-- 4. Tabela de Auditoria Imutável
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    action VARCHAR(30) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    performed_by UUID,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Registros de audit_logs são imutáveis e não podem ser alterados ou excluídos.' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_prevent_audit_mod ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_mod
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_modification();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, authenticated, anon;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated, service_role;

-- 5. Atualizar Tabela meal_logs e Constraints Nomeadas Explicitamente
ALTER TABLE public.meal_logs 
ADD COLUMN IF NOT EXISTS meal_date DATE,
ADD COLUMN IF NOT EXISTS qr_token_hash_used VARCHAR(64),
ADD COLUMN IF NOT EXISTS idempotency_key UUID DEFAULT NULL;

UPDATE public.meal_logs SET meal_date = date WHERE meal_date IS NULL;
UPDATE public.meal_logs SET idempotency_key = extensions.gen_random_uuid() WHERE idempotency_key IS NULL;

ALTER TABLE public.meal_logs ALTER COLUMN meal_date SET NOT NULL;

-- Aplicar Constraints Nomeadas
ALTER TABLE public.meal_logs 
DROP CONSTRAINT IF EXISTS unique_meal_idempotency;

ALTER TABLE public.meal_logs 
ADD CONSTRAINT unique_meal_idempotency UNIQUE (idempotency_key);

ALTER TABLE public.meal_logs 
DROP CONSTRAINT IF EXISTS unique_student_meal_per_day;

ALTER TABLE public.meal_logs 
ADD CONSTRAINT unique_student_meal_per_day UNIQUE (meal_date, student_id);
