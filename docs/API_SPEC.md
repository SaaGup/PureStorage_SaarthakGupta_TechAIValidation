# Pure Insights Command Centre: REST API and WebSocket Specification

Version 1 · Base URL `http://localhost:4000/api/v1` · WebSocket `ws://localhost:4000/ws`

All examples below are real responses captured from the running server against the case-study dataset (some arrays shortened).

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Format | JSON in, JSON out. Request bodies must be `Content-Type: application/json` and at most 10 KB. |
| Naming | `snake_case` fields; money in USD with a `_usd` suffix; durations in seconds with a `_sec` suffix; shares and rates are fractions (0.2961 = 29.61%). |
| Errors | Every error uses one shape: `{ "error": { "code": "...", "message": "..." } }` |
| Versioning | The version is in the path (`/api/v1`). Breaking changes would ship as `/api/v2`. |
| Rate limits | 300 requests per minute per IP on `/api/*`; 10 login attempts per 15 minutes per IP. Both are configurable (`RATE_LIMIT_API_PER_MIN`, `RATE_LIMIT_LOGIN_PER_15_MIN`). Limit headers follow the IETF `RateLimit` draft-7 format. |
| Security headers | Helmet defaults (CSP, `X-Content-Type-Options: nosniff`, frame protection). `X-Powered-By` is removed. |

### Status codes

| Code | `error.code` | When |
|---|---|---|
| 200 | | Success |
| 204 | | Success, no body (logout) |
| 400 | `BAD_REQUEST` | Invalid query parameter or body, malformed JSON |
| 401 | `UNAUTHORIZED` | No session, or the token is invalid, forged or expired |
| 403 | `FORBIDDEN` | Signed in, but the role lacks the permission |
| 404 | `NOT_FOUND` | Unknown route, or a report or alert the user may not see (see 3.2) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL` | Unexpected error (details are logged on the server, never returned) |

```json
{ "error": { "code": "BAD_REQUEST", "message": "sort must be one of: report_id, report_name, total_views, ..." } }
```

---

## 2. Authentication

**Mechanism:** a JWT (HS256, algorithm pinned on verification) signed with `JWT_SECRET`, valid for `SESSION_TTL_HOURS` (default 8).

The token is delivered two ways:

1. **Session cookie `pi_session`** for the browser: `HttpOnly` (page scripts cannot read it), `SameSite=Strict` (not sent cross-site, which blocks CSRF), `Secure` in production. The dashboard relies only on this cookie and never stores a token in JavaScript.
2. **`Authorization: Bearer <token>`** for API clients (curl, Postman, tests).

The token carries identity and role only. Permissions are looked up on every request, so a role change applies immediately.

Passwords are compared with bcrypt. An unknown email and a wrong password return the same 401 and take the same time, so the API does not reveal which accounts exist.

### `POST /auth/login`
Request:
```json
{ "email": "admin@pureinsights.local", "password": "pureinsights-demo" }
```
Response `200` (also sets the `pi_session` cookie):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "email": "admin@pureinsights.local",
    "name": "Platform Admin",
    "role": "admin",
    "permissions": ["reports:read:all", "reports:read:own", "costs:read", "orphans:read",
                    "quality:read", "alerts:read", "alerts:ack", "replay:control"]
  }
}
```
Errors: `400` (missing or oversized fields), `401` (`Invalid email or password`), `429`.

### `POST /auth/logout`
Clears the cookie. Response `204`.

### `GET /auth/me`
Returns the current user, including `expiresAt` (epoch ms). `401` if not signed in.

---

## 3. Authorization (RBAC)

### 3.1 Roles and permissions

Routes check **permissions**, never role names, so adding a role is a one-line change in `server/src/auth/roles.js`.

| Permission | admin | analyst | owner | viewer |
|---|:-:|:-:|:-:|:-:|
| `reports:read:all` (every report) | ✓ | ✓ | | ✓ |
| `reports:read:own` (only reports you own) | ✓ | | ✓ | |
| `costs:read` (cost fields and endpoints) | ✓ | ✓ | ✓ | |
| `orphans:read` | ✓ | ✓ | | |
| `quality:read` | ✓ | ✓ | | |
| `alerts:read` (REST and WebSocket) | ✓ | ✓ | ✓ | ✓ |
| `alerts:ack` | ✓ | ✓ | ✓ | |
| `replay:control` | ✓ | | | |

### 3.2 Three levels of enforcement

| Level | Rule | Example |
|---|---|---|
| Endpoint | Missing permission gives `403` | A viewer calling `/costs/summary` |
| Row | An owner sees only reports whose `latest_known_owner` is their email. This applies to REST and to every WebSocket message. | `user_3@company.com` sees 11 of 100 reports |
| Field | Without `costs:read`, every money field is removed from reports and observations, and cost fields cannot be used for sorting (`400`) | A viewer sees reports without `total_cost_usd` |

A report the user may not see returns **404, not 403**, so the API does not confirm that another team's report ID exists.

---

## 4. Endpoints

### 4.1 `GET /health` (public)
Liveness probe.
```json
{ "status": "ok", "uptime_sec": 4, "data_loaded_at": "2026-10-13T14:09:52.971Z" }
```
In **demo mode** only (development, with no `DEMO_PASSWORD` configured) the response also includes `"demo": { "password": "pureinsights-demo" }`, so the login screen can pre-fill the public demo password. A password someone configured is never returned, and demo mode never runs in production.

### 4.2 `GET /overview` (any signed-in user)
Headline KPIs, scoped to what the user can see (`scope` is `platform` or `own_reports`). `costs` is present only with `costs:read`.
```json
{
  "scope": "platform",
  "dataLoadedAt": "2026-10-13T14:09:52.971Z",
  "health": {
    "reports": 100, "observations": 1976,
    "refresh_failure_rate": 0.2961,
    "unknown_status_observations": 98,
    "refresh_status_breakdown": { "SUCCESS": 1322, "FAILED": 379, "TIMED_OUT": 177, "UNKNOWN": 98 },
    "latency_tier_breakdown": { "ok": 506, "warning": 569, "high": 729, "critical": 172 },
    "latency_breach_rate": 0.7439, "avg_load_time_sec": 27.85, "max_load_time_sec": 55,
    "orphaned_observations": 242, "reports_with_orphaned_observations": 94
  },
  "costs": {
    "reports": 100, "total_views": 1486905, "total_credits": 1206352.48,
    "snowflake_cost_usd": 3619057.44, "aws_cost_usd": 455227.87, "total_cost_usd": 4074285.31,
    "unowned_cost_usd": 479753.6, "unowned_cost_share": 0.1178,
    "platform_cost_per_view_usd": 2.7401, "usd_per_credit_assumption": 3
  }
}
```
`refresh_failure_rate` = (FAILED + TIMED_OUT) / (observations − UNKNOWN). Unknown outcomes are not counted as failures.

### 4.3 `GET /reports` (`reports:read:all` or `reports:read:own`)
Paged, searchable, sortable list. Row- and field-level rules apply.

| Query | Type | Default | Notes |
|---|---|---|---|
| `search` | string ≤ 100 | | Matches report ID, name or latest owner (case-insensitive) |
| `ownership` | `orphaned` \| `owned` | | `orphaned` = has at least one unowned period |
| `sort` | field | `max_load_time_sec` | Allow-listed: `report_id, report_name, total_views, avg_load_time_sec, max_load_time_sec, breach_observations, refresh_failure_rate, orphaned_observations, distinct_owners`, plus `total_cost_usd, cost_per_view_usd, unowned_cost_usd, cost_rank` with `costs:read` |
| `order` | `asc` \| `desc` | `desc` | |
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1–100 | 25 | |

```json
{
  "items": [{
    "report_id": "RPT_215", "report_name": "Analytics Dashboard 16",
    "observations": 19, "orphaned_observations": 1,
    "latest_known_owner": "user_13@company.com", "distinct_owners": 11,
    "total_views": 13346, "avg_load_time_sec": 30.46, "max_load_time_sec": 55,
    "breach_observations": 17, "refresh_failure_rate": 0.2105, "unknown_status_observations": 0,
    "total_credits": 9432.99, "total_aws_cost_usd": 4977.59, "credits_per_view": 0.7068,
    "aws_cost_per_view": 0.373, "total_cost_usd": 33276.56, "unowned_cost_usd": 1095.47,
    "cost_per_view_usd": 2.4934, "cost_rank": 94, "recommended_action": "REVIEW_HOSTING"
  }],
  "page": 1, "pageSize": 1, "total": 100, "totalPages": 100
}
```

### 4.4 `GET /reports/:id`
One report plus its observations in file order (oldest first), for trend charts. `404` if the report doesn't exist **or** the user may not see it. Without `costs:read`, `snowflake_credits_consumed` and `aws_hosting_cost_usd` are removed from each observation.
```json
{
  "report": { "report_id": "RPT_223", "report_name": "Analytics Dashboard 24", "cost_rank": 1, "...": "..." },
  "observations": [{
    "source_row": 25, "report_id": "RPT_223", "owner_email": "user_10@company.com",
    "is_orphaned": false, "orphan_reason": null, "refresh_status": "SUCCESS", "status_known": true,
    "monthly_active_views": 40, "has_views": true, "snowflake_credits_consumed": 370.75,
    "avg_load_time_sec": 37.2, "latency_tier": "high", "aws_hosting_cost_usd": 188.51,
    "query_count_last_30d": 19443, "concurrent_user_peak": 55
  }]
}
```
`source_row` is the line number in the raw CSV, so any figure can be traced back to its source.

### 4.5 `GET /costs/summary` (`costs:read`)
Same shape as `overview.costs`, scoped by row-level rules (an owner gets their 11 reports only).

### 4.6 `GET /costs/reports` (`costs:read`)
Per-report cost attribution with ranking and flags. Mirrors `sql/04_cost_allocation.sql` and `sql/05_rankings_and_flags.sql`.

| Query | Values |
|---|---|
| `action` | `OK`, `REVIEW_HOSTING`, `OPTIMISE_QUERIES`, `NO_VIEWS` |
| `sort` | `cost_rank` (default, asc), `total_cost_usd`, `cost_per_view_usd`, `unowned_cost_usd`, `aws_cost_usd`, `total_views`, `report_id` |
| `search`, `order`, `page`, `pageSize` | as in 4.3 |

```json
{
  "items": [{
    "report_id": "RPT_295", "report_name": "Analytics Dashboard 96",
    "total_views": 8945, "total_queries": 313577, "total_credits": 12563.24,
    "snowflake_cost_usd": 37689.72, "aws_cost_usd": 3870.82, "total_cost_usd": 41560.54,
    "unowned_cost_usd": 2302.96, "credits_per_view": 1.404499, "cost_per_view_usd": 4.6462,
    "credits_per_query": 0.040064, "credit_share": 0.010414, "cost_rank": 46,
    "cumulative_cost_share": 0.5075, "is_cost_per_view_outlier": true,
    "is_aws_usage_mismatch": false, "recommended_action": "OPTIMISE_QUERIES"
  }],
  "page": 1, "pageSize": 1, "total": 2, "totalPages": 2
}
```
Rules:
- `cost = credits × USD_PER_CREDIT + AWS hosting cost`
- `cost_per_view = total cost / total views` (a weighted ratio, `null` when views = 0)
- `REVIEW_HOSTING`: AWS cost ≥ 75th percentile **and** views ≤ 25th percentile
- `OPTIMISE_QUERIES`: cost per view more than 1.5 × IQR above the 75th percentile (Tukey)

### 4.7 `GET /orphans` (`orphans:read`)
Reports with at least one unowned period, sorted by unowned spend.
```json
{
  "reports_affected": 94, "orphaned_observations": 242, "unowned_cost_usd": 479753.6,
  "items": [{
    "report_id": "RPT_204", "report_name": "Analytics Dashboard 5",
    "orphaned_observations": 6, "observations": 20, "orphaned_share": 0.3,
    "latest_known_owner": "user_4@company.com", "distinct_owners": 10,
    "unowned_cost_usd": 14582.21, "suggested_owner": "user_4@company.com"
  }]
}
```

### 4.8 `GET /quality` (`quality:read`)
The data quality log produced by the ETL.
```json
{
  "generated_by": "server/src/etl/run.js",
  "totals": { "input": 2000, "clean": 1976, "quarantined": 24 },
  "rules": [{
    "id": "R2", "title": "Orphaned owner (nan / ORPHANED_REPORT / empty)",
    "action": "Keep row, set owner_email = null, is_orphaned = true",
    "why": "Orphaned reports are a business finding the dashboard must show, so the rows are kept and flagged, not deleted.",
    "detected_in_raw": 245, "rows_affected": 242
  }]
}
```

### 4.9 `GET /alerts` (`alerts:read`)
Recent alerts held in memory (newest first, capped at `ALERT_BUFFER_SIZE`), scoped by row-level rules.

| Query | Values | Default |
|---|---|---|
| `status` | `open`, `acknowledged`, `all` | `all` |
| `severity` | `warning`, `high`, `critical` | |
| `type` | `LATENCY_BREACH`, `REFRESH_FAILURE` | |
| `limit` | 1–500 | 100 |

```json
{
  "total": 20,
  "items": [{
    "id": "bdaef2c1-a0c2-497b-ad42-11cd267044f8",
    "type": "LATENCY_BREACH", "severity": "high",
    "value": 47.3, "threshold": 15,
    "message": "Analytics Dashboard 18 loaded in 47.3s (threshold 15s)",
    "report_id": "RPT_217", "report_name": "Analytics Dashboard 18",
    "owner": "user_6@company.com", "source_row": 19,
    "created_at": "2026-10-13T14:09:56.625Z",
    "suppressed_since_last": 0,
    "acknowledged": false, "acknowledged_by": null, "acknowledged_at": null
  }]
}
```

### 4.10 `GET /alerts/stats` (`alerts:read`)
```json
{
  "total": 20, "open": 20,
  "by_severity": { "warning": 6, "high": 13, "critical": 1 },
  "by_type": { "LATENCY_BREACH": 16, "REFRESH_FAILURE": 4 },
  "engine": { "evaluated": 18, "fired": 20, "suppressed": 0 }
}
```
`by_severity` counts open alerts only.

### 4.11 `POST /alerts/:id/ack` (`alerts:ack`)
Acknowledges an alert. Idempotent: acknowledging twice keeps the first user and time. The change is **broadcast to every connected dashboard** over the WebSocket (`alert_ack`). `404` if the alert doesn't exist or belongs to a report the user may not see.

### 4.12 Replay control
| Method | Path | Permission | Result |
|---|---|---|---|
| GET | `/replay` | `alerts:read` | Status |
| POST | `/replay/start` | `replay:control` | Starts streaming, returns status |
| POST | `/replay/stop` | `replay:control` | Pauses, returns status |

```json
{ "running": true, "position": 18, "total": 1976, "cycles_completed": 0, "interval_ms": 200, "loop": true }
```

---

## 5. Alerting rules

| Type | Fires when | Severity |
|---|---|---|
| `LATENCY_BREACH` | `avg_load_time_sec` **>** `LATENCY_WARNING_SEC` (15) | `warning` (over 15s), `high` (30s or more), `critical` (50s or more) |
| `REFRESH_FAILURE` | `refresh_status` is `FAILED` or `TIMED_OUT` | `high` |
| (none) | `refresh_status` is `UNKNOWN` | No alert: the outcome is unknown, not a failure |

**Noise control.** The same alert type for the same report is suppressed for `ALERT_COOLDOWN_SEC` (60s), **unless the severity escalates**. The next alert that fires reports `suppressed_since_last`, so suppressed events are counted, never lost. This matters for this dataset: 74% of observations exceed 15s, so alerting on every breach would be noise.

All thresholds come from configuration, and the server sends them to the dashboard in the WebSocket `hello` message, so the UI never hard-codes them.

---

## 6. WebSocket

### 6.1 Connection
`ws://<host>/ws` (path set by `WS_PATH`). The server checks the upgrade request **before** accepting the connection:

| Check | Failure |
|---|---|
| Path matches `WS_PATH` | HTTP 404 |
| `Origin` (when sent) is in `CLIENT_ORIGINS`. This blocks cross-site WebSocket hijacking. | HTTP 403 |
| Valid session: the `pi_session` cookie (browsers send it automatically) or `Authorization: Bearer` | HTTP 401 |
| Permission `alerts:read` | HTTP 403 |

No token is ever placed in the URL, where it would end up in logs.

### 6.2 Server → client messages

Every message is JSON with a `type`. Row-level security applies to each one: an owner only receives events for their own reports.

| `type` | When | Payload |
|---|---|---|
| `hello` | Right after connecting | `user`, `thresholds`, `replay`, up to 50 recent `alerts`, the last 90 `telemetry` readings (so charts start full) |
| `telemetry` | Every replayed observation | `data`: one reading |
| `alert` | An alert fires | `alert` (same shape as 4.9) |
| `alert_ack` | Someone acknowledges an alert | `alert` with `acknowledged_by` and `acknowledged_at` |
| `replay_status` | The feed is started or paused | `status` (same shape as 4.12) |
| `pong` | Reply to a client `ping` | `at` |

`hello`:
```json
{
  "type": "hello",
  "user": { "email": "admin@pureinsights.local", "role": "admin" },
  "thresholds": { "latency": { "warning": 15, "high": 30, "critical": 50 }, "cooldown_sec": 60 },
  "replay": { "running": true, "position": 58, "total": 1976, "cycles_completed": 0, "interval_ms": 200, "loop": true },
  "alerts": [ { "id": "8a65c340-...", "type": "LATENCY_BREACH", "severity": "warning", "...": "..." } ],
  "telemetry": [ { "report_id": "RPT_200", "avg_load_time_sec": 44.8, "latency_tier": "high", "...": "..." } ]
}
```
`telemetry`:
```json
{
  "type": "telemetry",
  "data": {
    "report_id": "RPT_258", "report_name": "Analytics Dashboard 59",
    "avg_load_time_sec": 20.1, "latency_tier": "warning", "refresh_status": "SUCCESS",
    "source_row": 60, "alerts_fired": 1, "at": "2026-10-13T14:10:04.871Z"
  }
}
```
`alert`:
```json
{
  "type": "alert",
  "alert": {
    "id": "7eb5d76f-c96d-4a9f-a7d9-3f5c29c43171", "type": "LATENCY_BREACH", "severity": "warning",
    "value": 20.1, "threshold": 15,
    "message": "Analytics Dashboard 59 loaded in 20.1s (threshold 15s)",
    "report_id": "RPT_258", "report_name": "Analytics Dashboard 59", "owner": "user_11@company.com",
    "source_row": 60, "created_at": "2026-10-13T14:10:04.871Z", "suppressed_since_last": 0,
    "acknowledged": false, "acknowledged_by": null, "acknowledged_at": null
  }
}
```

### 6.3 Client → server messages
Only `{"type":"ping"}` is understood. Anything else is ignored. Messages larger than 4 KB close that socket with code **1009** without affecting other clients.

### 6.4 Close codes and reliability

| Code | Meaning | Client behaviour |
|---|---|---|
| 1000 | Normal close (page closed) | none |
| 1001 | Server shutting down | Reconnect with backoff |
| 1009 | Message too big | Fix the client |
| **4001** | **Session expired** (the socket closes when the JWT expires) | Return to sign-in |

- **Heartbeat:** the server pings every `WS_HEARTBEAT_SEC` (30s) and drops clients that don't answer (closed laptop, lost network).
- **Backpressure:** if a client falls more than 1 MB behind, telemetry for that client is skipped. Alerts are always delivered.
- **Reconnect:** the dashboard retries after 1s, 2s, 4s and so on up to 30s, with ±25% jitter, and merges the alerts in the next `hello` without duplicates.

---

## 7. Configuration reference

Every value is set in `server/.env` (see `server/.env.example`). Nothing is hard-coded.

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | random per process (dev) | Token signing key, 32+ characters. **Required in production.** |
| `DEMO_PASSWORD` | `pureinsights-demo` (dev only) | Demo account password. **Required in production.** |
| `PORT` | 4000 | HTTP and WebSocket port |
| `CLIENT_ORIGINS` | `http://localhost:5173,http://localhost:4000` | Allowed browser origins (CORS and WebSocket Origin check) |
| `SESSION_TTL_HOURS` | 8 | JWT and cookie lifetime |
| `TRUST_PROXY` | false | Set to true behind a load balancer |
| `RATE_LIMIT_API_PER_MIN` / `RATE_LIMIT_LOGIN_PER_15_MIN` | 300 / 10 | Rate limits |
| `USD_PER_CREDIT` | 3 | Assumed Snowflake credit price |
| `LATENCY_WARNING_SEC` / `_HIGH_SEC` / `_CRITICAL_SEC` | 15 / 30 / 50 | Alert tiers (validated: warning < high < critical) |
| `ALERT_COOLDOWN_SEC` / `ALERT_BUFFER_SIZE` | 60 / 500 | Noise control and memory cap |
| `REPLAY_INTERVAL_MS` / `REPLAY_AUTOSTART` / `REPLAY_LOOP` / `REPLAY_HISTORY_SIZE` | 1000 / true / true / 90 | Telemetry simulator |
| `WS_PATH` / `WS_HEARTBEAT_SEC` | `/ws` / 30 | WebSocket |
| `RAW_DATA_FILE`, `DATA_DIR`, `DOCS_DIR`, `USERS_FILE`, `CLIENT_DIST_DIR` | repo paths | File locations |

Invalid configuration stops the server at startup with a clear message, never later at runtime.