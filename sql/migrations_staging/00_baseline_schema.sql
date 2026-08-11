-- ============================================================================
-- SANTOS DUMONT - STAGING MIGRATION 00: BASELINE SCHEMA (NEUTRAL SCHEMA ONLY)
-- ============================================================================

-- 1. Tabela Baseline de Estudantes
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    grade VARCHAR(50) NOT NULL,
    turma VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 2. Tabela Baseline de Registro de Refeições
CREATE TABLE IF NOT EXISTS public.meal_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE RESTRICT,
    student_registration VARCHAR(50) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    turma VARCHAR(50) NOT NULL,
    grade VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    qr_token_used TEXT,
    synced BOOLEAN DEFAULT TRUE NOT NULL,
    validation_method VARCHAR(50) NOT NULL
);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;
