#!/usr/bin/env python3
"""IR Casebook content validator.
Run before shipping content updates:  python3 validate.py
Checks: valid JSON, categories resolve, required fields present,
every inline [n] citation marker maps to a reference, no duplicate ids."""
import json, re, sys, pathlib

p = pathlib.Path(__file__).parent / "procedures.json"
try:
    data = json.load(open(p, encoding="utf-8"))
except Exception as e:
    print("✗ procedures.json is not valid JSON:", e); sys.exit(1)

cats = {c["id"] for c in data.get("categories", [])}
procs = data.get("procedures", [])
errors, warnings = [], []
seen = set()

REQUIRED = ["id","title","category","modalities","time","overview",
            "preop","steps","postop","complications","citations"]

for pr in procs:
    pid = pr.get("id", "<no-id>")
    if pid in seen: errors.append(f"duplicate id: {pid}")
    seen.add(pid)
    for k in REQUIRED:
        if k not in pr: errors.append(f"{pid}: missing '{k}'")
    if pr.get("category") not in cats:
        errors.append(f"{pid}: category '{pr.get('category')}' not in categories[]")
    if pr.get("preop", {}).get("bleedingRisk") not in ("high","low"):
        warnings.append(f"{pid}: preop.bleedingRisk should be 'high' or 'low'")
    cit_ids = {c["id"] for c in pr.get("citations", [])}
    if len(cit_ids) != len(pr.get("citations", [])):
        errors.append(f"{pid}: duplicate citation ids")
    blob = json.dumps({k: pr.get(k) for k in
             ("overview","steps","preop","complications","pearls","postop")})
    for grp in re.findall(r"\[(\d+(?:\s*,\s*\d+)*)\]", blob):
        for n in re.split(r"\s*,\s*", grp):
            if int(n) not in cit_ids:
                errors.append(f"{pid}: citation marker [{n}] has no matching reference")

for c in data.get("categories", []):
    if not any(pr["category"] == c["id"] for pr in procs):
        warnings.append(f"category '{c['id']}' has no procedures")

print(f"Procedures: {len(procs)} | Categories: {len(cats)} | "
      f"Citations: {sum(len(x['citations']) for x in procs)} | "
      f"Steps: {sum(len(x['steps']) for x in procs)}")
for w in warnings: print("  ⚠", w)
if errors:
    for e in errors: print("  ✗", e)
    print(f"\nFAILED with {len(errors)} error(s).")
    sys.exit(1)
print("\n✓ All checks passed.")
