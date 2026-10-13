-- =====================================================================
-- 02_load.sql  |  Load the ETL output into Snowflake (Snowflake-only)
-- Run `npm run etl` first, then run this from SnowSQL / Snowflake CLI.
-- Replace <ABSOLUTE_PATH> with the full path to the repo on your machine.
-- =====================================================================

USE DATABASE PURE_INSIGHTS;

CREATE OR REPLACE FILE FORMAT PI_RAW.CSV_FMT
    TYPE = CSV
    SKIP_HEADER = 1
    FIELD_OPTIONALLY_ENCLOSED_BY = '"'
    EMPTY_FIELD_AS_NULL = TRUE
    NULL_IF = ('');

CREATE OR REPLACE STAGE PI_RAW.ETL_STAGE FILE_FORMAT = PI_RAW.CSV_FMT;

-- PUT uploads a local file into the internal stage (run from SnowSQL, not the web UI).
PUT file://<ABSOLUTE_PATH>/data/processed/observations.csv  @PI_RAW.ETL_STAGE AUTO_COMPRESS = TRUE OVERWRITE = TRUE;
PUT file://<ABSOLUTE_PATH>/data/processed/rejected_rows.csv @PI_RAW.ETL_STAGE AUTO_COMPRESS = TRUE OVERWRITE = TRUE;

-- ON_ERROR = ABORT_STATEMENT: one bad row fails the whole load. Partial loads hide problems.
COPY INTO PI_RAW.REPORT_USAGE_OBSERVATIONS
    FROM @PI_RAW.ETL_STAGE/observations.csv.gz
    ON_ERROR = ABORT_STATEMENT;

COPY INTO PI_RAW.QUARANTINED_ROWS
    FROM @PI_RAW.ETL_STAGE/rejected_rows.csv.gz
    ON_ERROR = ABORT_STATEMENT;

-- Expected: 1976 and 24
SELECT 'observations' AS table_name, COUNT(*) AS row_count FROM PI_RAW.REPORT_USAGE_OBSERVATIONS
UNION ALL
SELECT 'quarantined', COUNT(*) FROM PI_RAW.QUARANTINED_ROWS;