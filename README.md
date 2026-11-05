# Rewear Circle

Rewear Circle is a marketplace for second-hand clothing. The repository keeps the Express API in `backend/` and adds a Next.js App Router frontend in `frontend/`.

## Structure

- `backend/` — Express API, MongoDB models, scripts, and tests.
- `frontend/` — Next.js frontend. In Docker, Nginx routes `/api/v1/*` directly to the API and other requests to Next.js. The Next.js rewrite remains available for host-side development.
- `docs/` — architecture, API contracts, and runbooks.

## Configuration

Copy `.env.example` to the root `.env` and set a private `SESSION_SECRET` before Compose startup. Retention defaults to `RETENTION_MODE=dry-run`; change it to `apply` only after checking the target database and backup workflow. For host-side backend development, copy `backend/.env.example` to `backend/.env`. Keep both `.env` files, uploads, backups, and `node_modules` out of images and Git. In containers, provide configuration through environment variables; the backend loads `.env` only when that file exists.

The frontend rewrite uses `API_UPSTREAM` (default `http://localhost:4000`). A Compose build should set it to the backend service address, for example `http://backend:4000`.

## Build images

Build each image from its own context. Dependencies are installed in the Node 24 image from the checked-in lockfiles:

```sh
docker build -t rewear-circle-backend ./backend
docker build --build-arg API_UPSTREAM=http://backend:4000 -t rewear-circle-frontend ./frontend
```

The backend image contains source and test code, but not `.env`, uploads, or host `node_modules`. The frontend runtime image contains the Next.js standalone build only.

If a dev container bind-mounts source at `/app`, it must mount a separate volume at `/app/node_modules`; never mount host `node_modules`.

## Runtime

Always combine `compose.yaml` and `compose.operations.yaml` for the supported Docker runtime. Compose uses the `rewear-circle-src` project name with the `rewear_circle_demo` database and explicitly named `rewear-circle-demo-*` data volumes. Changing the project name does not migrate data from the existing `rewear-mongo-data` volume.

Nginx publishes `http://localhost:3001`; frontend, backend, MongoDB and SMTP use internal ports. Mailpit is at `http://localhost:8026`. Use `localhost` so the browser origin matches session and Origin checks. Nginx overwrites client-supplied forwarded headers; the API explicitly trusts one hop through `TRUST_PROXY_HOPS=1`, independently of `NODE_ENV`. The HTTP demo keeps `NODE_ENV=development`.

The frontend home page is the DISC feed and `/listings/{listingId}` is the public detail view. Guests can browse, search, filter, and open public listing details without signing in. Cart, checkout, selling, and reporting keep their existing account and email-verification requirements. The demo seed includes a verified buyer and seller for local acceptance.

Start and check the runtime:

```sh
docker compose -f compose.yaml -f compose.operations.yaml --profile retention up --build -d --wait backend frontend retention-scheduler
docker compose -f compose.yaml -f compose.operations.yaml up -d --no-deps --force-recreate --wait gateway
docker compose -f compose.yaml -f compose.operations.yaml --profile retention ps
docker compose -f compose.yaml -f compose.operations.yaml logs --tail=100 backend gateway retention-scheduler
```

Stop services without removing their containers or volumes:

```sh
docker compose -f compose.yaml -f compose.operations.yaml --profile retention stop
```

Do not use `docker compose down -v` as a normal stop command; it removes named volumes and their data.

Recreate `gateway` after backend/frontend containers are replaced so Nginx resolves their current addresses. The first startup command respects the current `RETENTION_MODE` in the root `.env`; `apply` starts a retention cycle immediately.

## Development and operations

Compose profiles keep test, maintenance, restore, and scheduled retention services out of the default runtime:

```sh
# Hot reload at http://localhost:3011
docker compose -f compose.yaml -f compose.operations.yaml --profile dev up --build -d --wait backend-dev frontend-dev
docker compose -f compose.yaml -f compose.operations.yaml --profile dev up -d --no-deps --force-recreate --wait gateway-dev
docker compose -f compose.yaml -f compose.operations.yaml --profile dev stop gateway-dev backend-dev frontend-dev

# Serial test suites against a private MongoDB replica set and _test database
docker compose -f compose.yaml -f compose.operations.yaml --profile test run --build --rm test-runner

# Explicit seed on the demo database; never runs at startup
docker compose -f compose.yaml -f compose.operations.yaml run --rm backend npm run seed

# Read-only audit and dry-runs
docker compose -f compose.yaml -f compose.operations.yaml --profile ops run --build --rm maintenance npm run audit:fulfillment-data
docker compose -f compose.yaml -f compose.operations.yaml --profile ops run --build --rm maintenance npm run migrate:fulfillment-data
docker compose -f compose.yaml -f compose.operations.yaml --profile ops run --build --rm maintenance npm run retention:cases -- --dry-run
```

## Retention and logs

The scheduler runs immediately and then approximately every 24 hours; failures are retried after 10 minutes. For an `apply` cycle with work to do, it verifies a fresh MongoDB/media backup before the first batch. Backup failure prevents apply. Cases must be closed for 12 calendar months UTC before sensitive content is redacted. Evidence kept for another Case is rechecked after its last reference disappears; active/recent Cases and Listing/Order references remain protected. Each batch deletes at most 100 files; `eligibleMediaRemaining` and `pendingMediaRemaining` keep the scheduler draining the queue.

API and retention JSONL files are stored in the `rewear-circle-src-technical-logs` volume at `/app/logs`, with owner-only file permissions. They retain the current UTC date and the preceding 29 UTC dates, cleaned on the first log of a new day and by the daily scheduler. Docker diagnostic logs use `json-file`, `max-size=10m`, `max-file=3`; this size cap is separate from the 30-day file-log policy. MongoDB AuditEvent and financial records follow their own business policies.

```sh
docker compose -f compose.yaml -f compose.operations.yaml exec -T backend ls -l /app/logs
docker compose -f compose.yaml -f compose.operations.yaml exec -T retention-scheduler printenv RETENTION_MODE
docker compose -f compose.yaml -f compose.operations.yaml exec -T retention-scheduler cat /app/logs/retention-health.json
```

See the [current backend operations runbook](docs/runbooks/backend-fulfillment-operations.md) for backup and activation, and [isolated backend acceptance](docs/runbooks/backend-acceptance.md) for regression, gateway and restore checks. Week 1 runbooks record historical verification of the base Compose setup. VNPAY, 15-minute reservations and early Case deletion remain deferred; no VNPAY worker or tunnel is part of the runtime.

See [DISC acceptance report](docs/runbooks/week1-nhung-docker-discovery-check.md) for the API visibility matrix, UI smoke results, and test evidence.
