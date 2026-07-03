#!/usr/bin/env python3
"""
Regenerate procedures.json (the offline fallback snapshot) from Supabase.

The database is the master; this file exists only so first-time visitors with
no connectivity still get content, and as a survivable backup. Run after
significant content updates, commit the result, and bump CACHE in sw.js.

Usage: python3 export_snapshot.py [output_path]
"""
import json, sys, urllib.request

URL = "https://ueveooemzpzqebnhllcp.supabase.co"
KEY = "sb_publishable_p04LgjLfbsNA5h1YOHwo_Q_LbtA7xPr"
SEV_OUT = {"mild": "minor", "moderate": "moderate",
           "severe": "major", "life_threatening": "major", "death": "major"}

def rest(path):
    r = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY})
    with urllib.request.urlopen(r) as resp:
        return json.load(resp)

def main(out_path):
    ver = rest("data_version?select=version,updated_at&id=eq.1")[0]
    cats = rest("categories?select=*&order=sort_order.asc")
    procs = rest("procedures?select=*&status=eq.published&order=id.asc")
    cites = rest("citations?select=procedure_id,ref_number,text")
    comps = rest("complications?select=procedure_id,name,rate_text,severity,management"
                 "&status=eq.published&procedure_id=not.is.null")

    cites_by, comps_by = {}, {}
    for c in cites:
        cites_by.setdefault(c["procedure_id"], []).append(
            {"id": c["ref_number"], "text": c["text"]})
    for k in comps:
        comps_by.setdefault(k["procedure_id"], []).append(
            {"name": k["name"], "rate": k["rate_text"],
             "severity": SEV_OUT.get(k["severity"], "moderate"),
             "management": k["management"]})
    for v in cites_by.values():
        v.sort(key=lambda c: c["id"])

    out = {
        "version": ver["version"],
        "updated": str(ver["updated_at"])[:10],
        "disclaimer": ("Educational reference only — verify every dose, threshold, and "
                       "technique against current institutional protocols and society "
                       "guidelines before clinical use."),
        "categories": [{"id": c["id"], "name": c["name"], "blurb": c["blurb"]} for c in cats],
        "procedures": [],
    }
    for p in procs:
        preop = dict(p.get("preop") or {})
        if p.get("bleeding_risk"):
            preop["bleedingRisk"] = p["bleeding_risk"]
        out["procedures"].append({
            "id": p["id"], "title": p["title"], "aliases": p.get("aliases") or [],
            "category": p["category_id"], "modalities": p.get("modalities") or [],
            "time": p.get("time_estimate"), "highYield": bool(p.get("high_yield")),
            "tags": p.get("tags") or [], "overview": p.get("overview", ""),
            "preop": preop, "steps": p.get("steps") or [],
            "postop": p.get("postop") or [],
            "complications": comps_by.get(p["id"], []),
            "pearls": p.get("pearls") or [],
            "citations": cites_by.get(p["id"], []),
        })

    json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
    print(f"wrote {out_path}: v{out['version']}, {len(out['procedures'])} procedures")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../procedures.json")
