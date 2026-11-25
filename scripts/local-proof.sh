#!/usr/bin/env bash
# The whole path on a throwaway Hardhat node at 127.0.0.1:15191: deploy, a test
# record, a day's plan committed, verify PASS (the day and one battery's proof),
# a modified copy rejected with its diff, the same root from two replays, the
# Python root equal to the TypeScript one, and a commit after the gate reverted.
#
#   scripts/local-proof.sh [--od 2026-11-26] [--fleet] [--reuse]
#
# --reuse keeps an existing out/local/od-YYYYMMDD plan instead of planning again.
# Nothing here signs for a public chain: every command takes --network local.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
cd "$repo"

od=2026-11-26
fleet=()
reuse=0
while (($#)); do
  case $1 in
    --od) od=$2; shift 2 ;;
    --fleet) fleet=(--fleet); shift ;;
    --reuse) reuse=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
day=od-${od//-/}
dir=out/local/$day
rpc=http://127.0.0.1:15191
work=$(mktemp -d "${TMPDIR:-/tmp}/gate-proof.XXXXXX")

step() { printf '\n== %s (%s)\n' "$1" "$(TZ=Asia/Bangkok date '+%H:%M:%S Bangkok')"; }
rpc_call() { curl -sS -X POST -H 'content-type: application/json' --data "$1" "$rpc" >/dev/null; }

if curl -s -o /dev/null "$rpc"; then echo "something already listens on $rpc; stop it first" >&2; exit 1; fi
step "build"
pnpm -s -r build >/dev/null
(cd contracts && exec node_modules/.bin/hardhat node --port 15191 >"$work/node.log" 2>&1) &
node_pid=$!
stop_node() {
  kill "$node_pid" 2>/dev/null || true
  # The shim may have forked; stop whatever still holds the port this script opened.
  for p in $(lsof -ti tcp:15191 -sTCP:LISTEN 2>/dev/null); do kill "$p" 2>/dev/null || true; done
  rm -f contracts/deployments/localhost.json
}
trap 'rc=$?; stop_node; exit $rc' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "$rpc" && break; sleep 0.5; done

step "deploy"
rm -f contracts/deployments/localhost.json
pnpm -s --filter @gatelock/contracts chain:deploy --network local

step "test record"
rm -rf out/local/test-20991231-gate-record-test
pnpm -s --filter @gatelock/contracts chain:commit --test --network local

if ((reuse)) && [[ -f $dir/manifest.json ]]; then
  step "plan (reusing $dir)"
  rm -f "$dir/record.json"
else
  step "plan"
  rm -rf "$dir"
  node packages/agent/dist/cli/plan.js --od "$od" --network local ${fleet[@]+"${fleet[@]}"}
fi

step "commit"
pnpm -s --filter @gatelock/contracts chain:commit --od "$od" --network local

step "verify the day (showcase leaf)"
node packages/verifier/dist/cli.js "$dir/manifest.json" --network local

step "verify one battery by its Merkle proof"
other=$(node -p "const i=require('./$dir/manifest.json'); (i.leaves.find(l => l.resource !== i.showcase) ?? i.leaves[0]).resource")
node packages/verifier/dist/cli.js "$dir/manifest.json" --battery "$other" --network local --no-fetch

step "a modified copy is rejected"
cp -R "$dir" "$work/copy"
node -e '
const fs = require("fs");
const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
const a = m.arms[m.selected_arm];
a.kw[18] += 1000;
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");' "$work/copy/leaves/DSWL_ESS_ESR1.json"
if node packages/verifier/dist/cli.js "$work/copy/manifest.json" --network local --no-fetch \
  --reference "$dir/leaves/DSWL_ESS_ESR1.json"; then
  echo "FAIL: the modified copy verified" >&2; exit 1
fi
echo "-> rejected, as it must be"

step "two replays with the same salt and inputs give the same root"
salt=$(cat "$dir/salt.txt")
plan_time=$(node -p "require('./$dir/manifest.json').plan_unix")
for r in a b; do
  mkdir -p "$work/replay-$r"
  cp -R "$dir/sync" "$work/replay-$r/"
  node packages/agent/dist/cli/plan.js --od "$od" --network local --offline --salt "$salt" \
    --plan-time "$plan_time" --battery "$other" --out "$work/replay-$r" | grep -E '^(root|leaves)'
done
ra=$(cat "$work/replay-a/root.txt"); rb=$(cat "$work/replay-b/root.txt")
[[ $ra == "$rb" ]] || { echo "FAIL: replays differ: $ra vs $rb" >&2; exit 1; }
echo "-> both replays: $ra"
node -e '
const [committed, replay] = process.argv.slice(1).map((p) => require(p));
const tree = committed.code_tree === replay.code_tree;
for (const l of replay.leaves) {
  const c = committed.leaves.find((x) => x.resource === l.resource);
  const same = c && c.leaf === l.leaf;
  console.log(`   ${l.resource}: ${same ? "same leaf as the committed record" : tree ? "DIFFERS from the committed record" : "source tree changed since the plan, so the leaf differs"}`);
  if (!same && tree) process.exitCode = 1;
}' "$repo/$dir/manifest.json" "$work/replay-a/manifest.json"

step "Python recomputes the committed root from the leaf files"
python3 -I tools/verify_hash.py "$dir/manifest.json" --expect "$(cat "$dir/root.txt")"

step "a commit after the gate reverts"
gate=$(node -p "require('./$dir/manifest.json').gate_unix")
rpc_call "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"evm_setNextBlockTimestamp\",\"params\":[$((gate + 60))]}"
rpc_call '{"jsonrpc":"2.0","id":2,"method":"evm_mine","params":[]}'
rm -rf out/local/test-${od//-/}-gate-record-test-late
if pnpm -s --filter @gatelock/contracts chain:commit --test --od "$od" --scope gate-record/test-late --network local 2>&1 | tee "$work/late.txt"; then
  echo "FAIL: a commit after the gate went through" >&2; exit 1
fi
grep -q AfterGate "$work/late.txt" || { echo "FAIL: the revert was not AfterGate" >&2; exit 1; }
echo "-> reverted with AfterGate"

step "done: local proof passed"
rm -rf "$work"
