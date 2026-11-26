#!/usr/bin/env python3
"""Recompute a gate-record document's leaf hash and one-leaf root.

    python3 -I tools/verify_hash.py fixtures/od-20261126/leaves/DSWL_ESS_ESR1.json [--expect 0x...]

A second implementation of packages/core, standard library only:
leaf = SHA-256(0x00 || JCS(document)), and the RFC 6962 root of a single leaf
is the leaf itself.

JCS (RFC 8785) is implemented only for the value types these documents may
hold: objects, arrays, strings, booleans, null and integers of magnitude at
most 2**53 - 1. Fractional numbers are refused rather than formatted, because
reproducing ECMAScript's shortest round-trip formatting is out of scope; the
TypeScript side refuses them too, so no valid document contains one.
"""

import argparse
import hashlib
import json
import os
import sys

MAX_SAFE = 2**53 - 1


def jcs(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        if abs(value) > MAX_SAFE:
            raise ValueError(f"integer {value} is outside the safe range")
        return str(value)
    if isinstance(value, float):
        raise ValueError(f"fractional number {value!r} is not allowed")
    if isinstance(value, str):
        return string(value)
    if isinstance(value, list):
        return "[" + ",".join(jcs(v) for v in value) + "]"
    if isinstance(value, dict):
        # RFC 8785 orders keys by UTF-16 code units; big-endian UTF-16 bytes sort the same way.
        keys = sorted(value, key=lambda k: k.encode("utf-16-be", "surrogatepass"))
        return "{" + ",".join(string(k) + ":" + jcs(value[k]) for k in keys) + "}"
    raise ValueError(f"{type(value).__name__} is not JSON")


def string(s):
    # json.dumps escapes exactly what ECMAScript's JSON.stringify does when
    # ensure_ascii is off: quote, backslash, and U+0000..U+001F (\b \t \n \f \r
    # by name, the rest as lowercase \u00xx). Lone surrogates cannot be UTF-8
    # encoded below, so they fail as RFC 8785 requires.
    return json.dumps(s, ensure_ascii=False)


def reject_constant(name):
    raise ValueError(f"{name} is not allowed")


def leaf_hash(doc):
    return hashlib.sha256(b"\x00" + jcs(doc).encode("utf-8")).hexdigest()


def node_hash(left, right):
    return hashlib.sha256(b"\x01" + left + right).digest()


def tree_root(leaves):
    if len(leaves) == 1:
        return leaves[0]
    k = 1
    while k * 2 < len(leaves):
        k *= 2
    return node_hash(tree_root(leaves[:k]), tree_root(leaves[k:]))


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f, parse_constant=reject_constant)


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("document")
    p.add_argument("--expect", help="root to compare against (0x-prefixed hex)")
    args = p.parse_args()

    doc = load(args.document)
    if isinstance(doc, dict) and doc.get("schema") == "gate-record.fleet.v1":
        base = os.path.dirname(os.path.abspath(args.document))
        leaves = []
        for entry in doc["leaves"]:
            leaf = leaf_hash(load(os.path.join(base, entry["manifest"])))
            if "0x" + leaf != entry["leaf"]:
                print(f"MISMATCH: {entry['resource']} hashes to 0x{leaf}, index says {entry['leaf']}", file=sys.stderr)
                return 1
            leaves.append(bytes.fromhex(leaf))
        root = "0x" + tree_root(leaves).hex()
        print(f"leaves {len(leaves)}")
    else:
        root = "0x" + leaf_hash(doc)
        print(f"leaf {root}")
    print(f"root {root}")
    if args.expect is not None:
        if args.expect.lower() != root:
            print(f"MISMATCH: expected {args.expect}", file=sys.stderr)
            return 1
        print("MATCH")
    return 0


if __name__ == "__main__":
    sys.exit(main())
