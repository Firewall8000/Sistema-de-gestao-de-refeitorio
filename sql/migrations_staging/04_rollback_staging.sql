-- ============================================================================
-- SANTOS DUMONT - STAGING MIGRATION 04: NON-DESTRUCTIVE ROLLBACK SCRIPT
-- ============================================================================

-- Desativar a RPC sem deletar registros de refeições
REVOKE ALL ON FUNCTION public.register_meal_rpc(TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.register_meal_rpc(TEXT, TEXT, UUID, BOOLEAN);

-- Desativar Constraints Nomeadas sem apagar tabelas
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS unique_meal_idempotency;
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS unique_student_meal_per_day;

-- Desativar Trigger de Auditoria sem apagar o histórico acumulado
DROP TRIGGER IF EXISTS trg_prevent_audit_mod ON public.audit_logs;
DROP FUNCTION IF EXISTS private.prevent_audit_modification();
DROP FUNCTION IF EXISTS private.get_user_role(UUID);
DROP VIEW IF EXISTS private.view_duplicate_meals_report;
