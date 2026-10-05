-- ============================================================================
-- 05 - Push notifications + justificativas de almoço
-- Execute no SQL Editor do Supabase. Revise o bloco do pg_cron no final.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  platform         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meal_justifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_registration  TEXT NOT NULL,
  student_name          TEXT NOT NULL,
  grade                 TEXT,
  turma                 TEXT,
  date                  DATE NOT NULL,
  motivo                TEXT NOT NULL
    CHECK (motivo IN ('marmita','externa','a_caminho','saude','outros')),
  notes                 TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_justification_per_day UNIQUE (student_id, date)
);

-- Sem policies para anon: o acesso do aluno é só via as funções abaixo.
ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_justifications ENABLE ROW LEVEL SECURITY;

-- Leitura para o dashboard. O "admin" do painel é uma senha no front-end (sem
-- Supabase Auth), então a função é liberada à chave anon, como já ocorre com
-- meal_logs. ATENÇÃO (LGPD): motivos de saúde ficam legíveis a quem tiver a
-- chave pública. O ideal, no futuro, é proteger o painel com Supabase Auth.
CREATE OR REPLACE FUNCTION public.list_justifications_today()
RETURNS TABLE (student_registration TEXT, motivo TEXT, notes TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j.student_registration, j.motivo, j.notes, j.created_at
  FROM public.meal_justifications j
  WHERE j.date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;
GRANT EXECUTE ON FUNCTION public.list_justifications_today() TO anon, authenticated;

-- Valida aluno por matrícula + dispositivo vinculado (bound_device_id)
CREATE OR REPLACE FUNCTION public._validate_student(p_registration TEXT, p_device_id TEXT)
RETURNS public.students LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.* FROM public.students s
  WHERE s.registration = p_registration
    AND s.bound_device_id = p_device_id
    AND COALESCE(s.active, TRUE)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_registration TEXT, p_device_id TEXT,
  p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_platform TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.students;
BEGIN
  s := public._validate_student(p_registration, p_device_id);
  IF s.id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.push_subscriptions (student_id, endpoint, p256dh, auth, platform)
  VALUES (s.id, p_endpoint, p_p256dh, p_auth, p_platform)
  ON CONFLICT (endpoint) DO UPDATE
    SET student_id = EXCLUDED.student_id, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, platform = EXCLUDED.platform;
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.submit_justification(
  p_registration TEXT, p_device_id TEXT, p_motivo TEXT, p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.students;
BEGIN
  s := public._validate_student(p_registration, p_device_id);
  IF s.id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.meal_justifications
    (student_id, student_registration, student_name, grade, turma, date, motivo, notes)
  VALUES (s.id, s.registration, s.name, s.grade, s.turma,
          (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, p_motivo,
          NULLIF(btrim(p_notes), ''))
  ON CONFLICT (student_id, date) DO UPDATE
    SET motivo = EXCLUDED.motivo, notes = EXCLUDED.notes, created_at = NOW();
  RETURN TRUE;
END $$;

-- O aluno já tem QR lido ou justificativa hoje?
CREATE OR REPLACE FUNCTION public.student_has_record_today(p_registration TEXT, p_device_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.students; hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  s := public._validate_student(p_registration, p_device_id);
  IF s.id IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM public.meal_logs WHERE student_id = s.id AND date = hoje)
      OR EXISTS (SELECT 1 FROM public.meal_justifications WHERE student_id = s.id AND date = hoje);
END $$;

-- Usada só pela Edge Function (service_role): quem ainda não tem registro hoje
CREATE OR REPLACE FUNCTION public.pending_lunch_reminders()
RETURNS TABLE (endpoint TEXT, p256dh TEXT, auth TEXT, student_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ps.endpoint, ps.p256dh, ps.auth, s.name
  FROM public.push_subscriptions ps
  JOIN public.students s ON s.id = ps.student_id AND COALESCE(s.active, TRUE)
  WHERE NOT EXISTS (SELECT 1 FROM public.meal_logs m
                    WHERE m.student_id = s.id
                      AND m.date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND NOT EXISTS (SELECT 1 FROM public.meal_justifications j
                    WHERE j.student_id = s.id
                      AND j.date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;

REVOKE ALL ON FUNCTION public.pending_lunch_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._validate_student(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_justification(TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_record_today(TEXT,TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Agendamento: seg-sex, a cada 3 min das 12:20 às 12:59 (Brasília = UTC-3).
-- Antes: Database > Extensions > ativar pg_cron e pg_net.
-- Troque <PROJECT_REF> e <SERVICE_ROLE_KEY> (ideal: guardar no Vault).
-- ----------------------------------------------------------------------------
-- SELECT cron.schedule('lembrete-almoco', '20-59/3 15 * * 1-5', $job$
--   SELECT net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/lunch-reminder',
--     headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--                                   'Content-Type', 'application/json'),
--     body    := '{}'::jsonb);
-- $job$);
