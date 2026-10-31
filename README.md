# Rewear Circle

Rewear Circle is a marketplace for second-hand clothing. The repository keeps the Express API in `backend/` and adds a Next.js App Router frontend in `frontend/`.

## Structure

- `backend/` — Express API, MongoDB models, scripts, and tests.
- `frontend/` — Next.js frontend. `/api/v1/*` is rewritten to `API_UPSTREAM`.
- `docs/` — architecture, API contracts, and runbooks.

## Configuration

Copy `.env.example` to the root `.env` and set a private `SESSION_SECRET` before Compose startup. For host-side backend development, copy `backend/.env.example` to `backend/.env`. Keep both `.env` files, uploads, backups, and `node_modules` out of images and Git. In containers, provide configuration through environment variables; the backend loads `.env` only when that file exists.

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

Compose uses a new project, `rewear_circle_demo` database, database volume, and media volume. It does not mount the existing `rewear-mongo-data` volume. MongoDB, backend, and SMTP are reachable only on the Compose network; the frontend is at `http://localhost:3001` and Mailpit at `http://localhost:8026`. Use `localhost` for the frontend so its origin matches the backend session and Origin checks. Each container log is capped at 30 MB; that size cap does not guarantee a 30-day retention period.

The frontend home page is the DISC feed and `/listings/{listingId}` is the public detail view. Guests can browse the feed; search and filters require a signed-in session. The demo seed includes a verified buyer and seller for local acceptance.

Start and check the runtime:

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100
```

Stop services without removing their containers or volumes:

```sh
docker compose stop
```

Do not use `docker compose down -v` as a normal stop command; it removes named volumes and their data.

## Development and operations

Compose profiles keep test, maintenance, restore, and scheduled retention services out of the default runtime:

```sh
# Hot reload at http://localhost:3011
docker compose --profile dev up --build -d backend-dev frontend-dev
docker compose --profile dev stop backend-dev frontend-dev

# Serial test suites against a private MongoDB replica set and _test database
docker compose --profile test run --rm test-runner

# Explicit seed on the demo database; never runs at startup
docker compose run --rm backend npm run seed

# Read-only audit and dry-runs
docker compose --profile ops run --rm maintenance npm run audit:fulfillment-data
docker compose --profile ops run --rm maintenance npm run migrate:fulfillment-data
docker compose --profile ops run --rm maintenance npm run retention:cases -- --dry-run
```

See [Docker operations runbook](docs/runbooks/week1-nhung-docker-operations.md) for backup/restore, daily retention, verification results, and the VNPAY boundary. VNPAY remains disabled; no worker or tunnel is part of the runtime.

See [DISC acceptance report](docs/runbooks/week1-nhung-docker-discovery-check.md) for the API visibility matrix, UI smoke results, and test evidence.
