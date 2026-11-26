import { MIN_CONFIRMATIONS, PLAN_SCOPE_LABEL, type Config } from "./config.ts";

export const homePage = (cfg: Config): string => `Wattness Grand Prix: sealed records at the edge

This Worker serves each sealed operating day's files from BNB Greenfield, and serves a file only after
checking it against GateRecord ${cfg.contract} on BSC. A file that fails a check is answered
with 502 and the reason instead of the file; a reason prints at most 200 characters of any
value it quotes and is cut at 2,000 characters.

Records served: those of ${cfg.committer} under the scope "${PLAN_SCOPE_LABEL}".
Greenfield: ${cfg.greenfieldBase}od-YYYYMMDD/<path>, such as
    ${cfg.greenfieldBase}od-20261126/manifest.json (the bucket lists no folders).

GET /day/<day>/index.json
    The day's index (manifest.json on Greenfield): one leaf hash per battery, in resource order.
    Checks: the bytes are the document's own rendering; the index's shape (schema, order, leaf count,
    code tree, scope, day, gate, plan time, the planner's fields and no others, and battery R's
    files at leaves/<R>.json and leaves/<R>.scenarios.json); the RFC 6962 root over its leaf hashes
    is its root; GateRecord.keyOf gives the record key computed here; GateRecord.get(key) holds that
    root, leaf count, code hash, day, scope and committer; the gate, computed as GateRecord.gateTs
    computes it, agrees with the contract and the index, and the record was committed before it.
    Not covered by any hash, and named in x-gate-not-covered: exclusions, showcase, plan_unix and
    leaves[].resource, the battery name beside each leaf hash (the root fixes each hash and its
    position, not the name it is listed under).

GET /day/<day>/<path>
    leaves/<R>.json            SHA-256(0x00 || RFC 8785 form) is the index's leaf for R; the
                               document is R's plan for that day by the served wallet.
    leaves/<R>.scenarios.json  SHA-256 of the RFC 8785 form is the digest R's verified leaf names.
    record.<network>.json      every field against GateRecord on that network, no extra fields,
                               and the commit transaction's receipt and Committed event.
    root.hex                   the root GateRecord holds.
    salt.txt                   the salt inside the showcase battery's verified leaf.
    a file a leaf names        SHA-256 of the bytes is the digest the verified leaf records
                               (an outside input's saved response, such as cournot/probability.json).
    Anything else, such as sync/<R>.json, is not covered by the record and answers 404.

GET /verify/<battery>?od=<day>&network=bsc-mainnet
    A JSON verdict for one battery, each check named with pass or fail and the values compared:
    the leaf hash; its Merkle proof to the committed root; the record key and the record at it;
    the commit's time against the day's gate, computed as the contract does. The checks follow the
    repository verifier's V1, V2 and V3, and for a plan that passes they print its lines. A verdict
    is given only under an index that passes the rendering and shape checks above, and only for a
    leaf whose bytes /day would serve in that form (its document's own rendering); otherwise the
    answer is the 502 /day gives. A leaf in that form that fails a check gets a failing verdict.
    The battery is found by its name in the index, which no hash fixes: 404 when the index lists
    no leaf under it, and the leaf check fails unless the leaf's own battery.resource is that name.

<day> is YYYY-MM-DD or YYYYMMDD.
?network=bsc-mainnet (the default), bsc-testnet, or both: bsc-mainnet,bsc-testnet.
?envelope=1 wraps a file in JSON: the checks, the values compared, the record, and the document.

Headers on a served file: x-gate-verified, x-gate-network, x-gate-root, x-gate-record-key,
x-gate-block, x-gate-confirmations, x-gate-checks, x-gate-basis, x-gate-sha256 (of the bytes
served), x-gate-source (the Greenfield URL), x-gate-cache. CORS is open for GET.

Caching: a verified response on a record at least ${MIN_CONFIRMATIONS} blocks deep is cached at the edge for a
day and by browsers for five minutes. Nothing is cached before it is verified; errors are never
cached.

Source: https://github.com/zhuyuxin0/wattness-grand-prix
`;
