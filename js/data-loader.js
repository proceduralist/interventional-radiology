/* IR Casebook — data loader.
   Single source of truth is Supabase (edited via /admin). Load order:
     1. If online and DB reachable: check data_version; reuse the
        localStorage snapshot when unchanged, else refetch + re-cache.
     2. Offline / DB unreachable: last localStorage snapshot.
     3. First visit offline: static procedures.json (generated fallback
        artifact — regenerate with db/export_snapshot.py).
   Exposes window.loadCasebookData() returning the legacy procedures.json
   shape so the renderer (app.js) is unchanged. */
"use strict";

(function () {
  const CFG = window.IRC_CONFIG || {};
  const LS_KEY = "irc-db-snapshot-v1";
  // DB uses SIR AE classification; renderer styles legacy minor/moderate/major.
  const SEV_OUT = {
    mild: "minor", moderate: "moderate",
    severe: "major", life_threatening: "major", death: "major",
  };

  async function rest(path) {
    const res = await fetch(CFG.SUPABASE_URL + "/rest/v1/" + path, {
      headers: { apikey: CFG.SUPABASE_KEY },
    });
    if (!res.ok) throw new Error("REST " + res.status + " on " + path);
    return res.json();
  }

  function assemble(version, updatedAt, cats, procs, cites, comps) {
    const citesBy = {}, compsBy = {};
    for (const c of cites) {
      (citesBy[c.procedure_id] = citesBy[c.procedure_id] || []).push({ id: c.ref_number, text: c.text });
    }
    for (const k of comps) {
      (compsBy[k.procedure_id] = compsBy[k.procedure_id] || []).push({
        name: k.name, rate: k.rate_text,
        severity: SEV_OUT[k.severity] || "moderate", management: k.management,
      });
    }
    for (const id in citesBy) citesBy[id].sort((a, b) => a.id - b.id);
    return {
      version: version,
      updated: String(updatedAt || "").slice(0, 10),
      disclaimer: "Educational reference only — verify every dose, threshold, and technique against current institutional protocols and society guidelines before clinical use.",
      categories: cats.map(c => ({ id: c.id, name: c.name, blurb: c.blurb })),
      procedures: procs.map(p => ({
        id: p.id, title: p.title, aliases: p.aliases || [],
        category: p.category_id, modalities: p.modalities || [],
        time: p.time_estimate, highYield: !!p.high_yield, tags: p.tags || [],
        overview: p.overview,
        preop: Object.assign({}, p.preop || {},
          p.bleeding_risk ? { bleedingRisk: p.bleeding_risk } : {}),
        steps: p.steps || [], postop: p.postop || [],
        complications: compsBy[p.id] || [],
        pearls: p.pearls || [], citations: citesBy[p.id] || [],
      })),
    };
  }

  async function fromSupabase(cached) {
    const verRows = await rest("data_version?select=version,updated_at&id=eq.1");
    const ver = verRows[0];
    if (cached && cached.dbVersion === ver.version) return cached.data;
    const [cats, procs, cites, comps] = await Promise.all([
      rest("categories?select=*&order=sort_order.asc"),
      rest("procedures?select=*&status=eq.published&order=id.asc"),
      rest("citations?select=procedure_id,ref_number,text"),
      rest("complications?select=procedure_id,name,rate_text,severity,management&status=eq.published&procedure_id=not.is.null"),
    ]);
    const data = assemble(ver.version, ver.updated_at, cats, procs, cites, comps);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ dbVersion: ver.version, data }));
    } catch (e) { /* storage full/unavailable — still return live data */ }
    return data;
  }

  window.loadCasebookData = async function () {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) {}
    if (CFG.SUPABASE_URL && CFG.SUPABASE_KEY) {
      try { return await fromSupabase(cached); }
      catch (e) { console.warn("IR Casebook: DB unreachable, using fallback.", e); }
    }
    if (cached) return cached.data;
    const res = await fetch("procedures.json");
    return res.json();
  };
})();
