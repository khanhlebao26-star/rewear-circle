# Backend handoff and isolated acceptance

Scope: COD, listing moderation, Admin/Support access, email verification and operations. VNPAY and 15-minute reservations remain deferred.

## API rules for frontend

- Use `/api/v1` on the frontend origin and include the session cookie.
- Runtime origin is localhost:3001 through gateway Nginx; development origin is localhost:3011 through gateway-dev. Always combine compose.yaml and compose.operations.yaml for runtime commands. Backend/frontend have no separate published ports.
- Only USER can create/revise/change visibility of their listings or upload listing/evidence images.
- ADMIN can review linked listing revision images, with private/no-store and audit before delivery. Unbound uploads and unrelated Case evidence are not granted by this permission.
- ADMIN cannot approve/reject a listing they own. SUPPORT retains access to assigned active Cases only.
- Passwords must be strings, at least 12 JavaScript characters, at most 72 UTF-8 bytes. Register/login return 422 VALIDATION_ERROR for invalid lengths.
- OTP quota writes and verification are conditional atomic updates. Concurrent wrong guesses cannot exceed five attempts. Resend uses a token/send-time compare-and-set.
- COD checkout is created through POST /checkouts. The old /checkouts/:id/confirm endpoint returns 410. Supply Idempotency-Key where required.

## Run isolated tests in PowerShell

```powershell
$checkProject = 'rewear-backend-check-01'
$verifyFiles = @('-p', $checkProject, '-f', 'compose.verify.yaml', '-f', 'compose.gateway.verify.yaml')

docker compose @verifyFiles run --build --rm regression
if ($LASTEXITCODE -ne 0) { throw 'Backend regression failed.' }

docker compose @verifyFiles up -d --build probe-a probe-b
if ($LASTEXITCODE -ne 0) { throw 'Could not start gateway tests.' }
docker compose @verifyFiles wait probe-a probe-b
if ($LASTEXITCODE -ne 0) { throw 'Gateway tests failed.' }
foreach ($service in @('probe-a', 'probe-b')) {
    $containerId = docker compose @verifyFiles ps -aq $service
    if (-not $containerId) { throw "Missing test container: $service" }
    $exitCode = docker inspect --format '{{.State.ExitCode}}' $containerId
    if ($exitCode -ne '0') { throw "Gateway test failed: $service" }
}
docker compose @verifyFiles logs --no-log-prefix probe-a probe-b

docker compose @verifyFiles run --build --rm ops-acceptance
if ($LASTEXITCODE -ne 0) { throw 'Backup/retention acceptance failed.' }
$markerText = docker compose @verifyFiles run --rm --no-deps ops-acceptance cat /backups/acceptance-run.json
if ($LASTEXITCODE -ne 0) { throw 'Could not read the backup marker.' }
$archive = ($markerText | ConvertFrom-Json).archive
if ($archive -notmatch '^/backups/[a-f0-9-]+/rewear-\d{8}T\d{6}Z/mongo-full\.archive\.gz$') {
    throw 'Unexpected isolated backup path.'
}

docker compose @verifyFiles run --build --rm -e "RESTORE_ARCHIVE=$archive" -e RESTORE_APPLY=1 -e RESTORE_CONFIRM_ISOLATED=rewear-circle-restore restore
if ($LASTEXITCODE -ne 0) { throw 'Isolated restore failed.' }
docker compose @verifyFiles run --build --rm restore-check
if ($LASTEXITCODE -ne 0) { throw 'Restored data comparison failed.' }

docker compose @verifyFiles stop
```

Stop at any command failure. Use a fresh project name for a repeat acceptance cycle; apply and restore refuse to overwrite existing acceptance data. These services use private project volumes and no host database ports. No demo env or actual user data is required.

### Windows shell-script line endings

Save `docker/backup.sh` and `docker/restore.sh` as UTF-8 without BOM and with LF line endings. Docker mounts the working-tree files directly, so `.gitattributes` alone does not convert files that were already saved as CRLF. `.editorconfig` also requests LF from supporting editors. If backup fails before retention applies, the synthetic fixtures still exist: use a fresh project such as `rewear-backend-check-02` instead of rerunning acceptance against the same database.

Check the mounted scripts before a new acceptance cycle:

```powershell
docker compose -p $checkProject -f compose.verify.yaml run --build --rm --no-deps ops-acceptance sh -c 'sh -n /opt/rewear-ops/backup.sh && sh -n /opt/rewear-ops/restore.sh'
```

## Acceptance checklist

- [ ] Full regression test command passes without skipped integration tests.
- [ ] Gateway tests report two independent clients and forged-IP bypass blocked.
- [ ] Pending image read succeeds for Admin and fails for guest/Support/orphan access.
- [ ] Staff Seller mutations/uploads are blocked; normal USER remains usable.
- [ ] Password byte-boundary and concurrent OTP/resend tests pass.
- [ ] Multi-seller, cancellation, return, purchase race and audit/notification rollback tests pass.
- [ ] Real backup and retention apply acceptance emits PASS.
- [ ] Evidence survives while another Case is active/recent, then is deleted after its last reference expires; a media-only backlog triggers verified backup and drains in bounded batches.
- [ ] Restore comparison emits PASS and recovers pre-retention content/files.
- [ ] Demo runtime rebuilt after source changes and UI smoke checked.
- [ ] Local changes committed and actual GitHub CI result checked after publishing.

Reference result while preparing the provided patch on 2026-11-03: 38 tests passed, zero failed/skipped; real backup/retention acceptance and restore comparison both passed in a separate Docker project. This reference does not automatically certify the recipient's modified tree or production deployment. The included GitHub workflow has not been run on GitHub by the preparer.

Local verification on 2026-11-04 after the shared-evidence fix: 41 tests passed, zero failed/skipped. The original failing shared-expiry probe now passes; real backup/retention and restore comparison also pass. These include media-only cleanup, more than 100 eligible images and retained references. GitHub CI and browser UI acceptance still require their own results.

## Retention activation

Keep RETENTION_MODE=dry-run until the target database/volumes and backup workflow are checked. Set RETENTION_MODE=apply in the root .env and recreate only retention-scheduler when applying to demo. Do not set CASE_RETENTION_BACKUP_VERIFIED permanently; the scheduler sets it only for a batch after verified backup.

Apply redacts eligible closed Case content and reclaims unreferenced evidence owned by expired/redacted Cases, including files previously retained for another Case and a media-only backlog. Dry-run discovers that work before the scheduler creates a fresh backup. Completion requires eligibleCasesRemaining, pendingMediaRemaining and eligibleMediaRemaining all zero. Order/Payment retention is separate. Existing old staff-owned listings or accounts with passwords over 72 bytes require deliberate handling; the patch does not rewrite their data or credentials. Changing a staff env password does not rotate an existing database password.

See the [current operations runbook](backend-fulfillment-operations.md) for activation and log commands. Read health with `exec -T retention-scheduler cat /app/logs/retention-health.json`, and mode with `exec -T retention-scheduler printenv RETENTION_MODE`; these avoid JavaScript quoting differences in Windows PowerShell. API/retention file logs retain 30 UTC date buckets in their volume; Docker diagnostic logs rotate at 10 MB x 3 files/container.
