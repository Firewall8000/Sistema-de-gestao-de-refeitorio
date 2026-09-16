-- ==========================================================================
-- SANTOS DUMONT - REFECTORY & PORTARIA SYSTEM
-- Supabase Database Schema Seguro com RLS e View de Fila
-- ==========================================================================

-- Extensão para Biometria Facial
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Tabela de Alunos (students)
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  registration TEXT UNIQUE NOT NULL,
  grade TEXT NOT NULL,
  turma TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  qr_token TEXT UNIQUE NOT NULL,
  face_embedding vector(128), -- Vetor biométrico para reconhecimento facial (LGPD)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Registros de Almoço (meal_logs)
CREATE TABLE IF NOT EXISTS public.meal_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE,
  student_registration TEXT NOT NULL,
  student_name TEXT NOT NULL,
  turma TEXT NOT NULL,
  grade TEXT NOT NULL,
  date DATE NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  qr_token_used TEXT NOT NULL,
  synced BOOLEAN DEFAULT TRUE,
  validation_method TEXT NOT NULL,
  CONSTRAINT unique_student_meal_per_date UNIQUE (student_id, date)
);

-- 3. Tabela de Registros de Entrada na Portaria (school_entries)
CREATE TABLE IF NOT EXISTS public.school_entries (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  turma TEXT NOT NULL,
  entry_date DATE NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entry_method TEXT NOT NULL,
  CONSTRAINT unique_student_entry_per_day UNIQUE (student_id, entry_date)
);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_entries ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas
DROP POLICY IF EXISTS "Permitir tudo em alunos" ON public.students;
DROP POLICY IF EXISTS "Permitir tudo em meal_logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Permitir tudo em school_entries" ON public.school_entries;
DROP POLICY IF EXISTS "Permitir leitura de alunos ativos" ON public.students;
DROP POLICY IF EXISTS "Permitir leitura de refeicoes" ON public.meal_logs;
DROP POLICY IF EXISTS "Permitir registro de nova refeicao" ON public.meal_logs;
DROP POLICY IF EXISTS "Permitir leitura de entradas do dia" ON public.school_entries;
DROP POLICY IF EXISTS "Permitir registrar entrada na portaria" ON public.school_entries;

-- 5. Políticas RLS Seguras e Restritivas
-- Alunos: apenas leitura de ativos (ninguém de fora pode alterar ou deletar)
CREATE POLICY "Permitir leitura de alunos ativos"
ON public.students FOR SELECT TO anon, authenticated
USING (active = TRUE);

-- Refeições: permite ler para métricas e inserir nova refeição (sem update/delete)
CREATE POLICY "Permitir leitura de refeicoes"
ON public.meal_logs FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Permitir registro de nova refeicao"
ON public.meal_logs FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Entradas da Portaria: permite ler as de hoje e inserir novas (sem update/delete)
CREATE POLICY "Permitir leitura de entradas do dia"
ON public.school_entries FOR SELECT TO anon, authenticated
USING (entry_date = CURRENT_DATE);

CREATE POLICY "Permitir registrar entrada na portaria"
ON public.school_entries FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- 6. View da Fila do Almoço Ordenada por Horário de Chegada
CREATE OR REPLACE VIEW public.lunch_queue_today AS
SELECT 
    e.id AS entry_id,
    s.id AS student_id,
    s.name AS student_name,
    s.registration AS student_registration,
    s.turma,
    s.grade,
    e.entry_time,
    TO_CHAR(e.entry_time, 'HH24:MI:SS') AS horario_chegada,
    ROW_NUMBER() OVER (ORDER BY e.entry_time ASC) AS posicao_fila
FROM public.school_entries e
JOIN public.students s ON s.id = e.student_id
WHERE e.entry_date = CURRENT_DATE
  AND s.active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM public.meal_logs m 
      WHERE m.student_id = s.id 
        AND m.date = CURRENT_DATE
  )
ORDER BY e.entry_time ASC;

-- 7. Realtime Habilitado para Sincronização
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_entries;