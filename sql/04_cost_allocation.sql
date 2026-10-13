-- =====================================================================
-- 04_cost_allocation.sql  |  Attribute cost to reports, unit cost per view
--
-- Method: DIRECT attribution. Each observation's credits are already
-- tagged to one report (in production: Snowflake QUERY_TAG = report_id),
-- so a report's credits = the sum of its tagged credits. Nothing is
-- spread by guesswork. See 07_production_template.sql for how idle
-- warehouse time would be shared out on a live account.
--
-- Unit cost uses a WEIGHTED ratio: total cost / total views.
-- (Averaging per-row ratios would let a row with 3 views count as much
--  as a row with 1,400 views.)
-- =====================================================================

CREATE OR REPLACE VIEW PI_CORE.V_REPORT_COST AS
WITH price AS (
    SELECT assumption_value AS usd_per_credit
    FROM PI_CORE.COST_ASSUMPTIONS
    WHERE assumption_key = 'usd_per_credit'
),
usage_by_report AS (
    SELECT
        report_id,
        MAX(report_name)                                         AS report_name,
        SUM(monthly_active_views)                                AS total_views,
        SUM(query_count_last_30d)                                AS total_queries,
        SUM(snowflake_credits_consumed)                          AS total_credits,
        SUM(aws_hosting_cost_usd)                                AS aws_cost_usd,
        SUM(CASE WHEN is_orphaned THEN snowflake_credits_consumed ELSE 0 END) AS orphaned_credits,
        SUM(CASE WHEN is_orphaned THEN aws_hosting_cost_usd ELSE 0 END)       AS orphaned_aws_cost_usd
    FROM PI_CORE.V_ATTRIBUTABLE_USAGE
    GROUP BY report_id
)
SELECT
    u.report_id,
    u.report_name,
    u.total_views,
    u.total_queries,
    ROUND(u.total_credits, 4)                                                    AS total_credits,
    ROUND(u.total_credits * p.usd_per_credit, 2)                                 AS snowflake_cost_usd,
    ROUND(u.aws_cost_usd, 2)                                                     AS aws_cost_usd,
    ROUND(u.total_credits * p.usd_per_credit + u.aws_cost_usd, 2)                AS total_cost_usd,
    ROUND(u.orphaned_credits * p.usd_per_credit + u.orphaned_aws_cost_usd, 2)    AS unowned_cost_usd,
    ROUND(u.total_credits / NULLIF(u.total_views, 0), 6)                         AS credits_per_view,
    ROUND((u.total_credits * p.usd_per_credit + u.aws_cost_usd)
          / NULLIF(u.total_views, 0), 4)                                         AS cost_per_view_usd,
    ROUND(u.total_credits / NULLIF(u.total_queries, 0), 6)                       AS credits_per_query,
    ROUND(u.total_credits / NULLIF(SUM(u.total_credits) OVER (), 0), 6)          AS credit_share
FROM usage_by_report u
CROSS JOIN price p;


-- Platform-wide totals: the numbers for the dashboard header and exec summary.
CREATE OR REPLACE VIEW PI_CORE.V_COST_SUMMARY AS
SELECT
    COUNT(*)                                                    AS reports,
    SUM(total_views)                                            AS total_views,
    ROUND(SUM(total_credits), 2)                                AS total_credits,
    ROUND(SUM(snowflake_cost_usd), 2)                           AS snowflake_cost_usd,
    ROUND(SUM(aws_cost_usd), 2)                                 AS aws_cost_usd,
    ROUND(SUM(total_cost_usd), 2)                               AS total_cost_usd,
    ROUND(SUM(unowned_cost_usd), 2)                             AS unowned_cost_usd,
    ROUND(SUM(unowned_cost_usd) / NULLIF(SUM(total_cost_usd), 0), 4) AS unowned_cost_share,
    ROUND(SUM(total_cost_usd) / NULLIF(SUM(total_views), 0), 4) AS platform_cost_per_view_usd
FROM PI_CORE.V_REPORT_COST;