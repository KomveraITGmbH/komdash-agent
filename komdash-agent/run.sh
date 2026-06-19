#!/bin/sh
set -e

KOMDASH_URL=$(jq --raw-output '.komdash_url' /data/options.json)
AGENT_KEY=$(jq --raw-output '.agent_key' /data/options.json)
CHECKIN_INTERVAL=$(jq --raw-output '.checkin_interval // 60' /data/options.json)

export KOMDASH_URL
export AGENT_KEY
export CHECKIN_INTERVAL_SECONDS="$CHECKIN_INTERVAL"
export NODE_ENV=production

exec node /app/dist/src/index.js
