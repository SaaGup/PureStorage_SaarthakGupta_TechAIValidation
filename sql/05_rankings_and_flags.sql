-- =====================================================================
-- 05_rankings_and_flags.sql  |  Who drives cost, and what looks wrong
-- =====================================================================

CREATE OR REPLACE VIEW PI_CORE.V_REPORT_COST_INSIGHTS AS
WITH c AS (
    SELECT * FROM PI_CORE.V_REPORT_COST
),
bounds AS (
    -- Quartiles across reports, used for outlier and mismatch flags
    SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY cost_per_view_usd) AS cpv_p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cost_per_view_usd) AS cpv_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY aws_cost_usd)      AS aws_p75,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_views)       AS views_p25
    FROM c
)
SELECT
    c.*,
    RANK() OVER (ORDER BY c.total_cost_usd DESC)                         AS cost_rank,
    -- Running share of total cost, highest-cost report first (Pareto curve)
    ROUND(SUM(c.total_cost_usd) OVER (ORDER BY c.total_cost_usd DESC, c.report_id
                                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          / SUM(c.total_cost_usd) OVER (), 4)                            AS cumulative_cost_share,
    NTILE(4) OVER (ORDER BY c.cost_per_view_usd DESC NULLS LAST)         AS cost_per_view_quartile,  -- 1 = most expensive
    -- Tukey rule: more than 1.5 x IQR above the 75th percentile
    CASE WHEN c.cost_per_view_usd > b.cpv_p75 + 1.5 * (b.cpv_p75 - b.cpv_p25)
         THEN TRUE ELSE FALSE END                                        AS is_cost_per_view_outlier,
    -- The brief's "active users vs AWS cost" discrepancy:
    -- hosting cost in the top quartile while usage is in the bottom quartile
    CASE WHEN c.aws_cost_usd >= b.aws_p75 AND c.total_views <= b.views_p25
         THEN TRUE ELSE FALSE END                                        AS is_aws_usage_mismatch,
    CASE WHEN c.total_views = 0 THEN 'NO_VIEWS'
         WHEN c.aws_cost_usd >= b.aws_p75 AND c.total_views <= b.views_p25 THEN 'REVIEW_HOSTING'
         WHEN c.cost_per_view_usd > b.cpv_p75 + 1.5 * (b.cpv_p75 - b.cpv_p25) THEN 'OPTIMISE_QUERIES'
         ELSE 'OK'
    END                                                                  AS recommended_action
FROM c
CROSS JOIN bounds b;