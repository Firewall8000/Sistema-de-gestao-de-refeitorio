CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- View protegida para relatar duplicidades antes das constraints
CREATE OR REPLACE VIEW private.view_duplicate_meals_report AS
SELECT
    student_registration,
    student_name,
    date,
    COUNT(*) AS total_refeicoes_registradas,
    ARRAY_AGG(id ORDER BY timestamp ASC) AS ids_refeicoes,
    ARRAY_AGG(timestamp ORDER BY timestamp ASC) AS horarios
FROM public.meal_logs
GROUP BY
    student_registration,
    student_name,
    date
HAVING COUNT(*) > 1;

REVOKE ALL
ON TABLE private.view_duplicate_meals_report
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON TABLE private.view_duplicate_meals_report
TO service_role;