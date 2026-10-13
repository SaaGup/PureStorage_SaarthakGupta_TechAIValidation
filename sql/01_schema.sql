-- =====================================================================
-- 01_schema.sql  |  Database, schemas, tables and cost assumptions
-- Target: Snowflake. Run first.
--   PI_RAW  = data exactly as produced by the ETL (clean + quarantined)
--   PI_CORE = views that clean, allocate, rank and reconcile
-- =====================================================================

CREATE DATABASE IF NOT EXISTS PURE_INSIGHTS;
USE DATABASE PURE_INSIGHTS;

CREATE SCHEMA IF NOT EXISTS PI_RAW;
CREATE SCHEMA IF NOT EXISTS PI_CORE;

-- One row per clean observation from data/processed/observations.csv
CREATE OR REPLACE TABLE PI_RAW.REPORT_USAGE_OBSERVATIONS (
    source_row                 INTEGER       NOT NULL,  -- line number in the raw CSV (traceability)
    report_id                  VARCHAR(20)   NOT NULL,
    report_name                VARCHAR(200),
    owner_email                VARCHAR(320),            -- NULL when orphaned
    is_orphaned                BOOLEAN       NOT NULL,
    orphan_reason              VARCHAR(30),
    refresh_status             VARCHAR(20)   NOT NULL,
    status_known               BOOLEAN       NOT NULL,
    monthly_active_views       INTEGER       NOT NULL,
    has_views                  BOOLEAN       NOT NULL,
    snowflake_credits_consumed DECIMAL(12,4) NOT NULL,
    avg_load_time_sec          DECIMAL(8,2)  NOT NULL,
    latency_tier               VARCHAR(10)   NOT NULL,
    aws_hosting_cost_usd       DECIMAL(12,2) NOT NULL,
    query_count_last_30d       INTEGER       NOT NULL,
    concurrent_user_peak       INTEGER       NOT NULL
);

-- Quarantined rows from data/processed/rejected_rows.csv.
-- Values stay as text: a row may be quarantined precisely because a value is not a valid number.
CREATE OR REPLACE TABLE PI_RAW.QUARANTINED_ROWS (
    source_row                 INTEGER      NOT NULL,
    rule                       VARCHAR(10)  NOT NULL,
    detail                     VARCHAR(500),
    report_id                  VARCHAR(50),
    report_name                VARCHAR(200),
    owner_email                VARCHAR(320),
    last_refresh_status        VARCHAR(50),
    monthly_active_views       VARCHAR(50),
    snowflake_credits_consumed VARCHAR(50),
    avg_load_time_sec          VARCHAR(50),
    aws_hosting_cost_usd       VARCHAR(50),
    query_count_last_30d       VARCHAR(50),
    concurrent_user_peak       VARCHAR(50)
);

-- Business assumptions live in a table, not hard-coded in queries,
-- so finance can change the credit price without touching SQL.
CREATE OR REPLACE TABLE PI_CORE.COST_ASSUMPTIONS (
    assumption_key   VARCHAR(50)   NOT NULL,
    assumption_value DECIMAL(12,4) NOT NULL,
    note             VARCHAR(500)
);

INSERT INTO PI_CORE.COST_ASSUMPTIONS (assumption_key, assumption_value, note) VALUES
    ('usd_per_credit', 3.00, 'Assumed price per Snowflake credit (approx. Enterprise on-demand list price). Replace with the contracted rate.');