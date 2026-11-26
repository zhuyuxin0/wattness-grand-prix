// The sealed day's files on BNB Greenfield, from the publisher's own record
// (scripts/greenfield/published-od-YYYYMMDD.json for the day built; the first
// day's is published.json): each object's path, kind, size and SHA-256 as
// uploaded and read back. Written to public/data/greenfield.json. Each URL is
// the bucket's base URL plus the path, so the file keeps one copy. A day with
// no publication record yet keeps the newest earlier one, which names its own
// day, and the build says so.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export default function greenfield(ctx) {
  const dir = join(ctx.repo, "scripts", "greenfield");
  const od = `od-${ctx.day.operating_day.replaceAll("-", "")}`;
  const records = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n === "published.json" || /^published-od-\d{8}\.json$/.test(n))
        .map((n) => ({ name: n, doc: ctx.readJson(join(dir, n)) }))
        .filter((r) => r.doc.operating_day <= ctx.day.operating_day)
        .sort((a, b) => (a.doc.operating_day < b.doc.operating_day ? 1 : -1))
    : [];
  const own = records.find((r) => r.name === `published-${od}.json` || (r.name === "published.json" && r.doc.operating_day === ctx.day.operating_day));
  const chosen = own ?? records[0];
  if (!chosen) {
    console.warn("build-data: no Greenfield publication record in scripts/greenfield; greenfield.json is not written");
    return;
  }
  if (!own) console.warn(`build-data: no Greenfield record for ${ctx.day.operating_day} yet; greenfield.json keeps ${chosen.doc.operating_day}'s (${chosen.name})`);
  const p = chosen.doc;
  const prefix = `od-${p.operating_day.replaceAll("-", "")}/`;
  const files = p.files.map((f) => {
    if (!f.object.startsWith(prefix)) throw new Error(`greenfield: ${f.object} is outside ${prefix}`);
    const path = f.object.slice(prefix.length);
    if (f.url !== `${p.base_url}${path}`) throw new Error(`greenfield: ${f.object} is not served at the base URL`);
    if (!/^[0-9a-f]{64}$/.test(f.sha256)) throw new Error(`greenfield: ${f.object} has no SHA-256`);
    return { path, kind: f.kind, bytes: f.bytes, sha256: f.sha256, verified: f.verified === true };
  });
  ctx.writeJson(
    "greenfield.json",
    {
      schema: "grand-prix.greenfield.v1",
      operatingDay: p.operating_day,
      network: { greenfield: p.network.greenfield, bscChainId: p.network.bsc },
      bucket: { name: p.bucket.name, owner: p.bucket.owner, visibility: p.bucket.visibility, id: p.bucket.id, primarySp: p.bucket.primary_sp },
      explorer: p.explorer,
      baseUrl: p.base_url,
      objects: p.objects,
      totalBytes: p.total_bytes,
      verifiedAt: p.verified_at,
      allVerified: p.all_verified === true && files.every((f) => f.verified),
      files,
    },
    `scripts/greenfield/${chosen.name}`,
  );
}
