CREATE OR REPLACE FUNCTION public.register_meal_rpc(
    p_identifier TEXT,
    p_method TEXT,
    p_idempotency_key UUID,
    p_performed_by UUID,
    p_is_offline_sync BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_role VARCHAR(20);
    v_student RECORD;
    v_maceio_date DATE;
    v_now TIMESTAMPTZ;
    v_inserted_id UUID;
    v_token_hash VARCHAR(64);
    v_constraint_name TEXT;
BEGIN
    -- Somente o backend com service_role pode executar
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION
            'Acesso negado: execução restrita à API de backend.'
            USING ERRCODE = '42501';
    END IF;

    -- Validar o funcionário responsável
    IF p_performed_by IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'INVALID_ACTOR',
            'message', 'Usuário responsável não informado.'
        );
    END IF;

    v_user_role := private.get_user_role(p_performed_by);

    IF v_user_role IS NULL
       OR v_user_role NOT IN ('ADMIN', 'OPERATOR') THEN
        RAISE EXCEPTION
            'Acesso negado: usuário sem função autorizada.'
            USING ERRCODE = '42501';
    END IF;

    -- Validar o identificador
    IF p_identifier IS NULL
       OR pg_catalog.btrim(p_identifier) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'INVALID_INPUT',
            'message', 'Identificador é obrigatório.'
        );
    END IF;

    -- Validar a chave de idempotência
    IF p_idempotency_key IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'INVALID_INPUT',
            'message', 'Chave de idempotência é obrigatória.'
        );
    END IF;

    -- Validar o método
    IF p_method NOT IN ('QR_SCAN', 'MANUAL_MATRICULA') THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'INVALID_METHOD',
            'message', 'Método de validação inválido.'
        );
    END IF;

    -- Data e horário oficial de Maceió
    v_now := pg_catalog.now();
    v_maceio_date :=
        (v_now AT TIME ZONE 'America/Maceio')::DATE;

    -- Localizar o aluno conforme o método
    IF p_method = 'QR_SCAN' THEN
        v_token_hash := pg_catalog.encode(
            extensions.digest(
                pg_catalog.convert_to(p_identifier, 'UTF8'),
                'sha256'
            ),
            'hex'
        );

        SELECT
            id,
            registration,
            name,
            grade,
            turma,
            active,
            deleted_at
        INTO v_student
        FROM public.students
        WHERE qr_token_hash = v_token_hash;
    ELSE
        SELECT
            id,
            registration,
            name,
            grade,
            turma,
            active,
            deleted_at
        INTO v_student
        FROM public.students
        WHERE registration = p_identifier;
    END IF;

    IF v_student.id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'NOT_FOUND',
            'message', 'Estudante não encontrado.'
        );
    END IF;

    IF v_student.deleted_at IS NOT NULL
       OR v_student.active = FALSE THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'INACTIVE',
            'message', 'Estudante inativo ou arquivado.'
        );
    END IF;

    -- Inserção atômica
    BEGIN
        INSERT INTO public.meal_logs (
            id,
            student_id,
            student_registration,
            student_name,
            turma,
            grade,
            meal_date,
            date,
            timestamp,
            qr_token_hash_used,
            synced,
            validation_method,
            idempotency_key
        )
        VALUES (
            extensions.gen_random_uuid(),
            v_student.id,
            v_student.registration,
            v_student.name,
            v_student.turma,
            v_student.grade,
            v_maceio_date,
            v_maceio_date,
            v_now,
            v_token_hash,
            TRUE,
            p_method,
            p_idempotency_key
        )
        RETURNING id INTO v_inserted_id;

        INSERT INTO public.audit_logs (
            table_name,
            action,
            record_id,
            performed_by,
            payload
        )
        VALUES (
            'meal_logs',
            'MEAL_GRANTED',
            v_inserted_id::TEXT,
            p_performed_by,
            pg_catalog.jsonb_build_object(
                'student_id', v_student.id,
                'method', p_method,
                'date', v_maceio_date
            )
        );

        RETURN pg_catalog.jsonb_build_object(
            'status', 'GRANTED',
            'message', 'Almoço liberado com sucesso!',
            'meal_id', v_inserted_id,
            'student_name', v_student.name,
            'grade', v_student.grade,
            'turma', v_student.turma
        );

    EXCEPTION
        WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS
                v_constraint_name = CONSTRAINT_NAME;

            IF v_constraint_name = 'unique_meal_idempotency' THEN
                RETURN pg_catalog.jsonb_build_object(
                    'status', 'GRANTED',
                    'sub_status', 'IDEMPOTENT_REPLAY',
                    'message', 'Requisição já processada.'
                );

            ELSIF v_constraint_name =
                'unique_student_meal_per_day' THEN

                IF p_is_offline_sync THEN
                    INSERT INTO public.audit_logs (
                        table_name,
                        action,
                        record_id,
                        performed_by,
                        payload
                    )
                    VALUES (
                        'meal_logs',
                        'CONFLICT_OFFLINE_DUPLICATE',
                        v_student.id::TEXT,
                        p_performed_by,
                        pg_catalog.jsonb_build_object(
                            'student_id', v_student.id,
                            'date', v_maceio_date
                        )
                    );
                ELSE
                    INSERT INTO public.audit_logs (
                        table_name,
                        action,
                        record_id,
                        performed_by,
                        payload
                    )
                    VALUES (
                        'meal_logs',
                        'ONLINE_DUPLICATE_ATTEMPT',
                        v_student.id::TEXT,
                        p_performed_by,
                        pg_catalog.jsonb_build_object(
                            'student_id', v_student.id,
                            'date', v_maceio_date
                        )
                    );
                END IF;

                RETURN pg_catalog.jsonb_build_object(
                    'status', 'ALREADY_GRANTED',
                    'message',
                    'Refeição já concedida hoje para este aluno.'
                );
            ELSE
                RAISE;
            END IF;
    END;
END;
$$;

REVOKE ALL
ON FUNCTION public.register_meal_rpc(
    TEXT,
    TEXT,
    UUID,
    UUID,
    BOOLEAN
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.register_meal_rpc(
    TEXT,
    TEXT,
    UUID,
    UUID,
    BOOLEAN
)
TO service_role;