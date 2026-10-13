-- =====================================================================
-- 06_reconciliation.sql  |  Prove the numbers add up
-- Every row must say PASS before the cost numbers are published.
-- =====================================================================

CREATE OR REPLACE VIEW PI_CORE.V_RECONCILIATION AS
WITH all_rows AS (
    SELECT source_row FROM PI_RAW.REPORT_USAGE_OBSERVATIONS
    UNION ALL
    SELECT source_row FROM PI_RAW.QUARANTINED_ROWS
)
-- 1. Every raw row is accounted for exactly once (clean OR quarantined)
SELECT
    'ROW_CONSERVATION' AS check_name,
    'Each raw row appears exactly once across clean + quarantined' AS description,
    CAST(MAX(source_row) - MIN(source_row) + 1 AS VARCHAR) AS expected,
    CAST(COUNT(DISTINCT source_row) AS VARCHAR) || ' distinct / ' || CAST(COUNT(*) AS VARCHAR) || ' total' AS actual,
    CASE WHEN COUNT(*) = COUNT(DISTINCT source_row)
          AND COUNT(*) = MAX(source_row) - MIN(source_row) + 1
         THEN 'PASS' ELSE 'FAIL' END AS status
FROM all_rows

UNION ALL
-- 2. Allocation neither creates nor loses credits
SELECT
    'CREDIT_CONSERVATION',
    'Credits allocated to reports = attributable credits',
    CAST((SELECT ROUND(SUM(snowflake_credits_consumed), 2) FROM PI_CORE.V_ATTRIBUTABLE_USAGE) AS VARCHAR),
    CAST((SELECT ROUND(SUM(total_credits), 2) FROM PI_CORE.V_REPORT_COST) AS VARCHAR),
    CASE WHEN ABS((SELECT SUM(snowflake_credits_consumed) FROM PI_CORE.V_ATTRIBUTABLE_USAGE)
                - (SELECT SUM(total_credits) FROM PI_CORE.V_REPORT_COST)) < 0.01
         THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- 3. Credit shares sum to 100%
SELECT
    'SHARES_SUM_TO_ONE',
    'Sum of credit_share across reports = 1',
    '1.0000',
    CAST((SELECT ROUND(SUM(credit_share), 4) FROM PI_CORE.V_REPORT_COST) AS VARCHAR),
    CASE WHEN ABS((SELECT SUM(credit_share) FROM PI_CORE.V_REPORT_COST) - 1) < 0.0001
         THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- 4. No report ends up with negative cost
SELECT
    'NO_NEGATIVE_ALLOCATION',
    'Reports with negative credits after allocation',
    '0',
    CAST((SELECT COUNT(*) FROM PI_CORE.V_REPORT_COST WHERE total_credits < 0) AS VARCHAR),
    CASE WHEN (SELECT COUNT(*) FROM PI_CORE.V_REPORT_COST WHERE total_credits < 0) = 0
         THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- 5. Zero-view reports never get a fake unit cost
SELECT
    'ZERO_VIEW_GUARD',
    'Reports with 0 views must have NULL cost_per_view',
    '0',
    CAST((SELECT COUNT(*) FROM PI_CORE.V_REPORT_COST
          WHERE total_views = 0 AND cost_per_view_usd IS NOT NULL) AS VARCHAR),
    CASE WHEN (SELECT COUNT(*) FROM PI_CORE.V_REPORT_COST
               WHERE total_views = 0 AND cost_per_view_usd IS NOT NULL) = 0
         THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- 6. Informational: credits held back by quarantine (negative-credit rows)
SELECT
    'QUARANTINED_CREDITS',
    'Credits excluded from allocation by quarantine rule R4 (informational)',
    'reported, not allocated',
    CAST((SELECT ROUND(SUM(TRY_CAST(snowflake_credits_consumed AS DECIMAL(12,4))), 2)
          FROM PI_RAW.QUARANTINED_ROWS WHERE rule = 'R4') AS VARCHAR),
    'INFO';