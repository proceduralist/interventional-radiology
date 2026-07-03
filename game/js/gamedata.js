/* IR RPG — game content loader.
   Pulls the game-ready bundle for a procedure from Supabase (anon REST) and
   caches it in localStorage keyed by data_version (website→game sync, spec §3).
   Exposes window.IRGameData.loadCase(procedureId). */
(function (root) {
  "use strict";
  const rest = (p) => root.IRNet.rest(p);
  const LS = "irc-game-bundle-v1";

  async function version() {
    const rows = await rest("data_version?select=version,updated_at&id=eq.1");
    return rows[0];
  }

  async function fetchBundle(procedureId) {
    const [proc, params, gens, comps, cfg] = await Promise.all([
      rest("procedures?select=*&id=eq." + procedureId),
      rest("procedure_game_params?select=*&procedure_id=eq." + procedureId),
      rest("patient_generators?select=*&procedure_id=eq." + procedureId + "&status=eq.published&order=updated_at.desc"),
      rest("complications?select=*&status=eq.published&or=(procedure_id.eq." + procedureId + ",procedure_id.is.null)"),
      rest("game_config?select=key,value,data_class,citation"),
    ]);
    if (!params[0]) throw new Error("No game params for " + procedureId);
    const vm = await rest("vessel_maps?select=*&id=eq." + params[0].vessel_map_id);
    // devices referenced by the case (required_devices classes + step devices)
    const devs = await rest("devices?select=*&status=eq.published");
    // P3 conference defense: linked papers + archetypes + question templates
    const links = await rest("procedure_papers?select=paper_id,role&procedure_id=eq." + procedureId);
    let defense = { papers: [], archetypes: [], templates: [] };
    if (links.length) {
      const ids = [...new Set(links.map(l => l.paper_id))].join(",");
      const [papers, archetypes, templates] = await Promise.all([
        rest("papers?select=*&id=in.(" + ids + ")&status=eq.published"),
        rest("npc_archetypes?select=*"),
        rest("defense_question_templates?select=*&status=eq.published"),
      ]);
      defense = { papers, archetypes,
        templates: templates.filter(t => t.paper_id == null || papers.some(p => p.id === t.paper_id)) };
    }
    const config = {}, configMeta = {};
    for (const r of cfg) {
      config[r.key] = r.value;
      configMeta[r.key + "_citation"] = r.citation || "";
      configMeta[r.key + "_class"] = r.data_class || "";
    }
    return {
      procedure: proc[0], params: params[0], vesselMap: vm[0],
      generator: gens[0], complications: comps, devices: devs, config, configMeta, defense,
    };
  }

  async function loadCase(procedureId) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) {}
    try {
      const ver = await version();
      if (cached && cached.dbVersion === ver.version && cached.bundle && cached.bundle.procedure.id === procedureId) {
        return cached.bundle;
      }
      const bundle = await fetchBundle(procedureId);
      try { localStorage.setItem(LS, JSON.stringify({ dbVersion: ver.version, bundle })); } catch (e) {}
      return bundle;
    } catch (e) {
      if (cached && cached.bundle && cached.bundle.procedure.id === procedureId) return cached.bundle;
      throw e;
    }
  }

  root.IRGameData = { loadCase, version };
})(window);
