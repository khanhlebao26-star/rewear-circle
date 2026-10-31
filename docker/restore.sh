#!/bin/sh
set -eu
umask 077

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${RESTORE_ARCHIVE:?Set RESTORE_ARCHIVE to an archive mounted under /backups}"

case "$RESTORE_ARCHIVE" in
  /backups/*) ;;
  *) echo "Restore archive must be mounted under /backups."; exit 1 ;;
esac

uploads_archive="$(dirname "$RESTORE_ARCHIVE")/uploads.tar.gz"
test -s "$RESTORE_ARCHIVE"
test -s "$uploads_archive"
mongorestore --uri="$MONGODB_URI" --dryRun --gzip --archive="$RESTORE_ARCHIVE" >/dev/null
tar -tzf "$uploads_archive" >/dev/null

if [ "${RESTORE_APPLY:-0}" != "1" ]; then
  echo "Restore archive and uploads passed dry-run validation; no data was written."
  exit 0
fi

target_host=$(node -e 'process.stdout.write(new URL(process.env.MONGODB_URI).hostname)')
if [ "$target_host" != "mongo-restore" ] || [ "${RESTORE_CONFIRM_ISOLATED:-}" != "rewear-circle-restore" ]; then
  echo "Apply is restricted to the isolated mongo-restore service and explicit confirmation."
  exit 1
fi

node <<'NODE'
const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const { databases } = await mongoose.connection.db.admin().listDatabases({ nameOnly: true });
  const userDatabases = databases.filter(({ name }) => !["admin", "config", "local"].includes(name));
  await mongoose.disconnect();
  if (userDatabases.length) {
    console.error("Restore target is not empty; refusing to apply.");
    process.exit(1);
  }
})().catch(() => {
  console.error("Could not verify isolated restore target.");
  process.exit(1);
});
NODE

restore_uri=$(MONGODB_URI="$MONGODB_URI" node -e 'const uri = new URL(process.env.MONGODB_URI); uri.pathname = "/"; process.stdout.write(uri.toString())')
mongorestore --gzip --archive="$RESTORE_ARCHIVE" --oplogReplay --stopOnError --uri="$restore_uri"
tar -xzf "$uploads_archive" -C /app/uploads
echo "Isolated database and media restore completed."
