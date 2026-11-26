#!/bin/sh
# Copies the frame data into src/data/ from the folder the storyboard builds it in: the first argument, or the
# folder named in .data-src (one line, kept out of git). frame-data.json comes over with each source's local path cut
# to its repository path or file name (the sources stay pinned by sha256 and size). layout.json is committed: it is
# frames.json's "layout" as last taken, and a sync only compares the two. --layout takes frames.json's layout over it
# (then commit the change), so an old frames.json can never bring back words the committed copy has corrected.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
take_layout=0
if [ "${1:-}" = "--layout" ]; then take_layout=1; shift; fi
src="${1:-}"
if [ -z "$src" ] && [ -f "$here/.data-src" ]; then src="$(head -n 1 "$here/.data-src")"; fi
if [ -z "$src" ]; then
  echo "usage: scripts/sync-data.sh [--layout] <folder with frame-data.json> (or put the folder in .data-src)" >&2
  exit 2
fi
[ -f "$src/frame-data.json" ] || { echo "no frame-data.json in $src" >&2; exit 1; }
mkdir -p "$here/src/data"
node --input-type=module - "$src" "$here/src/data" "$take_layout" <<'JS'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const [src, out, take] = process.argv.slice(2);
const data = JSON.parse(readFileSync(join(src, 'frame-data.json'), 'utf8'));
const local = (p) => { const m = /\/gatelock[^/]*\/(.+)$/.exec(p); return m ? m[1] : basename(p); };
for (const s of Object.values(data.sources ?? {})) if (s && typeof s.path === 'string') s.path = local(s.path);
writeFileSync(join(out, 'frame-data.json'), JSON.stringify(data));
console.log(`frame-data.json: schema ${data.schema}, built ${data.built?.ct ?? '?'}, ${Object.keys(data.sources ?? {}).length} sources`);
const frames = join(src, 'frames.json'), mine = join(out, 'layout.json');
if (!existsSync(frames)) console.log('no frames.json there; layout.json kept as committed');
else {
  const f = JSON.parse(readFileSync(frames, 'utf8'));
  if (f.layout === undefined) console.log('frames.json has no "layout"; layout.json kept as committed');
  else {
    const theirs = JSON.stringify(f.layout, null, 1);
    if (!existsSync(mine) || take === '1') { writeFileSync(mine, theirs); console.log('layout.json: taken from frames.json (commit it)'); }
    else if (readFileSync(mine, 'utf8') === theirs) console.log('layout.json: the committed copy matches frames.json');
    else console.log('layout.json: frames.json\'s layout differs from the committed copy, which is kept (--layout takes frames.json\'s)');
  }
}
JS
