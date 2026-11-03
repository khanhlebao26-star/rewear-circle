#!/bin/sh
while :; do
  if ! npm run retention:cases -- --dry-run; then
    echo '{"event":"retention_dry_run_failed","level":"error"}'
  fi
  sleep 86400
done
