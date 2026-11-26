# Frame data

`frame-data.json` is built outside this repository and copied here by `scripts/sync-data.sh`; it is not committed.
`layout.json`, the storyboard's layout of the venue (its `frames.json` "layout"), is committed: the sync compares it
with the storyboard's and keeps this copy unless `--layout` is passed, so an older layout cannot bring back words this
copy has corrected. The lab loads whichever is present: a frame reads them as `ctx.data` and `ctx.layout`, and
`ctx.needData()` throws when the frame data has not been synced.
