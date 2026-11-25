// The sealed day's files on BNB Greenfield, from the publisher's own record
// (scripts/greenfield/published.json): each object's path, kind, size and
// SHA-256 as uploaded and read back. Written to public/data/greenfield.json.
// Each URL is the bucket's base URL plus the path, so the file keeps one copy.

import { existsSync } from "node:fs";
import { join } from "node:path";

export default function greenfield(ctx) {
  const src = join(ctx.repo, "scripts", "greenfield", "published.json");
  if (!existsSync(src)) {
    console.warn("build-data: no scripts/greenfield/published.json; greenfield.json is not written");
    return;
  }
  const p = ctx.readJson(src);
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
    "scripts/greenfield/published.json",
  );
}
