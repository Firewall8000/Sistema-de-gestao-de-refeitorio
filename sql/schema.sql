-- ==========================================================================
-- SANTOS DUMONT - REFECTORY QR SYSTEM
-- Supabase Database Schema SQL Migration Script
-- Execute este script no SQL Editor do seu projeto no Supabase
-- ==========================================================================

-- 1. Tabela de Alunos (students)
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  registration TEXT UNIQUE NOT NULL,
  grade TEXT NOT NULL,
  turma TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  qr_token TEXT UNIQUE NOT NULL,
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
  CONSTRAINT unique_student_meal_per_day UNIQUE (date, student_registration)
);

-- 3. Habilitar Row Level Security (RLS) com políticas de leitura/escrita públicas
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes caso já tenham sido criadas
DROP POLICY IF EXISTS "Permitir tudo em alunos" ON public.students;
DROP POLICY IF EXISTS "Permitir tudo em meal_logs" ON public.meal_logs;

-- Criar políticas de acesso público (Leitura e Escrita anônima com a Anon Key)
CREATE POLICY "Permitir tudo em alunos" ON public.students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo em meal_logs" ON public.meal_logs FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Public Realtime para sincronização em tempo real entre celulares e computadores
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_logs;
