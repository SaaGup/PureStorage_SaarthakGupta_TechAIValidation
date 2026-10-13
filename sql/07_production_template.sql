-- =====================================================================
-- 07_production_template.sql  |  Same allocation on a LIVE Snowflake account
--
-- NOT RUN in this submission (no live account). It shows how the method in
-- 04 maps onto real SNOWFLAKE.ACCOUNT_USAGE views:
--   * QUERY_ATTRIBUTION_HISTORY gives compute credits per query, with QUERY_TAG.
--     The portal would tag every query with its report: QUERY_TAG = 'report:RPT_200'.
--   * That view EXCLUDES warehouse idle time (and queries of ~100 ms or less),
--     so we reconcile against WAREHOUSE_METERING_HISTORY and share the
--     idle credits out in proportion to each report's usage.
--   * Untagged queries appear as report_id = 'UNTAGGED', so tagging gaps are visible.
--   * Check: SUM(fully_loaded_credits) per warehouse = its billed compute credits.
--   * ACCOUNT_USAGE can lag by several hours, so this runs daily, not live.
-- =====================================================================

WITH params AS (
    SELECT DATEADD('day', -30, CURRENT_TIMESTAMP()) AS window_start,
           CURRENT_TIMESTAMP()                       AS window_end
),
attributed AS (
    -- Credits Snowflake attributes directly to each query.
    -- Untagged queries (ad-hoc, ETL) get their own bucket instead of being hidden in reports.
    SELECT
        q.warehouse_name,
        CASE WHEN q.query_tag LIKE 'report:%' THEN REPLACE(q.query_tag, 'report:', '')
             ELSE 'UNTAGGED' END                                   AS report_id,
        SUM(q.credits_attributed_compute)                          AS direct_credits
    FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY q, params p
    WHERE q.start_time >= p.window_start AND q.start_time < p.window_end
    GROUP BY 1, 2
),
metered AS (
    -- What each warehouse was actually billed for compute in the window
    SELECT m.warehouse_name, SUM(m.credits_used_compute) AS billed_credits
    FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY m, params p
    WHERE m.start_time >= p.window_start AND m.start_time < p.window_end
    GROUP BY 1
),
idle AS (
    -- Billed but not attributed to any query = warehouse idle time
    SELECT
        m.warehouse_name,
        m.billed_credits - COALESCE(SUM(a.direct_credits), 0) AS unattributed_credits
    FROM metered m
    LEFT JOIN attributed a ON a.warehouse_name = m.warehouse_name
    GROUP BY m.warehouse_name, m.billed_credits
)
SELECT
    a.report_id,
    a.warehouse_name,
    a.direct_credits,
    -- Share idle credits in proportion to each report's direct usage on that warehouse
    a.direct_credits / NULLIF(SUM(a.direct_credits) OVER (PARTITION BY a.warehouse_name), 0)
        * GREATEST(i.unattributed_credits, 0)                         AS allocated_idle_credits,
    a.direct_credits
      + a.direct_credits / NULLIF(SUM(a.direct_credits) OVER (PARTITION BY a.warehouse_name), 0)
        * GREATEST(i.unattributed_credits, 0)                         AS fully_loaded_credits
FROM attributed a
JOIN idle i ON i.warehouse_name = a.warehouse_name
ORDER BY fully_loaded_credits DESC;