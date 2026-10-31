# Week 1 Docker Compose runtime check

Recorded: 2026-10-31<br>
Plan: [Week 1 Nhung Docker discovery plan](week1-nhung-docker-discovery-plan.md)
Result: Step D runtime started and verified in an isolated demo project.

## Isolation and endpoints

- Compose project: `rewear-circle-demo`.
- Active database: `rewear_circle_demo`.
- Mongo volume: `rewear-circle-demo-mongo-data`.
- Media volume: `rewear-circle-demo-media`, mounted at `/app/uploads` for the backend and its one-off seed/maintenance commands.
- Host ports: frontend `127.0.0.1:3001`, Mailpit UI `127.0.0.1:8026`. MongoDB, backend API, and SMTP have no host port binding.
- The old `rewear-mongo-data` volume and `rewear-circle-src` Mongo/Mailpit services were left running and were not mounted by this Compose project. Existing port use at `3000`, `27017`, `1025`, and `8025` is avoided.
- Root `.env` contains a newly generated session secret, mode `0600`, and is ignored by Git. No value is recorded here.

## Runtime behavior

- `mongo` uses `rs0`; the health check waits for MongoDB to answer. `mongo-init` initializes only an uninitialized replica set using member hostname `mongo:27017` and waits for PRIMARY. If it finds a different existing configuration, it exits without changing it.
- Backend starts only after `mongo-init` succeeds, connects to `mongo:27017/rewear_circle_demo`, and reports healthy only when `/health/ready` sees MongoDB.
- Frontend waits for the backend health check and rewrites `/api/v1/*` to `http://backend:4000`.
- Backend SMTP points to `mailpit:1025`. Demo origin is `http://localhost:3001`; `NODE_ENV=development` keeps HTTP demo session cookies non-Secure while the existing Origin check still requires the exact origin.
- MongoDB and media use named volumes. Services restart unless stopped. Each service uses Docker's `json-file` log driver with 10 MB per file and 3 files (30 MB total per container); this size cap does not guarantee 30 days of logs.
- No VNPAY service or worker was added to Compose; `VNPAY_ENABLED=false`.

## Verification performed

| Check | Result |
| --- | --- |
| `docker compose config --quiet` | PASS |
| `docker compose up --build -d` | PASS after correcting the uninitialized replica-set response handling; all four long-running services became healthy. |
| Replica set | PASS; `rs0` PRIMARY reports `mongo:27017`. Repeated Compose recreation validates the existing member and leaves its config unchanged. |
| Transaction smoke | PASS in a separate `_test` database; insert was aborted and 0 test rows remained. |
| Backend and frontend | PASS; `/health/ready` and frontend health checks passed. |
| Session and filtered discovery through frontend | PASS; login returned a session cookie without `Secure`, filtered feed returned 3 seeded listings, and `/api/v1/me` succeeded through the rewrite. |
| SMTP to Mailpit | PASS; a demo registration returned 201 and its verification message appeared in Mailpit. The subsequent full Compose recreation reset Mailpit's in-memory messages, as expected for this unpersisted development service. |
| Recreate persistence | PASS; after `docker compose up -d --force-recreate`, the previous session remained valid, `rewear_circle_demo` still had 4 users, 5 listings, 2 Media records, and `seed-demo.png` remained in the media volume. |

The seed was run explicitly after startup against the new demo database; it is not part of container startup. A temporary test database from the transaction smoke is separate from the application database. A mistakenly populated `rewear_circle` database inside the new demo volume was dropped only after confirming its contents were the demo seed/smoke data; the active application database is now only `rewear_circle_demo`.

## Start and stop

From the repository root, with the root `.env` prepared:

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100
docker compose stop
```

`stop` is the normal pause command and preserves both named volumes. Do not use `docker compose down -v` to stop the runtime.

This is a clean demo runtime, not a migration of existing project data. The final transfer backup and controlled stop of the old local writers remain gated until the Docker runtime is accepted, as recorded in the Step B report.
