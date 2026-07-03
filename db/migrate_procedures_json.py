#!/usr/bin/env python3
"""
One-time migration: procedures.json -> SQL inserts for Supabase.

Reads the legacy IR Casebook procedures.json and emits chunked SQL files
(out/seed_NN.sql) inserting categories, procedures, citations, complications.

Severity mapping (legacy -> SIR AE classification used by the schema):
  minor -> mild, moderate -> moderate, major -> severe.
Rate parsing: percentage patterns ("1-2%", "<1% ...") populate
rate_low_pct/rate_high_pct; non-percentage rates (e.g. "per 1000
catheter-days") keep numeric fields NULL and retain the CITED display text.

Usage: python3 migrate_procedures_json.py <procedures.json> <out_dir>
"""
import json, re, sys, os

SEV = {"minor": "mild", "moderate": "moderate", "major": "severe"}

def q(s):
    """SQL-quote a string (or NULL)."""
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"

def jq(obj):
    """Compact jsonb literal."""
    return q(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"

def arr(items):
    """text[] literal."""
    if not items:
        return "'{}'::text[]"
    return "array[" + ",".join(q(i) for i in items) + "]::text[]"

def parse_rate(text):
    """Extract a percentage range from a rate string, else (None, None)."""
    if not text:
        return None, None
    t = text.replace("–", "-").replace("—", "-")  # en/em dashes
    if "per 1000" in t or "per 100,000" in t:
        return None, None
    m = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%", t)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"<\s*(\d+(?:\.\d+)?)\s*%", t)
    if m:
        return 0.0, float(m.group(1))
    m = re.search(r"(?:~|up to\s*)?(\d+(?:\.\d+)?)\s*%", t)
    if m:
        v = float(m.group(1))
        return v, v
    return None, None

def main(src, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    data = json.load(open(src))
    stmts = []

    # Categories (preserve sidebar order).
    vals = []
    for i, c in enumerate(data["categories"]):
        vals.append(f"({q(c['id'])},{q(c['name'])},{q(c.get('blurb',''))},{(i+1)*10})")
    stmts.append("insert into public.categories (id,name,blurb,sort_order) values\n"
                 + ",\n".join(vals) + "\non conflict (id) do nothing;")

    # Procedures + citations + complications.
    for p in data["procedures"]:
        preop = dict(p.get("preop", {}))
        bleeding = preop.pop("bleedingRisk", None)
        row = ",".join([
            q(p["id"]), q(p["category"]), q(p["title"]),
            arr(p.get("aliases", [])), arr(p.get("modalities", [])),
            q(p.get("time")), "true" if p.get("highYield") else "false",
            arr(p.get("tags", [])), q(p.get("overview", "")),
            q(bleeding), jq(preop), jq(p.get("steps", [])),
            jq(p.get("postop", [])), jq(p.get("pearls", [])), q("published"),
        ])
        stmts.append(
            "insert into public.procedures (id,category_id,title,aliases,modalities,"
            "time_estimate,high_yield,tags,overview,bleeding_risk,preop,steps,postop,"
            "pearls,status) values (" + row + ") on conflict (id) do nothing;")

        cvals = []
        for c in p.get("citations", []):
            cvals.append(f"({q(p['id'])},{int(c['id'])},{q(c['text'])})")
        if cvals:
            stmts.append("insert into public.citations (procedure_id,ref_number,text) values\n"
                         + ",\n".join(cvals) + "\non conflict do nothing;")

        kvals = []
        for k in p.get("complications", []):
            lo, hi = parse_rate(k.get("rate", ""))
            kvals.append("(" + ",".join([
                q(p["id"]), q(k["name"]), q(k.get("rate", "")),
                "null" if lo is None else str(lo),
                "null" if hi is None else str(hi),
                q(SEV.get(k.get("severity", "moderate"), "moderate")),
                q(k.get("management", "")), q("published"),
            ]) + ")")
        if kvals:
            stmts.append(
                "insert into public.complications (procedure_id,name,rate_text,"
                "rate_low_pct,rate_high_pct,severity,management,status) values\n"
                + ",\n".join(kvals) + ";")

    # Chunk into ~90KB files.
    chunks, cur, size = [], [], 0
    for s in stmts:
        if size + len(s) > 90_000 and cur:
            chunks.append(cur); cur, size = [], 0
        cur.append(s); size += len(s)
    if cur:
        chunks.append(cur)

    for i, ch in enumerate(chunks, 1):
        path = os.path.join(out_dir, f"seed_{i:02d}.sql")
        open(path, "w").write("\n\n".join(ch) + "\n")
        print(path, f"({sum(len(s) for s in ch)/1000:.0f} KB, {len(ch)} stmts)")

    n = len(data["procedures"])
    print(f"\nExpected rows: categories={len(data['categories'])}, procedures={n},",
          f"citations={sum(len(p.get('citations',[])) for p in data['procedures'])},",
          f"complications={sum(len(p.get('complications',[])) for p in data['procedures'])}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
