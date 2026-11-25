#!/usr/bin/env bash
# Verifies an RFC 3161 reply against a manifest's record root.
#
#   scripts/timestamp/verify.sh <manifest.json> <reply.tsr> [query.tsq]
#
# With the query, openssl also checks the nonce. The TSA is read from the
# reply's signer. FreeTSA's certificates are fetched and pinned by SHA-256;
# DigiCert chains to a root in the system bundle (override with CAFILE).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

manifest=${1:?usage: verify.sh <manifest.json> <reply.tsr> [query.tsq]}
tsr=${2:?usage: verify.sh <manifest.json> <reply.tsr> [query.tsq]}
tsq=${3:-}

FREETSA_CA_SHA256=2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438
FREETSA_TSA_SHA256=8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467

root=$(python3 -I "$repo/tools/verify_hash.py" "$manifest" | sed -n 's/^root 0x//p')
[[ $root =~ ^[0-9a-f]{64}$ ]] || { echo "could not compute the root of $manifest" >&2; exit 1; }

text=$(openssl ts -reply -in "$tsr" -text 2>/dev/null)
imprint=$(printf '%s\n' "$text" | awk '/^Message data:/{f=1;next} /^[A-Z]/{f=0} f' \
  | sed -E 's/^ *[0-9a-f]+ - //; s/ {2,}.*$//; s/[- ]//g' | tr -d '\n' | tr 'A-F' 'a-f')
[[ $imprint == "$root" ]] || { echo "FAIL  token covers $imprint, manifest root is $root" >&2; exit 1; }

fetch_pinned() { # url sha256 dest
  curl -sS --fail --max-time 30 -o "$3" "$1"
  local got
  got=$(shasum -a 256 "$3" | cut -d' ' -f1)
  [[ $got == "$2" ]] || { echo "FAIL  $1 hashes to $got, pinned $2" >&2; exit 1; }
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

verify_args=(-in "$tsr")
if [[ -n $tsq ]]; then verify_args+=(-queryfile "$tsq"); else verify_args+=(-digest "$root"); fi

if printf '%s\n' "$text" | grep -q 'TSA: .*freetsa'; then
  fetch_pinned https://freetsa.org/files/cacert.pem "$FREETSA_CA_SHA256" "$tmp/ca.pem"
  fetch_pinned https://freetsa.org/files/tsa.crt "$FREETSA_TSA_SHA256" "$tmp/tsa.crt"
  verify_args+=(-CAfile "$tmp/ca.pem" -untrusted "$tmp/tsa.crt")
else
  verify_args+=(-CAfile "${CAFILE:-/etc/ssl/cert.pem}")
fi

if ! err=$(openssl ts -verify "${verify_args[@]}" 2>&1 >/dev/null); then
  printf 'FAIL  signature did not verify\n%s\n' "$err" >&2
  exit 1
fi
signer=$(printf '%s\n' "$text" | sed -n 's/^TSA: //p' | sed -nE 's#.*/CN=([^/]+).*#\1#p')
if [[ -z $signer ]]; then
  # DigiCert leaves the TSA name unset; name the signing certificate instead.
  signer=$(openssl ts -reply -in "$tsr" -token_out 2>/dev/null | openssl pkcs7 -inform DER -print_certs 2>/dev/null \
    | sed -nE 's/^subject=.*CN ?= ?([^,/]+).*/\1/p' | head -1)
fi
stamped=$(printf '%s\n' "$text" | sed -n 's/^Time stamp: //p')
epoch=$(python3 -I -c 'import sys, datetime; print(int(datetime.datetime.strptime(sys.argv[1].replace(" GMT", ""), "%b %d %H:%M:%S %Y").replace(tzinfo=datetime.timezone.utc).timestamp()))' "${stamped/.[0-9]*/}" 2>/dev/null || true)
echo "PASS  stamped $stamped by ${signer:-the TSA}"
if [[ -n $epoch ]]; then
  echo "      = $(TZ=America/Chicago date -r "$epoch" '+%Y-%m-%d %H:%M:%S %Z') (unix $epoch)"
  # The manifest's own gate field; pnpm verify recomputes it independently (V3).
  # A day's index carries gate_unix; a single manifest carries gate.unix.
  gate=$(python3 -I -c 'import json, sys; d = json.load(open(sys.argv[1])); print(d["gate_unix"] if "gate_unix" in d else d["gate"]["unix"])' "$manifest" 2>/dev/null || true)
  if [[ $gate =~ ^[0-9]+$ ]]; then
    if (( epoch < gate )); then echo "      $((gate - epoch)) s before the gate at unix $gate"
    else echo "FAIL  stamped $((epoch - gate)) s after the gate at unix $gate" >&2; exit 1; fi
  fi
fi
echo "      covers root 0x$root"
