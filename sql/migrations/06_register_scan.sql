-- Fluxo atual de sql/schema.sql (IDs TEXT, qr_token e meal_logs.date).
-- Não aplicar sobre migrations_staging: aquele esquema possui outro contrato.
-- Não altera políticas RLS ou permissões das tabelas. SECURITY INVOKER preserva-as.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meal_logs'
      AND column_name = 'id' AND data_type = 'text'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meal_logs'
      AND column_name IN ('meal_date', 'idempotency_key')
      AND is_nullable = 'NO' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'Esquema incompatível: esta migração requer o fluxo atual de sql/schema.sql, não migrations_staging';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS school_entries_date_time_idx
  ON public.school_entries (entry_date, entry_time, id);
CREATE INDEX IF NOT EXISTS meal_logs_date_student_idx
  ON public.meal_logs (date, student_id);

CREATE OR REPLACE FUNCTION public.register_scan_rpc(
  p_identifier TEXT, p_mode TEXT, p_method TEXT, p_request_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_entry public.school_entries%ROWTYPE;
  v_meal public.meal_logs%ROWTYPE;
  v_student_json JSONB;
  v_record JSONB;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_today DATE := (v_now AT TIME ZONE 'America/Fortaleza')::DATE;
  v_status TEXT;
  v_position BIGINT;
  v_next RECORD;
  v_next_position BIGINT;
  v_absent BOOLEAN;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('portaria', 'refeitorio')
     OR p_method IS NULL OR p_method NOT IN ('qr_code', 'manual')
     OR p_identifier IS NULL OR pg_catalog.btrim(p_identifier) = ''
     OR p_request_id IS NULL OR pg_catalog.length(p_request_id) NOT BETWEEN 1 AND 160 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'INVALID_INPUT');
  END IF;

  IF p_method = 'qr_code' THEN
    SELECT * INTO v_student FROM public.students WHERE qr_token = pg_catalog.btrim(p_identifier);
  ELSE
    SELECT * INTO v_student FROM public.students WHERE registration = pg_catalog.btrim(p_identifier);
  END IF;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'NOT_FOUND');
  END IF;

  v_student_json := pg_catalog.jsonb_build_object(
    'id', v_student.id, 'name', v_student.name, 'registration', v_student.registration,
    'grade', v_student.grade, 'turma', v_student.turma, 'active', v_student.active,
    'qr_token', v_student.qr_token
  );
  IF v_student.active IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('status', 'INACTIVE', 'student', v_student_json);
  END IF;

  IF p_mode = 'portaria' THEN
    INSERT INTO public.school_entries
      (id, student_id, student_name, turma, entry_date, entry_time, entry_method)
    VALUES (p_request_id, v_student.id, v_student.name, v_student.turma, v_today, v_now, p_method)
    ON CONFLICT (student_id, entry_date) DO NOTHING
    RETURNING * INTO v_entry;
    IF FOUND THEN
      v_status := 'GRANTED';
    ELSE
      SELECT * INTO v_entry FROM public.school_entries
        WHERE student_id = v_student.id AND entry_date = v_today;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro existente não está acessível' USING ERRCODE = '42501';
      END IF;
      v_status := CASE WHEN v_entry.id = p_request_id THEN 'GRANTED' ELSE 'ALREADY_GRANTED' END;
    END IF;
    v_record := pg_catalog.to_jsonb(v_entry);
  ELSE
    SELECT * INTO v_entry FROM public.school_entries
      WHERE student_id = v_student.id AND entry_date = v_today;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('status', 'NO_GATE_ENTRY', 'student', v_student_json);
    END IF;

    -- Fotografia da fila antes da inserção: ausência/refeição externa também resolvem a vez.
    SELECT e.student_id, e.entry_time, e.id, COALESCE(s.name, e.student_name) AS name
      INTO v_next FROM public.school_entries e
      LEFT JOIN public.students s ON s.id = e.student_id
      WHERE e.entry_date = v_today AND NOT EXISTS (
        SELECT 1 FROM public.meal_logs m WHERE m.date = v_today
          AND (m.student_id = e.student_id OR m.student_registration = s.registration)
      ) ORDER BY e.entry_time, e.id LIMIT 1;

    INSERT INTO public.meal_logs
      (id, student_id, student_registration, student_name, turma, grade,
       date, timestamp, qr_token_used, synced, validation_method)
    VALUES (p_request_id, v_student.id, v_student.registration, v_student.name,
      v_student.turma, v_student.grade, v_today, v_now, v_student.qr_token, TRUE,
      CASE WHEN p_method = 'qr_code' THEN 'CAMERA' ELSE 'MANUAL' END)
    ON CONFLICT (student_id, date) DO NOTHING
    RETURNING * INTO v_meal;
    IF FOUND THEN
      v_status := 'GRANTED';
    ELSE
      SELECT * INTO v_meal FROM public.meal_logs
        WHERE student_id = v_student.id AND date = v_today;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro existente não está acessível' USING ERRCODE = '42501';
      END IF;
      -- to_jsonb também funciona em instalações sem a coluna opcional meal_status.
      v_absent := COALESCE(pg_catalog.lower(pg_catalog.to_jsonb(v_meal)->>'meal_status') = 'ausente', FALSE)
        OR pg_catalog.upper(v_meal.validation_method) = 'AUSENTE';
      v_status := CASE WHEN v_absent THEN 'ABSENT'
        WHEN v_meal.id = p_request_id THEN 'GRANTED' ELSE 'ALREADY_GRANTED' END;
    END IF;
    v_record := pg_catalog.to_jsonb(v_meal);
    IF v_next.id IS NOT NULL THEN
      SELECT pg_catalog.count(*) INTO v_next_position FROM public.school_entries
        WHERE entry_date = v_today AND (entry_time, id) <= (v_next.entry_time, v_next.id);
    END IF;
  END IF;

  SELECT pg_catalog.count(*) INTO v_position FROM public.school_entries
    WHERE entry_date = v_today AND (entry_time, id) <= (v_entry.entry_time, v_entry.id);
  RETURN pg_catalog.jsonb_build_object(
    'status', v_status, 'student', v_student_json, 'record', v_record,
    'position', v_position, 'entry', pg_catalog.to_jsonb(v_entry),
    'cutting_line', COALESCE(v_next_position < v_position, FALSE),
    'next_position', v_next_position,
    'server_date', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_scan_rpc(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
-- Mesmos papéis que o leitor atual. As políticas das tabelas continuam obrigatórias.
GRANT EXECUTE ON FUNCTION public.register_scan_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
