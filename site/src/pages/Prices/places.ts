// The places on the Prices tab a link can name (#id), besides its sections' own ids: each source's column in "Two
// Sources, Side by Side", on the BNB/USD pair. The Texas board's rows are named by boardRowId (components/atlas).
// No imports, so test/atlas.test.mjs can read it as it is.

export const SOURCE_COLUMN = { atlas: "px-src-atlas", cmc: "px-src-cmc" } as const;
