# RFC 3161 timestamps

A record root stamped by a public time-stamping authority: the no-gas fallback
when no chain transaction can be sent, or a second witness beside one.

```sh
scripts/timestamp/stamp.sh out/od-20261126/manifest.json            # FreeTSA
scripts/timestamp/stamp.sh out/od-20261126/manifest.json digicert   # DigiCert
scripts/timestamp/verify.sh out/od-20261126/manifest.json out/od-20261126/freetsa.tsr [freetsa.tsq]
```

The manifest is a planned day's index with every leaf beside it, as
`pnpm plan` writes it; `fixtures/od-20261126` holds two of its 316 leaves.

The digest is the root `tools/verify_hash.py` computes, so a token and an
on-chain record bind the same value. Only the 32-byte digest and a nonce leave
the machine. `stamp.sh` writes `<tsa>.tsq` and `<tsa>.tsr` beside the manifest
and verifies them; `verify.sh` checks that the token covers the manifest's root,
that its signature chains to the TSA (FreeTSA's certificates pinned by SHA-256,
DigiCert's through the system bundle, or `CAFILE`), and that the stamp time is
before the manifest's gate.

A timestamp proves the root existed at that time. Unlike `GateRecord`, it does
not stop a second, different root being stamped for the same day.

Needs `openssl` (3.x), `curl` and `python3`.
