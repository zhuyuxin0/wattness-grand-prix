# Wattness Living Brain adapter

Asset-scoped persistent memory for reviewing shadow plans for real ERCOT batteries.

The adapter captures reviewed context with a stable origin reference, waits for compilation, and lets a fresh client search and read complete pages. A review cites the page slug, version, source IDs, their origin references and the time the page became available.

## Run

The repository workspace must discover packages/adapters/*.

    pnpm install
    pnpm --filter @gatelock/core build
    pnpm --filter @gatelock/living-brain build
    pnpm --filter @gatelock/living-brain typecheck
    pnpm --filter @gatelock/living-brain test
    pnpm --filter @gatelock/living-brain live

The live runner loads LIVING_BRAIN_API_KEY and LIVING_BRAIN_SUBJECT_ID only through the core secrets export and sends them only to the fixed Living Brain API origin. Neither value reaches a browser or an evidence file.

The runner creates or reuses one DSWL_ESS_ESR1 brain and captures two short public notes: the sealed shadow-plan context and the reviewed hedge-entry rule. Both name the sealed fixture's root; nothing else is ingested.

## Integration

The REST surface the adapter uses:

| Method | Operation |
|---|---|
| POST /v1/brains | Create an isolated asset brain |
| POST /v1/brains/{brainId}/captures | Capture with a required originRef |
| GET /v1/brains/{brainId}/sources?ids=... | Poll the exact ingest source |
| POST /v1/brains/{brainId}/search | Find candidate pages |
| GET /v1/brains/{brainId}/pages/{slug} | Read full content and provenance |
| GET /v1/brains/{brainId}/graph | Read page and relationship data for visualization |

The client supports Bearer and x-api-key authentication, each with x-subject-id. The runner switches to x-api-key only if its first Bearer request returns HTTP 401.

Each capture carries an originRef built from the asset, the sealed root and the note's version, and the runner records the captured source IDs so a rerun reads the same sources instead of capturing again. Network failures are never replayed automatically. Polling is bounded, and a completed capture must carry its compilation time.

## As-of review

retrieveAt returns only full pages whose current content and every source were available by the requested cutoff. It excludes contested, stale, archived and deprecated pages, pages with unknown provenance or availability, pages edited after the cutoff, and sources from another brain. Search snippets stay internal and never enter the review result.

reviewFromMemory classifies the hedge entry from cited memory. A page counts only when it was compiled from the reviewed capture, identified by its originRef, and still states the rule; the result carries those citations. The fresh client knows that public origin reference, not the rule's text.

## Evidence

The live runner writes sanitized calls, ingest statuses, the fresh-session handover, the historical-cutoff check and the graph to evidence/living-brain at the repository root, or under the directory named by GATE_EVIDENCE_DIR. The historical check uses the sealed plan's own time from the fixture manifest. A rerun reuses the brain named in that directory's state.json.

Brain, page and source IDs are kept for reproducibility. Credentials and credential echoes, subject, tenant, organization, account and user identifiers, and people lists are redacted. No transaction is involved.

## Sources

- https://docs.livingbrain.com/docs/authentication
- https://docs.livingbrain.com/docs/build
- https://docs.livingbrain.com/api-reference/captures/capture
- https://docs.livingbrain.com/api-reference/captures/list-sources
- https://docs.livingbrain.com/api-reference/workspace/get-page
- https://docs.livingbrain.com/api-reference/workspace/graph
- https://docs.livingbrain.com/mcp/sign-in

The adapter is original code under the MIT license; it includes no code from another implementation.
