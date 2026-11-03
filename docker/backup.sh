#!/bin/sh
set -eu
umask 077

: "${MONGODB_URI:?MONGODB_URI is required}"

if [ "${BACKUP_FOR_TRANSFER:-0}" = "1" ] && [ "${BACKUP_QUIESCED:-0}" != "1" ]; then
  echo "Refusing transfer backup without BACKUP_QUIESCED=1."
  exit 1
fi

backup_root=${BACKUP_ROOT:-/backups}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$backup_root/rewear-$stamp"
mkdir -m 700 -p "$backup_dir"

dump_uri=$(MONGODB_URI="$MONGODB_URI" node -e 'const uri = new URL(process.env.MONGODB_URI); uri.pathname = "/"; process.stdout.write(uri.toString())')
mongodump --uri="$dump_uri" --oplog --gzip --archive="$backup_dir/mongo-full.archive.gz"
mongorestore --uri="$dump_uri" --dryRun --gzip --archive="$backup_dir/mongo-full.archive.gz" >/dev/null
tar -C /app/uploads -czf "$backup_dir/uploads.tar.gz" .
tar -tzf "$backup_dir/uploads.tar.gz" >/dev/null

if [ -r /run/config/root.env ]; then
  cp /run/config/root.env "$backup_dir/root.env"
fi

printf 'created_at_utc=%s\narchive_verified=yes\nuploads_verified=yes\n' "$stamp" > "$backup_dir/backup-manifest.txt"
chmod 600 "$backup_dir"/*
printf 'backup_created=%s\n' "$backup_dir"
