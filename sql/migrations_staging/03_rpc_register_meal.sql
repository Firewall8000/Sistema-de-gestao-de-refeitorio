-- ============================================================================
-- SANTOS DUMONT - STAGING MIGRATION 03: RESTRICTED RPC REGISTER MEAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_meal_rpc(
    p_identifier TEXT,
    p_method TEXT,
    p_idempotency_key UUID,
    p_is_offline_sync BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(20);
    v_student RECORD;
    v_maceio_date DATE;
    v_now TIMESTAMPTZ;
    v_inserted_id UUID;
    v_token_hash VARCHAR(64);
    v_constraint_name TEXT;
BEGIN
    -- 1. Execução Restrita Exclusivamente à Service Role (Backend Render)
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Acesso negado: Execução restrita exclusivamente à API de backend.' USING ERRCODE = '42501';
    END IF;

    -- 2. Validar Parâmetros de Entrada
    IF p_idempotency_key IS NULL THEN
        RETURN jsonb_build_object('status', 'INVALID_INPUT', 'message', 'Chave de idempotência é obrigatória.');
    END IF;

    IF p_method NOT IN ('QR_SCAN', 'MANUAL_MATRICULA') THEN
        RETURN jsonb_build_object('status', 'INVALID_METHOD', 'message', 'Método de validação inválido.');
    END IF;

    -- 3. Data e Horário Oficial do Banco (America/Maceio UTC-3)
    v_now := pg_catalog.now();
    v_maceio_date := (v_now AT TIME ZONE 'America/Maceio')::DATE;

    -- 4. Consultar Aluno Conforme o Método
    IF p_method = 'QR_SCAN' THEN
        v_token_hash := pg_catalog.encode(extensions.digest(p_identifier::bytea, 'sha256'::text), 'hex');
        SELECT id, registration, name, grade, turma, active, deleted_at INTO v_student
        FROM public.students WHERE qr_token_hash = v_token_hash;
    ELSE
        SELECT id, registration, name, grade, turma, active, deleted_at INTO v_student
        FROM public.students WHERE registration = p_identifier;
    END IF;

    IF v_student.id IS NULL THEN
        RETURN jsonb_build_object('status', 'NOT_FOUND', 'message', 'Estudante não encontrado.');
    END IF;

    IF v_student.deleted_at IS NOT NULL OR v_student.active = FALSE THEN
        RETURN jsonb_build_object('status', 'INACTIVE', 'message', 'Estudante inativo ou arquivado.');
    END IF;

    -- 5. Inserção Atômica Transacional
    BEGIN
        INSERT INTO public.meal_logs (
            id, student_id, student_registration, student_name,
            turma, grade, meal_date, date, timestamp,
            qr_token_hash_used, synced, validation_method, idempotency_key
        ) VALUES (
            extensions.gen_random_uuid(), v_student.id, v_student.registration, v_student.name,
            v_student.turma, v_student.grade, v_maceio_date, v_maceio_date, v_now,
            v_token_hash, TRUE, p_method, p_idempotency_key
        ) RETURNING id INTO v_inserted_id;

        -- Log de Auditoria
        INSERT INTO public.audit_logs (table_name, action, record_id, performed_by, payload)
        VALUES ('meal_logs', 'MEAL_GRANTED', v_inserted_id::text, v_user_id, jsonb_build_object(
            'student_id', v_student.id,
            'method', p_method,
            'date', v_maceio_date
        ));

        RETURN jsonb_build_object(
            'status', 'GRANTED',
            'message', 'Almoço liberado com sucesso!',
            'meal_id', v_inserted_id,
            'student_name', v_student.name,
            'grade', v_student.grade,
            'turma', v_student.turma
        );

    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

        IF v_constraint_name = 'unique_meal_idempotency' THEN
            RETURN jsonb_build_object(
                'status', 'GRANTED',
                'sub_status', 'IDEMPOTENT_REPLAY',
                'message', 'Replay idempotente de refeição já concedida.'
            );
        ELSIF v_constraint_name = 'unique_student_meal_per_day' THEN
            IF p_is_offline_sync THEN
                INSERT INTO public.audit_logs (table_name, action, record_id, performed_by, payload)
                VALUES ('meal_logs', 'CONFLICT_OFFLINE_DUPLICATE', v_student.id::text, v_user_id, jsonb_build_object(
                    'student_id', v_student.id,
                    'date', v_maceio_date
                ));
            ELSE
                INSERT INTO public.audit_logs (table_name, action, record_id, performed_by, payload)
                VALUES ('meal_logs', 'ONLINE_DUPLICATE_ATTEMPT', v_student.id::text, v_user_id, jsonb_build_object(
                    'student_id', v_student.id,
                    'date', v_maceio_date
                ));
            END IF;

            RETURN jsonb_build_object(
                'status', 'ALREADY_GRANTED',
                'message', 'Refeição já concedida hoje para este aluno.'
            );
        ELSE
            -- Relança qualquer outro erro inesperado de unicidade
            RAISE;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.register_meal_rpc(TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_meal_rpc(TEXT, TEXT, UUID, BOOLEAN) TO service_role;
