-- =====================================================================
-- 03_core_views.sql  |  Validated usage, report health, ownership
-- =====================================================================

-- Defence in depth: the ETL already removed bad rows, but the cost layer
-- re-applies the two rules that would corrupt money maths if a bad file
-- were ever loaded directly.
CREATE OR REPLACE VIEW PI_CORE.V_ATTRIBUTABLE_USAGE AS
SELECT *
FROM PI_RAW.REPORT_USAGE_OBSERVATIONS
WHERE snowflake_credits_consumed >= 0
  AND avg_load_time_sec > 0;


-- Refresh reliability and latency per report.
-- UNKNOWN statuses are excluded from the failure-rate denominator:
-- we do not know whether they failed, so we do not guess.
CREATE OR REPLACE VIEW PI_CORE.V_REPORT_HEALTH AS
SELECT
    report_id,
    MAX(report_name)                                                        AS report_name,
    COUNT(*)                                                                AS observations,
    SUM(CASE WHEN status_known THEN 1 ELSE 0 END)                           AS known_status_obs,
    SUM(CASE WHEN refresh_status IN ('FAILED', 'TIMED_OUT') THEN 1 ELSE 0 END) AS failed_obs,
    SUM(CASE WHEN refresh_status = 'UNKNOWN' THEN 1 ELSE 0 END)             AS unknown_status_obs,
    ROUND(SUM(CASE WHEN refresh_status IN ('FAILED', 'TIMED_OUT') THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN status_known THEN 1 ELSE 0 END), 0), 4)    AS refresh_failure_rate,
    ROUND(AVG(avg_load_time_sec), 2)                                        AS avg_load_time_sec,
    MAX(avg_load_time_sec)                                                  AS max_load_time_sec,
    SUM(CASE WHEN latency_tier <> 'ok' THEN 1 ELSE 0 END)                   AS breach_obs,
    SUM(CASE WHEN latency_tier = 'critical' THEN 1 ELSE 0 END)              AS critical_obs
FROM PI_RAW.REPORT_USAGE_OBSERVATIONS
GROUP BY report_id;


-- Ownership per report.
-- The raw data shows 7-14 different owners per report and some orphaned
-- observations, so we report the latest known owner AND how often it changed.
-- Assumption: file order (source_row) is chronological; the CSV has no timestamp.
CREATE OR REPLACE VIEW PI_CORE.V_REPORT_OWNERSHIP AS
WITH owned AS (
    SELECT
        report_id,
        owner_email,
        source_row,
        LAG(owner_email) OVER (PARTITION BY report_id ORDER BY source_row) AS previous_owner
    FROM PI_RAW.REPORT_USAGE_OBSERVATIONS
    WHERE owner_email IS NOT NULL
),
latest AS (
    SELECT report_id, owner_email AS latest_known_owner
    FROM owned
    QUALIFY ROW_NUMBER() OVER (PARTITION BY report_id ORDER BY source_row DESC) = 1
),
churn AS (
    SELECT
        report_id,
        COUNT(DISTINCT owner_email) AS distinct_owners,
        SUM(CASE WHEN previous_owner IS NOT NULL AND previous_owner <> owner_email THEN 1 ELSE 0 END) AS owner_changes
    FROM owned
    GROUP BY report_id
),
obs AS (
    SELECT
        report_id,
        MAX(report_name)                              AS report_name,
        COUNT(*)                                      AS observations,
        SUM(CASE WHEN is_orphaned THEN 1 ELSE 0 END)  AS orphaned_obs
    FROM PI_RAW.REPORT_USAGE_OBSERVATIONS
    GROUP BY report_id
)
SELECT
    o.report_id,
    o.report_name,
    o.observations,
    o.orphaned_obs,
    ROUND(o.orphaned_obs / o.observations, 4)  AS orphaned_share,
    l.latest_known_owner,
    COALESCE(c.distinct_owners, 0)             AS distinct_owners,
    COALESCE(c.owner_changes, 0)               AS owner_changes,
    CASE
        WHEN l.latest_known_owner IS NULL THEN 'FULLY_ORPHANED'
        WHEN o.orphaned_obs > 0          THEN 'PARTIALLY_ORPHANED'
        ELSE 'OWNED'
    END                                        AS ownership_status
FROM obs o
LEFT JOIN latest l ON l.report_id = o.report_id
LEFT JOIN churn  c ON c.report_id = o.report_id;