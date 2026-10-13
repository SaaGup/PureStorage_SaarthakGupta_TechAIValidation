# Data Quality Log

Generated automatically by `npm run etl`. Raw data in `data/raw/` is never modified.

- Input rows: **2000**
- Clean rows kept: **1976**
- Rows quarantined: **24** (see `data/processed/rejected_rows.csv`)
- Credits excluded by quarantine rule R4: **-161.04**
- Distinct reports: **100**

| Rule | Issue | Detected in raw | Rows affected | Action | Why |
|---|---|---:|---:|---|---|
| R1 | Unparseable or missing numeric field | 0 | 0 | Quarantine row | A row we cannot read as numbers cannot be used for cost or latency maths. |
| R2 | Orphaned owner (nan / ORPHANED_REPORT / empty) | 245 | 242 | Keep row, set owner_email = null, is_orphaned = true | Orphaned reports are a business finding the dashboard must show, so the rows are kept and flagged, not deleted. |
| R3 | Malformed owner email (present but not an email) | 0 | 0 | Quarantine row | An owner string that is neither a marker nor an email is a data-entry error. |
| R4 | Negative snowflake_credits_consumed | 24 | 24 | Quarantine row (excluded from cost allocation) | Credits consumed cannot be negative. They are errors or billing adjustments, so they must not reduce a report's cost. |
| R5 | Impossible latency (<= 0 seconds) | 0 | 0 | Quarantine row | A page cannot load in zero or negative time. |
| R6 | Latency above the 15s alert threshold | 1490 | 1470 | Keep row, tag latency_tier (warning/high/critical) | Spikes up to 55s are real events the alerting engine must catch. Removing them would hide the problem. |
| R7 | last_refresh_status = UNKNOWN | 100 | 98 | Keep row, status_known = false | We cannot tell if the refresh failed, so it is counted separately and excluded from the failure rate. |
| R8 | Unrecognised refresh status value | 0 | 0 | Quarantine row | Only SUCCESS, FAILED, TIMED_OUT and UNKNOWN are valid. |
| R9 | Zero monthly_active_views | 4 | 4 | Keep row, has_views = false | Cost-per-view would divide by zero. Flagged so SQL can use NULLIF and the UI can show 'no views'. |
| R10 | Exact duplicate row | 0 | 0 | Quarantine the later copy | Duplicates double-count cost. |
| R11 | Negative or non-integer count fields | 0 | 0 | Quarantine row | Views, queries and concurrent users must be non-negative whole numbers. |
| R12 | Negative aws_hosting_cost_usd | 0 | 0 | Quarantine row | Hosting cost cannot be negative. |

Rules R2, R6, R7 and R9 *flag* rows that stay in the dataset. All other rules *quarantine* rows.

**Detected in raw** counts every raw row showing the issue. **Rows affected** is what the rule did. They differ for flag rules because a row is quarantined once, by the first rule it fails, and is then not flagged (e.g. 3 orphaned rows also had negative credits, so they sit in quarantine under R4).
