"""
Run the Snowflake SQL suite locally on DuckDB and cross-check it against the
Node ETL output. Lets a reviewer verify the SQL logic without a Snowflake account.

Usage (from the repo root, after `npm run etl` in server/):
    pip install duckdb
    python scripts/verify_sql.py

DuckDB runs the same ANSI SQL (CTEs, window functions, QUALIFY, PERCENTILE_CONT).
Snowflake-only statements (CREATE DATABASE, USE, PUT, COPY INTO) are skipped;
the CSVs are loaded with DuckDB's read_csv instead of 02_load.sql.
Exit code 0 = every check passed.
"""
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "sql"
PROCESSED = ROOT / "data" / "processed"
SNOWFLAKE_ONLY = ("CREATE DATABASE", "USE ")


def run_file(con, name):
    lines = (SQL / name).read_text(encoding="utf-8").splitlines()
    kept = [l for l in lines if not l.strip().upper().startswith(SNOWFLAKE_ONLY)]
    con.execute("\n".join(kept))


def main():
    con = duckdb.connect()
    run_file(con, "01_schema.sql")
    for table, csv in [("PI_RAW.REPORT_USAGE_OBSERVATIONS", "observations.csv"),
                       ("PI_RAW.QUARANTINED_ROWS", "rejected_rows.csv")]:
        path = (PROCESSED / csv).as_posix()
        con.execute(f"INSERT INTO {table} SELECT * FROM read_csv('{path}', header=true, all_varchar=true)")

    for name in ["03_core_views.sql", "04_cost_allocation.sql",
                 "05_rankings_and_flags.sql", "06_reconciliation.sql"]:
        run_file(con, name)

    print("\nReconciliation checks")
    print(con.sql("SELECT check_name, expected, actual, status FROM PI_CORE.V_RECONCILIATION"))
    failed = con.sql("SELECT COUNT(*) FROM PI_CORE.V_RECONCILIATION WHERE status = 'FAIL'").fetchone()[0]

    print("Platform cost summary")
    print(con.sql("SELECT * FROM PI_CORE.V_COST_SUMMARY"))

    # Cross-check: SQL results must equal the Node ETL's reports.json, report by report
    js = {r["report_id"]: r for r in json.loads((PROCESSED / "reports.json").read_text(encoding="utf-8"))}
    rows = con.sql("""
        SELECT c.report_id, c.total_credits, c.total_views, o.latest_known_owner,
               h.refresh_failure_rate, h.max_load_time_sec
        FROM PI_CORE.V_REPORT_COST c
        JOIN PI_CORE.V_REPORT_OWNERSHIP o ON o.report_id = c.report_id
        JOIN PI_CORE.V_REPORT_HEALTH    h ON h.report_id = c.report_id
    """).fetchall()
    mismatches = 0
    for rid, credits, views, owner, fail_rate, max_lat in rows:
        j = js[rid]
        same = (abs(float(credits) - j["total_credits"]) < 0.01
                and views == j["total_views"]
                and owner == j["latest_known_owner"]
                and abs(float(fail_rate or 0) - (j["refresh_failure_rate"] or 0)) < 1e-4
                and abs(float(max_lat) - j["max_load_time_sec"]) < 1e-9)
        if not same:
            mismatches += 1
            print("MISMATCH", rid)
    print(f"Cross-check SQL vs Node ETL: {len(rows) - mismatches}/{len(rows)} reports identical")

    ok = failed == 0 and mismatches == 0 and len(rows) == len(js)
    print("RESULT:", "ALL CHECKS PASSED" if ok else "FAILURES FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()