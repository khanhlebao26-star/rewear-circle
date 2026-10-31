# Week 1 Docker operations

Recorded: 2026-10-31 08:19 +07:00<br>
Plan: [Week 1 Nhung Docker discovery plan](week1-nhung-docker-discovery-plan.md)
Result: Step E commands run through Compose profiles; demo runtime remains active.

## Local-to-Docker command map

Run these commands from the repository root. Root `.env` must exist with a private `SESSION_SECRET`. `backups/` is ignored by Git and created with mode `700`; backup files are mode `600`.

| Operation | Docker command | Scope |
| --- | --- | --- |
| Build runtime images | `docker compose build backend frontend` | Build only; no services started. |
| Run development | `docker compose --profile dev up --build -d backend-dev frontend-dev` | Hot reload at `http://localhost:3011`; uses the isolated Compose demo DB and shared demo media volume. |
| Stop development | `docker compose --profile dev stop backend-dev frontend-dev` | Stops only the dev app services. |
| Run tests | `docker compose --profile test run --rm test-runner` | Private `mongo-test` replica set, private named volume, database `rewear_circle_compose_test`; suites run serially through the existing `npm test` chain. |
| Seed demo data | `docker compose run --rm backend npm run seed` | Explicit one-off command against `rewear_circle_demo`; not part of startup. |
| Audit fulfillment data | `docker compose --profile ops run --rm maintenance npm run audit:fulfillment-data` | Read-only audit of demo DB. |
| Migration dry-run | `docker compose --profile ops run --rm maintenance npm run migrate:fulfillment-data` | Default dry-run; no writes. Apply guards remain in the migration script. |
| Retention dry-run | `docker compose --profile ops run --rm maintenance npm run retention:cases -- --dry-run` | Demo DB; no writes. |
| Create verified backup | `docker compose --profile ops run --rm maintenance sh /opt/rewear-ops/backup.sh` | Dumps the Compose Mongo replica set with oplog and archives the shared media volume; validates both archives. |
| Restore dry-run | `docker compose --profile restore run --rm -e RESTORE_ARCHIVE=/backups/rewear-<timestamp>/mongo-full.archive.gz restore` | Private restore network, DB volume, and media volume; validates archive and media tar without writing. |
| Apply isolated restore | Add `-e RESTORE_APPLY=1 -e RESTORE_CONFIRM_ISOLATED=rewear-circle-restore` to the restore command above. | One-time restore into the empty `mongo-restore` volume only. The script checks target host, explicit confirmation, and empty databases before writing. |
| Enable daily retention dry-run | `docker compose --profile retention up -d retention-scheduler` | Runs immediately and then every 24 hours; no Docker socket, defaults to dry-run. |
| Inspect/stop retention | `docker compose --profile retention logs --tail=100 retention-scheduler` / `docker compose --profile retention stop retention-scheduler` | Scheduler output includes the retention script's JSON summary. |

Do not use `docker compose down -v` as a normal stop command. Test and restore MongoDB use their own volumes and internal-only networks; neither publishes a database port to the host.

## Step E verification

| Check | Result |
| --- | --- |
| Compose configuration | PASS: `docker compose config --quiet`. |
| Maintenance image | PASS: built with Node 24 and MongoDB Database Tools; `mongodump --version` and `mongorestore --version` both reported `100.16.0`. |
| Dev images | PASS: backend and frontend development targets built. |
| Test suites | Step E passed all 6 serial suites (16 tests); Step F added the DISC integration suite. Latest run passed all 7 suites (17 tests), 0 failures/skips, against the private `_test` DB. |
| Audit / migration / retention | PASS: audit showed no missing expected indexes; migration and retention each reported `writesPerformed: 0`. |
| Backup | PASS: archive and uploads tar validated. Created at `backups/rewear-20261031T011839Z`; this is a demo recovery drill, not the final cutover snapshot. |
| Restore | PASS: isolated restore recovered 4 users, 5 listings, 2 media records and 1 upload file. Restore MongoDB container was stopped after verification; its volume is retained. |
| Seed behavior | PASS: Step D explicitly seeded the demo database; seed is a separate one-off command and does not run during Compose startup. |
| VNPAY | OFF: Compose sets `VNPAY_ENABLED=false`; no VNPAY worker, callback service, or tunnel is included. If VNPAY is enabled later, its worker/tunnel must also run in Docker and receive separate integration/Sandbox acceptance. |

No migration or retention apply was run. The host API and VNPAY worker were not stopped. The backup above was taken while the demo application was active, so it must not be treated as the final synchronized transfer backup; follow the Step B runbook and quiesce writers before cutover.
