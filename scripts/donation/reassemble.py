"""Reassemble a chunked donation as Next delivers it, and check it.

Next stores each part as its own file, named after its key, e.g.
  assignment=12_task=3_participant=7_source=..._key=<session>-chatgpt_part2of7.json
Concatenating the parts in part order gives exactly the donated JSON.

Usage:  python reassemble.py <folder with the downloaded files> [--out <dir>]

For every donation (session + platform) it reports which parts are present,
whether any are missing, the total size, the SHA-256 of the reassembled
donation, and per table the number of rows, "deleted row count" and
"extraction errors". It prints no donated content.
"""
import argparse, hashlib, json, re, sys
from collections import defaultdict
from pathlib import Path

PART = re.compile(r"key=(?P<key>.+?)_part(?P<part>\d+)of(?P<total>\d+)(?:_\d+_\d+)?\.json$")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder"); ap.add_argument("--out")
    a = ap.parse_args()
    groups = defaultdict(dict)
    totals = defaultdict(set)
    for f in sorted(Path(a.folder).iterdir()):
        if f.suffix != ".json":
            continue  # e.g. Windows ":Zone.Identifier" download markers
        m = PART.search(f.name)
        if not m:
            print(f"not a part, skipped: {f.name}")
            continue
        groups[m["key"]][int(m["part"])] = f
        totals[m["key"]].add(int(m["total"]))
    if not groups:
        sys.exit("no part files found")
    ok = True
    for key, parts in groups.items():
        print(f"\n== {key}")
        if len(totals[key]) != 1:
            print(f"   ERROR: parts disagree on the total: {sorted(totals[key])}"); ok = False; continue
        total = totals[key].pop()
        missing = [i for i in range(1, total + 1) if i not in parts]
        print(f"   parts present: {len(parts)} of {total}" + (f"; MISSING: {missing}" if missing else ""))
        if missing:
            ok = False; continue
        data = b"".join(parts[i].read_bytes() for i in range(1, total + 1))
        print(f"   size: {len(data):,} bytes ({len(data) / 1e6:.1f} MB); largest part {max(parts[i].stat().st_size for i in parts) / 1e6:.1f} MB")
        print(f"   sha256: {hashlib.sha256(data).hexdigest()}")
        try:
            donation = json.loads(data)
        except ValueError as e:
            print(f"   ERROR: the reassembled donation is not valid JSON: {e}"); ok = False; continue
        for table in donation if isinstance(donation, list) else [donation]:
            for name, value in table.items():
                if isinstance(value, list):
                    print(f"   table {name}: {len(value):,} rows")
                elif name in ("deleted row count", "extraction errors"):
                    print(f"   {name}: {value}")
        if a.out:
            out = Path(a.out) / f"{key}.json"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
            print(f"   written: {out}")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
