#!/bin/sh
# Stops the dev server scripts/serve.sh started on <port>.
set -eu
port="${1:-}"
case "$port" in '' | *[!0-9]*) echo "usage: scripts/stop.sh <port>" >&2; exit 2 ;; esac
here="$(cd "$(dirname "$0")/.." && pwd)"
pidf="$here/.serve/$port.pid"
if [ ! -f "$pidf" ]; then echo "nothing of this package's is serving on $port"; exit 0; fi
pid="$(cat "$pidf")"
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  tries=0
  while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 40 ]; do tries=$((tries + 1)); sleep 0.25; done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid"; fi
fi
rm -f "$pidf"
echo "stopped the server on $port (pid $pid)"
