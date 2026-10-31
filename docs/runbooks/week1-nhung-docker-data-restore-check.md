# Week 1 Docker data backup and restore check

Recorded: 2026-10-31<br>
Plan: [Week 1 Nhung Docker discovery plan](week1-nhung-docker-discovery-plan.md)
Result: backup and isolated restore check passed. This is a recovery drill, not the final cutover snapshot.

## Protected backup

Backup directory: `/tmp/rewear-circle-stepB-20261031`<br>
Directory mode: `0700`; backup files: `0600`. The directory is outside Git and contains the backend `.env`; do not copy it into the repository, logs, or chat.

| Artifact | Contents |
| --- | --- |
| `mongo-full.archive.gz` | `mongodump --oplog --gzip --archive` from the `rs0` primary in `rewear-circle-src-mongo-1`. Full instance archive, including the `rewear_circle` database and existing test databases. One oplog entry was captured. |
| `uploads.tar.gz` | Snapshot of `backend/uploads/`; one file, 68 bytes. Its checksum matched the source after the database dump. |
| `backend.env` | Restricted copy of backend configuration for recovery; values are intentionally not recorded here. |
| `source-integrity.json`, `restored-integrity.json` | Counts and reference-integrity summaries only; no user fields. |

The archive passed `mongorestore --dryRun` and a full `mongorestore --oplogReplay` into a new replica set using volume `rewear-stepb-restore-data-20261031`. The restore container has no published port and uses Docker's `none` network. Restore result: 33 documents restored, 0 failed. Counts matched between source and restore: Users 4, Listings 5, Checkouts 2, Orders 3, Cases 0, Media 2, PaymentAttempts 1, PaymentEvents 2, Reports 0, Complaints 0, COD collections 0, COD return requests 0. Checked User/Listing/Checkout/Order/Case/Media/Payment references had 0 dangling links on both sides. Both Media records resolve to files in the source and extracted upload snapshot.

## Consistency boundary

At backup time the project API (`node --env-file=.env src/server.js`, PID 331698) and VNPAY reconciliation worker (`node --env-file=.env src/workers/vnpay.js`, PID 331809) were running and connected to MongoDB. The worker's presence conflicts with the plan's stated VNPAY-off runtime. Neither process was stopped: the plan defers stopping local runtime until the Docker environment is verified.

The database archive captured the replica-set oplog and was replayed during restore; the upload checksum and media references matched at verification time. Do not treat this recovery drill as the final environment-transfer snapshot. Before cutover, recheck these processes and take a final DB+media snapshot after safely quiescing all project writers, once the Docker runtime has passed its checks. Do not stop or restart the VNPAY worker as part of this step; its runtime status needs explicit follow-up.

## Restore and rollback procedure

Restore procedure used on the isolated empty volume:

```sh
docker exec -i rewear-stepb-restore-mongo-20261031 \
  mongorestore --gzip --archive=/dev/stdin --oplogReplay --stopOnError \
  < /tmp/rewear-circle-stepB-20261031/mongo-full.archive.gz
```

For another recovery drill, use a newly created, isolated replica-set volume. Do not replay this archive into the live `rewear-mongo-data` volume or a non-empty database.

No source data or runtime was changed in this drill, so no source rollback was needed. To remove only the isolated restore copy after retaining the verification report, these are its exact cleanup commands:

```sh
docker stop rewear-stepb-restore-mongo-20261031
docker rm rewear-stepb-restore-mongo-20261031
docker volume rm rewear-stepb-restore-data-20261031
```

For the later environment cutover, rollback before the new environment accepts writes means stopping the new runtime before returning to the still-preserved old data source. If the new environment has accepted writes, first make and verify a backup of that newer state and reconcile it before any rollback; never discard post-cutover writes by restoring this older snapshot. The executable Compose rollback command must be recorded after the new project/service names are finalized.

## Remaining action

This step leaves local services running in accordance with the plan's cutover gate. Refresh the transfer snapshot after Docker acceptance and a controlled writer stop. Keep the `/tmp` backup protected and move it to the team's approved durable backup location before it is needed for handoff; `/tmp` may be cleared by the host.
