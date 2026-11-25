# Wattness Living Brain adapter

Asset-scoped persistent context for reviewing shadow plans for real ERCOT batteries.

This adapter captures reviewed context with a stable origin reference, waits for compilation, and lets a fresh client search and read complete pages. Reviews cite the page slug, version, source IDs and availability time.

## Run

The repository workspace must discover packages/adapters/*.

    pnpm install
    pnpm --filter @gatelock/core build
    pnpm --filter @gatelock/living-brain build
    pnpm --filter @gatelock/living-brain test
    pnpm --filter @gatelock/living-brain live

The live runner loads LIVING_BRAIN_API_KEY and LIVING_BRAIN_SUBJECT_ID only through the core secrets export. It sends them to the fixed Living Brain API origin. It never exposes them to a browser or evidence packet.

The runner creates/reuses one DSWL_ESS_ESR1 brain and captures two small public notes: the sealed shadow-plan context and the reviewed assumed hedge-entry rule. It uses the sealed fixture root and does not ingest private forecasts, customer data or ElectronX market data.

## Integration

The REST surface is deliberately small:

| Method | Operation |
|---|---|
| POST /v1/brains | Create an isolated asset brain |
| POST /v1/brains/{brainId}/captures | Capture with a required originRef |
| GET /v1/brains/{brainId}/sources?ids=... | Poll the exact ingest source |
| POST /v1/brains/{brainId}/search | Find candidate pages |
| GET /v1/brains/{brainId}/pages/{slug} | Read full content and provenance |
| GET /v1/brains/{brainId}/graph | Read page/relationship data for visualization |

The client supports Bearer and x-api-key authentication, each with x-subject-id. The runner falls back to x-api-key only if initial Bearer authentication returns HTTP 401.

Capture retries use the same originRef. Network failures are not automatically replayed. Polling is bounded, and completed ingestion requires an explicit compilation timestamp.

## As-of review

retrieveAt returns only full pages whose current content and every source were available by the requested cutoff. It excludes contested, stale, archived and deprecated pages. It also excludes unknown provenance or availability, later edits, and sources belonging to another brain.

This intentionally conservative policy uses current page content. It does not reconstruct a historical page from version history. A current page changed after the cutoff is excluded even if an older version exists. The raw search snippets remain internal and do not enter the review result.

reviewFromMemory demonstrates a bounded, rule-based review of the known assumed-entry lesson. It records the changed classification and its citations; it does not execute trades or claim that memory improved strategy returns.

## Evidence

The live runner writes sanitized calls, ingest statuses, a fresh-session handover, the historical-cutoff check and graph data under evidence/living-brain. No transaction is required for the persistent-memory API.

API/page IDs are retained for reproducibility; organization and subject identifiers and credential echoes are redacted.

## Sources

- https://docs.livingbrain.com/docs/authentication
- https://docs.livingbrain.com/docs/build
- https://docs.livingbrain.com/api-reference/captures/capture
- https://docs.livingbrain.com/api-reference/captures/list-sources
- https://docs.livingbrain.com/api-reference/workspace/get-page
- https://docs.livingbrain.com/api-reference/workspace/graph
- https://docs.livingbrain.com/mcp/sign-in

The adapter is original MIT code; no external implementation was vendored.
