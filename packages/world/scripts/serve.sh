#!/bin/sh
# Starts the frame lab's dev server on 127.0.0.1:<port> in the background. Its pid and log go to .serve/<port>.pid and
# .serve/<port>.log; scripts/stop.sh <port> stops it.
set -eu
port="${1:-}"
case "$port" in
  '' | *[!0-9]*) echo "usage: scripts/serve.sh <port>" >&2; exit 2 ;;
  5184 | 5185 | 15190 | 15193 | 15199) echo "port $port is reserved; pick a spare port" >&2; exit 2 ;;
esac
here="$(cd "$(dirname "$0")/.." && pwd)"
pidf="$here/.serve/$port.pid"; log="$here/.serve/$port.log"
mkdir -p "$here/.serve"
if [ -f "$pidf" ] && kill -0 "$(cat "$pidf")" 2>/dev/null; then
  echo "already serving on $port (pid $(cat "$pidf"))"; exit 0
fi
cd "$here"
nohup node node_modules/vite/bin/vite.js --port "$port" --strictPort --host 127.0.0.1 > "$log" 2>&1 &
echo $! > "$pidf"
tries=0
until curl -fsS -o /dev/null "http://127.0.0.1:$port/lab.html" 2>/dev/null; do
  tries=$((tries + 1))
  if ! kill -0 "$(cat "$pidf")" 2>/dev/null || [ "$tries" -gt 120 ]; then
    echo "the server did not come up on $port:" >&2; cat "$log" >&2; rm -f "$pidf"; exit 1
  fi
  sleep 0.25
done
echo "serving http://127.0.0.1:$port/lab.html (pid $(cat "$pidf"), log $log)"
