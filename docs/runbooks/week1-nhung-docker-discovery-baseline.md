# Week 1 Docker discovery baseline

Recorded: 2026-10-31<br>
Plan: [Week 1 Nhung Docker discovery plan](week1-nhung-docker-discovery-plan.md)
Scope: Step A only. This is a read-only inventory and baseline; no project data was changed and no service was stopped.

## Git starting point

- Branch: `w2-fulfillment-ops`
- HEAD: `57b8051f1cf1445ab3a25f118c884ca5d2745302` (`feat backend: complete fulfillment operations and retention`), matching the plan's stated starting commit.
- Initial worktree: the discovery plan itself was untracked; no other changes were reported.

## Runtime and operations inventory

| Area | Observed state | Local-to-Docker implication |
| --- | --- | --- |
| Frontend | No `frontend/` directory or frontend package manifest found. | Frontend remains to be added in a later step. |
| Backend | Express app in `backend/`; `PORT` defaults to `4000`; startup requires MongoDB URI, session secret, and app origin. | Backend currently has no Compose service. |
| MongoDB | Compose declares `mongo:8.2.7`, replica set `rs0`, port `27017`, and external volume `rewear-mongo-data`. | This is existing persistent data; do not use it for destructive tests or test restore. |
| Mail | Compose declares Mailpit with SMTP `1025` and UI `8025`. Backend example config uses `SMTP_HOST=localhost`, `SMTP_PORT=1025`. | In Compose, the backend will need the Mailpit service hostname instead of `localhost`. |
| Uploads | `backend/uploads/` is ignored by Git and contained one file at inventory time. | Media persistence must be mounted consistently for backend and maintenance jobs. File contents were not inspected. |
| Tests and maintenance | `npm test`, `start`, `dev`, `seed`, `audit:fulfillment-data`, `migrate:fulfillment-data`, and `retention:cases` are backend npm scripts. `caseRetention` and `vnpayReconciliation` jobs and a VNPAY worker exist in source. | These commands currently depend on Node/npm; migration also needs MongoDB Database Tools (`mongorestore`, noted in the plan). VNPAY remains disabled/out of scope. |
| Tunnel | No tunnel process was visible in the process listing. | Process inventory is only a point-in-time observation; do not infer that no tunnel configuration exists. |

The initial sandboxed process/socket inspection was restricted and did not show project processes or ports. A later Docker-enabled read-only inspection during Step B refined that finding: `rewear-circle-src-mongo-1` and `rewear-circle-src-mailpit-1` are running; MongoDB publishes `27017`, Mailpit publishes `1025` and `8025`. The frontend's planned `3000` host port is already published by another running project container, so it will need a separate port or an explicit conflict resolution. The backend API process and VNPAY reconciliation worker are also running on the host; exact PIDs and implications are recorded in the [Step B restore report](week1-nhung-docker-data-restore-check.md). No process was stopped. The sandboxed socket check itself remains unavailable.

### Configuration names (values intentionally omitted)

Names found in `backend/.env.example` and source: `PORT`, `SESSION_SECRET`, `NODE_ENV`, `MONGODB_URI`, `APP_ORIGIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `VNPAY_ENABLED`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `VNPAY_IPN_URL`, and `VNPAY_QUERY_SERVER_IP`. The ignored `backend/.env` has the same declared names; no values were read into this report.

Compose currently publishes MongoDB `27017`, Mailpit SMTP `1025`, and Mailpit UI `8025` without localhost-only host bindings or service health checks. The sample backend config uses browser origin `http://localhost:3000` and MongoDB `127.0.0.1:27017/rewear_circle?replicaSet=rs0&directConnection=true`; both need review when services move into Compose. The external Mongo volume is named `rewear-mongo-data`.

## DISC ownership and evidence

The old Khanh listing plan still described DISC-01 search/filter/pagination as missing and left its owner unresolved. That is stale against the current code:

- `backend/src/routes/commerce.js` implements `GET /api/v1/listings` with filters, auth for filtered requests, approved visible available listings, stable newest-first ordering, and page/limit/total metadata.
- The same router implements `GET /api/v1/listings/:id` and returns `canBuy` plus a SOLD watermark.
- `backend/src/domain/discoveryRules.js` parses and validates discovery filters; `backend/test/domain.test.js` covers paging and literal search escaping.

Per the Week 1 plan, DISC is assigned to Nhung for this Docker/discovery handoff. The old plan is updated to record the existing implementation and remove the duplicate/open assignment.

## Baseline checks

| Check | Result | Notes |
| --- | --- | --- |
| `node test/domain.test.js` | PASS, 8/8 | Includes discovery filter validation. |
| `node test/vnpay.test.js` | PASS, 4/4 | Unit tests only; this does not mean VNPAY is enabled or sandbox-verified. |
| `node test/observability.test.js` | BLOCKED, 1 test | Test server could not bind `0.0.0.0`; Node returned `listen EPERM` under this environment. This is an environment restriction, not evidence of an application assertion failure. |
| `node test/commerce-flow.test.js` | SKIP, 1 | `MONGODB_TEST_URI` is not set; requires a dedicated replica-set database ending in `_test`. |
| `node test/moderation-flow.test.js` | SKIP, 1 | Same missing dedicated test URI. |
| `node test/retention.test.js` | SKIP, 1 | Same missing dedicated test URI. |
| `npm test` | BLOCKED | The script uses `&&`; it stopped at the observability bind restriction before reaching integration suites. The suites were invoked individually afterward and reported above. |

## Follow-up before Docker implementation

1. Re-run the observability suite in an environment permitted to bind a local test socket.
2. Provide an isolated MongoDB replica-set test service/database ending in `_test`; never point test suites at `rewear-mongo-data` or the project database.
3. Inspect active containers and listening ports from a Docker-enabled host session before selecting host bindings or stopping any process.
4. Resolve Compose service DNS for the replica-set member, backend Mongo URI, Mailpit host, and frontend-to-backend rewrite during the implementation steps.
