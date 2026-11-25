#!/usr/bin/env bash
# RFC 3161 timestamp for a record root, as a no-gas fallback or a second
# witness beside the chain. Only the 32-byte digest leaves the machine: the
# query holds the digest, a nonce and a request for the TSA's certificate.
#
#   scripts/timestamp/stamp.sh <manifest.json> [freetsa|digicert] [out-dir]
#
# The digest is the record root that tools/verify_hash.py prints, so the token
# and the on-chain record bind the same value. Writes <out-dir>/<tsa>.tsq and
# <tsa>.tsr (default out-dir: the manifest's directory), then verifies them.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

manifest=${1:?usage: stamp.sh <manifest.json> [freetsa|digicert] [out-dir]}
tsa=${2:-freetsa}
out=${3:-$(dirname "$manifest")}

case $tsa in
  freetsa) url=https://freetsa.org/tsr ;;
  digicert) url=http://timestamp.digicert.com ;;
  *) echo "unknown TSA $tsa; expected freetsa or digicert" >&2; exit 2 ;;
esac

root=$(python3 -I "$repo/tools/verify_hash.py" "$manifest" | sed -n 's/^root 0x//p')
[[ $root =~ ^[0-9a-f]{64}$ ]] || { echo "could not compute the root of $manifest" >&2; exit 1; }

mkdir -p "$out"
tsq=$out/$tsa.tsq
tsr=$out/$tsa.tsr
openssl ts -query -digest "$root" -sha256 -cert -out "$tsq" 2>/dev/null

# DigiCert's endpoint is plain HTTP; the token is signed, so transport security adds nothing.
curl -sS --fail --max-time 30 \
  -H 'Content-Type: application/timestamp-query' \
  --data-binary "@$tsq" -o "$tsr" "$url"

echo "root   0x$root"
echo "query  $tsq"
echo "reply  $tsr"
exec "$here/verify.sh" "$manifest" "$tsr" "$tsq"
