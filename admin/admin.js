/* ============================================================
   IR Casebook — Data Dashboard (admin)
   Buildless vanilla JS + supabase-js (UMD, pinned).
   Metadata-driven CRUD over the content schema in db/schema.sql.
   Writes require profiles.is_admin (enforced by RLS, not this UI).
   ============================================================ */
"use strict";

const sb = window.supabase.createClient(
  window.IRC_CONFIG.SUPABASE_URL, window.IRC_CONFIG.SUPABASE_KEY);

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function toast(msg, cls = "ok", ms = 3200) {
  const t = $("#toast");
  t.textContent = msg; t.className = cls; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ---------- JSON templates offered inside json fields ---------- */
const TMPL = {
  preop: { indications: [""], contraindications: { absolute: [""], relative: [""] }, labs: [""], meds: "", equipment: [""] },
  steps: [{ title: "", text: "" }],
  strings: [""],
  arms: [{ name: "Treatment", n: 0 }, { name: "Control", n: 0 }],
  endpoints: [{ name: "", primary: true, arm_values: { Treatment: "", Control: "" }, effect: "", ci_low: null, ci_high: null, p_value: null }],
  adverse_events: [{ name: "", arm: "", n: 0, pct: 0, sir_grade: "moderate" }],
  baselines: [{ variable: "age", arm: "all", kind: "continuous", mean: null, sd: null, unit: "years" }, { variable: "diabetes", arm: "all", kind: "proportion", n: null, pct: null }],
  graph: { nodes: [{ id: "svc", name: "Superior vena cava", diameter_mm: 20, tortuosity: 1, fragility: 2 }], edges: [{ from: "svc", to: "ra" }] },
  variables: [{ name: "age", kind: "normal", mean: null, sd: null, min: 18, max: 95, unit: "years" }, { name: "ckd", kind: "bernoulli", p: null }],
  guardrails: [{ if: "creatinine>=1.5", then: ["tag:CKD", "compute:egfr_ckd_epi_2021", "limit:contrast"] }],
  rescue_actions: [{ action_id: "", label: "", devices: [], effect: "" }],
  compat: { max_wire_od: null, min_sheath_fr: null },
  emergent_decay: { sbp_per_10s: -2 },
  required_devices: ["guidewire", "catheter"],
  case_steps: [{ step: 1, action: "", maps_to: "" }],
  distractors: [{ strategy: "perturb_n" }, { strategy: "violate_exclusion" }],
  value: {},
};

/* ---------- Entity metadata (mirrors db/schema.sql) ----------
   type: text | textarea | number | bool | select | textarr | json
   fk: name of a preloaded option list                                   */
const ENTITIES = {
  procedures: {
    label: "Procedures", group: "Casebook", pk: ["id"], pkEditable: true,
    order: "id", listCols: ["id", "title", "category_id", "status"],
    search: ["id", "title"],
    sub: "Reference content rendered on the public site. Cite everything — [n] markers must match the Citations table.",
    fields: [
      { name: "id", type: "text", req: true, hint: "kebab-case, permanent (e.g. chest-port)" },
      { name: "category_id", type: "select", fk: "categories", req: true },
      { name: "title", type: "text", req: true },
      { name: "aliases", type: "textarr", hint: "comma-separated synonyms" },
      { name: "modalities", type: "textarr", hint: "US, Fluoro, CT, MRI, CBCT" },
      { name: "time_estimate", type: "text", hint: "e.g. 30–45 min" },
      { name: "high_yield", type: "bool" },
      { name: "tags", type: "textarr" },
      { name: "overview", type: "textarea", hint: "One paragraph; cite with [1] markers" },
      { name: "bleeding_risk", type: "select", options: ["", "low", "high"], hint: "SIR classification" },
      { name: "preop", type: "json", tmpl: "preop" },
      { name: "steps", type: "json", tmpl: "steps" },
      { name: "postop", type: "json", tmpl: "strings" },
      { name: "pearls", type: "json", tmpl: "strings" },
      { name: "status", type: "select", options: ["draft", "published"] },
    ],
  },
  citations: {
    label: "Citations", group: "Casebook", pk: ["id"], uuid: true,
    order: "procedure_id", listCols: ["procedure_id", "ref_number", "text"],
    search: ["procedure_id", "text"],
    sub: "Numbered references per procedure — every [n] marker in procedure text must resolve here.",
    fields: [
      { name: "procedure_id", type: "select", fk: "procedures", req: true },
      { name: "ref_number", type: "number", req: true, hint: "the [n] marker number" },
      { name: "text", type: "textarea", req: true, hint: "Full NEJM-style reference" },
      { name: "pmid", type: "text" }, { name: "doi", type: "text" }, { name: "url", type: "text" },
    ],
  },
  papers: {
    label: "Papers (trials)", group: "Evidence", pk: ["id"], uuid: true,
    order: "updated_at.desc", listCols: ["title", "journal", "pub_year", "n_enrolled", "status"],
    search: ["title", "journal", "pmid"], prefill: true,
    sub: "Structured trial data — powers the conference defense and patient generators. All values CITED: enter exactly what the paper reports.",
    fields: [
      { name: "pmid", type: "text", hint: "enter then press Prefill to fetch metadata (PubMed)" },
      { name: "doi", type: "text", hint: "alternative prefill source (Crossref)" },
      { name: "title", type: "textarea", req: true },
      { name: "authors", type: "textarea" },
      { name: "journal", type: "text" },
      { name: "pub_year", type: "number" },
      { name: "abstract", type: "textarea" },
      { name: "study_design", type: "text", hint: "RCT, prospective cohort, registry…" },
      { name: "n_enrolled", type: "number" },
      { name: "arms", type: "json", tmpl: "arms" },
      { name: "inclusion", type: "json", tmpl: "strings" },
      { name: "exclusion", type: "json", tmpl: "strings" },
      { name: "endpoints", type: "json", tmpl: "endpoints" },
      { name: "adverse_events", type: "json", tmpl: "adverse_events" },
      { name: "baselines", type: "json", tmpl: "baselines", hint: "Table 1 rows — these feed the patient generators" },
      { name: "notes", type: "textarea" },
      { name: "status", type: "select", options: ["draft", "published"] },
    ],
  },
  procedure_papers: {
    label: "Paper ↔ Procedure links", group: "Evidence",
    pk: ["procedure_id", "paper_id", "role"], compositeInsertOnly: true,
    order: "procedure_id", listCols: ["procedure_id", "paper_id", "role"],
    search: ["procedure_id", "role"],
    sub: "Attach papers to procedures. defense = podium mini-game dossier; generator_source = patient generator basis.",
    fields: [
      { name: "procedure_id", type: "select", fk: "procedures", req: true },
      { name: "paper_id", type: "select", fk: "papers", req: true },
      { name: "role", type: "select", options: ["evidence", "defense", "generator_source"] },
    ],
  },
  devices: {
    label: "Devices", group: "Game", pk: ["id"], pkEditable: true,
    order: "tier", listCols: ["id", "name", "device_class", "tier", "status"],
    search: ["id", "name", "manufacturer"],
    sub: "Physical specs are CITED (IFU/spec sheet source required). 1–10 scales are MODELED — record your reasoning in modeled_basis.",
    fields: [
      { name: "id", type: "text", req: true, hint: "e.g. bentson-035-145" },
      { name: "name", type: "text", req: true },
      { name: "manufacturer", type: "text" },
      { name: "device_class", type: "select", options: ["guidewire", "catheter", "microcatheter", "micro_guidewire", "sheath", "balloon", "stent", "stent_graft", "coil", "plug", "particle", "liquid_embolic", "needle", "closure", "drain", "filter", "port", "snare", "other"], req: true },
      { name: "tier", type: "number", hint: "1 resident stock · 2 fellow · 3 attending", dc: "design" },
      { name: "french_size", type: "number", dc: "cited" },
      { name: "od_inches", type: "number", dc: "cited", hint: "wire OD, e.g. 0.035" },
      { name: "id_inches", type: "number", dc: "cited", hint: "catheter inner lumen" },
      { name: "length_cm", type: "number", dc: "cited" },
      { name: "tip_shape", type: "text", dc: "cited" },
      { name: "coating", type: "text", dc: "cited" },
      { name: "material", type: "text", dc: "cited" },
      { name: "spec_source", type: "text", dc: "cited", hint: "IFU / manufacturer spec URL — required for the cited fields above" },
      { name: "stiffness", type: "number", dc: "modeled" },
      { name: "lubricity", type: "number", dc: "modeled" },
      { name: "trackability", type: "number", dc: "modeled" },
      { name: "support", type: "number", dc: "modeled" },
      { name: "visibility", type: "number", dc: "modeled" },
      { name: "modeled_basis", type: "textarea", dc: "modeled", hint: "e.g. 'hydrophilic coating per IFU → lubricity 9'" },
      { name: "compat", type: "json", tmpl: "compat" },
      { name: "price_funds", type: "number", dc: "design" },
      { name: "status", type: "select", options: ["draft", "published"] },
    ],
  },
  vessel_maps: {
    label: "Vessel maps", group: "Game", pk: ["id"], pkEditable: true,
    order: "id", listCols: ["id", "name", "region"],
    search: ["id", "name", "region"],
    sub: "Navigation graphs. Node diameters can be CITED (anatomy literature); tortuosity/fragility 1–10 are MODELED.",
    fields: [
      { name: "id", type: "text", req: true, hint: "e.g. right-ij-to-caj" },
      { name: "name", type: "text", req: true },
      { name: "region", type: "text" },
      { name: "graph", type: "json", tmpl: "graph" },
      { name: "notes", type: "textarea" },
    ],
  },
  complications: {
    label: "Complications", group: "Game", pk: ["id"], uuid: true,
    order: "procedure_id", listCols: ["procedure_id", "name", "rate_text", "severity", "status"],
    search: ["name", "procedure_id"],
    sub: "Leave procedure blank for UNIVERSAL library entries. Rates are CITED; severity uses the SIR AE classification; rescue_actions drive Emergency Mode.",
    fields: [
      { name: "procedure_id", type: "select", fk: "procedures", allowNull: "— universal —" },
      { name: "name", type: "text", req: true },
      { name: "rate_text", type: "text", dc: "cited", hint: "display string, e.g. '1–2%'" },
      { name: "rate_low_pct", type: "number", dc: "cited" },
      { name: "rate_high_pct", type: "number", dc: "cited" },
      { name: "severity", type: "select", options: ["mild", "moderate", "severe", "life_threatening", "death"] },
      { name: "management", type: "textarea" },
      { name: "rescue_actions", type: "json", tmpl: "rescue_actions" },
      { name: "trigger_tags", type: "textarr", hint: "engine hooks: wire_perforation, access, contrast…" },
      { name: "citation_text", type: "text", dc: "cited" },
      { name: "pmid", type: "text" }, { name: "doi", type: "text" },
      { name: "status", type: "select", options: ["draft", "published"] },
    ],
  },
  patient_generators: {
    label: "Patient generators", group: "Game", pk: ["id"], uuid: true,
    order: "procedure_id", listCols: ["procedure_id", "name", "status"],
    search: ["procedure_id", "name"],
    sub: "Sampling distributions transcribed from a linked paper's Table 1 (CITED) + clinical guardrails. Publish to make the procedure game-ready.",
    fields: [
      { name: "procedure_id", type: "select", fk: "procedures", req: true },
      { name: "source_paper_id", type: "select", fk: "papers", allowNull: "— none —", hint: "the Table 1 source" },
      { name: "name", type: "text" },
      { name: "variables", type: "json", tmpl: "variables", dc: "cited" },
      { name: "guardrails", type: "json", tmpl: "guardrails" },
      { name: "status", type: "select", options: ["draft", "published"] },
    ],
  },
  procedure_game_params: {
    label: "Game params", group: "Game", pk: ["procedure_id"],
    order: "procedure_id", listCols: ["procedure_id", "pacing", "complexity", "fluoro_target_min"],
    search: ["procedure_id"],
    sub: "Per-procedure engine settings. fluoro_target_min must be a CITED reference level with its citation.",
    fields: [
      { name: "procedure_id", type: "select", fk: "procedures", req: true, pkOnCreate: true },
      { name: "vessel_map_id", type: "select", fk: "vessel_maps", allowNull: "— none yet —" },
      { name: "access_node", type: "text", hint: "node id in the vessel map" },
      { name: "target_node", type: "text" },
      { name: "pacing", type: "select", options: ["stable", "emergent"] },
      { name: "emergent_decay", type: "json", tmpl: "emergent_decay", dc: "modeled" },
      { name: "fluoro_target_min", type: "number", dc: "cited" },
      { name: "fluoro_citation", type: "text", dc: "cited" },
      { name: "base_payout", type: "number", dc: "design" },
      { name: "complexity", type: "number", hint: "1–5", dc: "design" },
      { name: "required_devices", type: "json", tmpl: "required_devices" },
      { name: "case_steps", type: "json", tmpl: "case_steps" },
    ],
  },
  defense_question_templates: {
    label: "Defense questions", group: "Game", pk: ["id"], uuid: true,
    order: "archetype_id", listCols: ["archetype_id", "template", "status"],
    search: ["archetype_id", "template"],
    sub: "Hand-authored podium questions. Leave paper blank for generic templates. Correct answers always come from the paper's literal data.",
    fields: [
      { name: "archetype_id", type: "select", fk: "npc_archetypes", req: true },
      { name: "paper_id", type: "select", fk: "papers", allowNull: "— generic —" },
      { name: "template", type: "textarea", req: true, hint: "'Your study enrolled {n_enrolled} patients…'" },
      { name: "answer_path", type: "text", hint: "field path holding the true answer, e.g. n_enrolled" },
      { name: "distractors", type: "json", tmpl: "distractors" },
      { name: "status", type: "select", options: ["draft", "published"] },
    ],
  },
  npc_archetypes: {
    label: "NPC archetypes", group: "Game", pk: ["id"], pkEditable: true,
    order: "id", listCols: ["id", "name", "targets"], search: ["id", "name"],
    sub: "The 7 podium critics. Extend cautiously — each needs question templates.",
    fields: [
      { name: "id", type: "text", req: true },
      { name: "name", type: "text", req: true },
      { name: "description", type: "textarea" },
      { name: "targets", type: "text", hint: "paper section they attack" },
    ],
  },
  game_config: {
    label: "Game config", group: "Game", pk: ["key"], pkEditable: true,
    order: "key", listCols: ["key", "data_class", "description"], search: ["key", "description"],
    sub: "Tunable engine constants. Every entry declares its data class; cited entries must carry a citation.",
    fields: [
      { name: "key", type: "text", req: true },
      { name: "value", type: "json", tmpl: "value", req: true },
      { name: "data_class", type: "select", options: ["cited", "modeled", "design"], req: true },
      { name: "citation", type: "text", hint: "required when data_class = cited" },
      { name: "description", type: "textarea" },
    ],
  },
  categories: {
    label: "Categories", group: "Casebook", pk: ["id"], pkEditable: true,
    order: "sort_order", listCols: ["id", "name", "sort_order"], search: ["id", "name"],
    sub: "Anatomy sections in the site sidebar.",
    fields: [
      { name: "id", type: "text", req: true },
      { name: "name", type: "text", req: true },
      { name: "blurb", type: "textarea" },
      { name: "sort_order", type: "number" },
    ],
  },
};

/* ---------- App state ---------- */
const S = { session: null, isAdmin: false, entity: "procedures", rows: [], editing: null, opts: {} };

/* ---------- FK option lists ---------- */
async function loadOptions() {
  const defs = {
    categories: ["categories", "id,name", "sort_order"],
    procedures: ["procedures", "id,title", "id"],
    papers: ["papers", "id,title,pub_year", "updated_at.desc"],
    vessel_maps: ["vessel_maps", "id,name", "id"],
    npc_archetypes: ["npc_archetypes", "id,name", "id"],
  };
  for (const [key, [table, sel, ord]] of Object.entries(defs)) {
    const { data, error } = await sb.from(table).select(sel)
      .order(ord.split(".")[0], { ascending: !ord.endsWith(".desc") }).limit(1000);
    S.opts[key] = error ? [] : data.map(r => ({
      value: r.id,
      label: r.title ? `${r.title}${r.pub_year ? " (" + r.pub_year + ")" : ""}` : (r.name ? `${r.id} — ${r.name}` : r.id),
    }));
  }
}

/* ---------- data_version widget ---------- */
async function refreshVersion(flash) {
  const { data } = await sb.from("data_version").select("version,updated_at").eq("id", 1).single();
  if (data) {
    const el = $("#liveVersion");
    el.textContent = `LIVE data v${data.version}`;
    el.classList.toggle("fresh", !!flash);
    if (flash) setTimeout(() => el.classList.remove("fresh"), 1800);
  }
}

/* ---------- Auth ---------- */
function renderUserBox() {
  const box = $("#userBox");
  if (!S.session) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <span class="pill">${esc(S.session.user.email)}</span>
    <span class="pill" style="color:${S.isAdmin ? "var(--ok)" : "var(--warn)"}">
      ${S.isAdmin ? "admin" : "read-only"}</span>
    <button class="mini ghost" id="signOut">Sign out</button>`;
  $("#signOut").onclick = () => sb.auth.signOut();
}

async function checkAdmin() {
  if (!S.session) { S.isAdmin = false; return; }
  const { data } = await sb.from("profiles").select("is_admin")
    .eq("user_id", S.session.user.id).single();
  S.isAdmin = !!(data && data.is_admin);
}

function renderAuth() {
  $("#nav").innerHTML = "";
  $("#panel").innerHTML = `
    <div class="card">
      <h1>Sign in</h1>
      <div class="sub">Data entry requires an authorized admin account. New accounts start read-only.</div>
      <form id="authForm">
        <div class="row"><label>Email</label><input id="aEmail" type="email" required></div>
        <div class="row"><label>Password</label><input id="aPass" type="password" minlength="8" required></div>
        <div class="actions">
          <button type="submit">Sign in</button>
          <button type="button" class="ghost" id="signUpBtn">Create account</button>
        </div>
      </form>
    </div>`;
  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({
      email: $("#aEmail").value.trim(), password: $("#aPass").value });
    if (error) toast(error.message, "bad");
  };
  $("#signUpBtn").onclick = async () => {
    const email = $("#aEmail").value.trim(), password = $("#aPass").value;
    if (!email || !password) return toast("Enter email + password first", "bad");
    const { error } = await sb.auth.signUp({ email, password });
    toast(error ? error.message : "Account created — check your email to confirm, then sign in.",
      error ? "bad" : "ok", 6000);
  };
}

/* ---------- Navigation ---------- */
function renderNav() {
  const groups = {};
  for (const [key, e] of Object.entries(ENTITIES)) (groups[e.group] = groups[e.group] || []).push([key, e]);
  $("#nav").innerHTML = Object.entries(groups).map(([g, items]) => `
    <div class="grp">${esc(g)}</div>
    ${items.map(([key, e]) =>
      `<a href="#" data-e="${key}" class="${key === S.entity ? "on" : ""}">${esc(e.label)}</a>`).join("")}
  `).join("");
  $("#nav").querySelectorAll("a").forEach(a => a.onclick = ev => {
    ev.preventDefault(); S.entity = a.dataset.e; S.editing = null; renderEntity();
  });
}

/* ---------- List view ---------- */
async function fetchRows() {
  const e = ENTITIES[S.entity];
  const [col, dir] = e.order.split(".");
  const { data, error } = await sb.from(S.entity).select("*")
    .order(col, { ascending: dir !== "desc" }).limit(1000);
  if (error) { toast(error.message, "bad"); S.rows = []; return; }
  S.rows = data;
}

function renderEntity() {
  renderNav();
  if (S.editing !== null) return renderForm();
  const e = ENTITIES[S.entity];
  $("#panel").innerHTML = `
    <h1>${esc(e.label)}</h1><div class="sub">${esc(e.sub)}</div>
    ${S.isAdmin ? "" : `<div class="banner">Read-only account — ask the owner to grant admin in the profiles table.</div>`}
    <div class="toolbar">
      <input type="search" id="q" placeholder="Filter…">
      <button id="newBtn" ${S.isAdmin ? "" : "disabled"}>+ New</button>
    </div>
    <div id="listBox">Loading…</div>`;
  $("#newBtn").onclick = () => { S.editing = {}; renderForm(); };
  $("#q").oninput = () => renderList($("#q").value.trim().toLowerCase());
  fetchRows().then(() => renderList(""));
}

function renderList(q) {
  const e = ENTITIES[S.entity];
  let rows = S.rows;
  if (q) rows = rows.filter(r => e.search.some(f => String(r[f] ?? "").toLowerCase().includes(q)));
  $("#listBox").innerHTML = rows.length ? `
    <table class="list">
      <tr>${e.listCols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>
      ${rows.map((r, i) => `<tr data-i="${i}">
        ${e.listCols.map(c => `<td>${esc(displayCell(r[c]))}</td>`).join("")}</tr>`).join("")}
    </table>
    <div class="sub" style="margin-top:8px">${rows.length} rows</div>`
    : `<div class="sub">No rows${q ? " match" : " yet"}.</div>`;
  $("#listBox").querySelectorAll("tr[data-i]").forEach(tr => {
    tr.onclick = () => {
      const visible = q ? S.rows.filter(r => e.search.some(f => String(r[f] ?? "").toLowerCase().includes(q))) : S.rows;
      S.editing = visible[+tr.dataset.i]; renderForm();
    };
  });
}

const displayCell = v =>
  v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 90);

/* ---------- Form view ---------- */
function fieldInput(f, val) {
  const dc = f.dc ? `<span class="dc ${f.dc}">${f.dc.toUpperCase()}</span>` : "";
  const req = f.req ? ` <b class="req">*</b>` : "";
  const label = `<label>${esc(f.name)}${req}${dc}</label>`;
  const id = `f_${f.name}`;
  let control;
  if (f.type === "select" && f.fk) {
    const opts = (S.opts[f.fk] || []).map(o =>
      `<option value="${esc(o.value)}" ${String(val) === String(o.value) ? "selected" : ""}>${esc(o.label)}</option>`).join("");
    control = `<select id="${id}" ${f.req ? "required" : ""}>
      ${f.allowNull ? `<option value="">${esc(f.allowNull)}</option>` : (f.req ? `<option value="" disabled ${val == null ? "selected" : ""}>— choose —</option>` : `<option value=""></option>`)}
      ${opts}</select>`;
  } else if (f.type === "select") {
    control = `<select id="${id}">${f.options.map(o =>
      `<option value="${esc(o)}" ${String(val ?? "") === o ? "selected" : ""}>${esc(o || "—")}</option>`).join("")}</select>`;
  } else if (f.type === "bool") {
    control = `<select id="${id}"><option value="false" ${!val ? "selected" : ""}>false</option>
      <option value="true" ${val ? "selected" : ""}>true</option></select>`;
  } else if (f.type === "textarea") {
    control = `<textarea id="${id}">${esc(val ?? "")}</textarea>`;
  } else if (f.type === "json") {
    const txt = val === undefined || val === null ? "" : JSON.stringify(val, null, 2);
    control = `<textarea id="${id}" class="json" spellcheck="false">${esc(txt)}</textarea>
      <button type="button" class="mini ghost tmplBtn" data-f="${f.name}" data-t="${f.tmpl || "value"}">insert template</button>`;
  } else if (f.type === "textarr") {
    control = `<input id="${id}" value="${esc((val || []).join(", "))}">`;
  } else if (f.type === "number") {
    control = `<input id="${id}" type="number" step="any" value="${esc(val ?? "")}">`;
  } else {
    control = `<input id="${id}" value="${esc(val ?? "")}">`;
  }
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : "";
  return `<div class="row" data-field="${f.name}">${label}${control}${hint}</div>`;
}

function renderForm() {
  const e = ENTITIES[S.entity];
  const row = S.editing; const isNew = !Object.keys(row).length ||
    e.pk.some(k => row[k] === undefined);
  $("#panel").innerHTML = `
    <h1>${isNew ? "New" : "Edit"} — ${esc(e.label)}</h1>
    <div class="sub">${esc(e.sub)}</div>
    <form id="editForm">
      ${e.prefill ? `<div class="toolbar">
          <button type="button" class="ghost" id="prefillBtn">Prefill from PMID / DOI</button>
          <span class="hint">Fetches metadata only (PubMed / Crossref). All structured numbers stay manual — you are the accuracy gate.</span>
        </div>` : ""}
      ${e.fields.map(f => fieldInput(f, row[f.name])).join("")}
      <div class="actions">
        <button type="submit" ${S.isAdmin ? "" : "disabled"}>Save</button>
        <button type="button" class="ghost" id="backBtn">Back</button>
        <div class="spacer"></div>
        ${!isNew ? `<button type="button" class="danger" id="delBtn" ${S.isAdmin ? "" : "disabled"}>Delete</button>` : ""}
      </div>
    </form>`;

  // PK immutable on edit
  if (!isNew) for (const k of e.pk) {
    const el = $(`#f_${k}`); if (el) el.disabled = true;
  }
  $("#backBtn").onclick = () => { S.editing = null; renderEntity(); };
  document.querySelectorAll(".tmplBtn").forEach(b => b.onclick = () => {
    const ta = $(`#f_${b.dataset.f}`);
    ta.value = JSON.stringify(TMPL[b.dataset.t], null, 2);
  });
  if (e.prefill) $("#prefillBtn").onclick = prefillPaper;
  if (!isNew && $("#delBtn")) $("#delBtn").onclick = deleteRow;
  $("#editForm").onsubmit = saveRow;
}

function collectForm() {
  const e = ENTITIES[S.entity];
  const out = {}; let bad = null;
  for (const f of e.fields) {
    const el = $(`#f_${f.name}`);
    if (!el || el.disabled) continue;
    let v = el.value;
    if (f.type === "number") v = v === "" ? null : Number(v);
    else if (f.type === "bool") v = v === "true";
    else if (f.type === "textarr") v = v.split(",").map(s => s.trim()).filter(Boolean);
    else if (f.type === "json") {
      el.classList.remove("err");
      if (v.trim() === "") v = f.tmpl && Array.isArray(TMPL[f.tmpl]) ? [] : {};
      else try { v = JSON.parse(v); } catch { el.classList.add("err"); bad = f.name; continue; }
    }
    else if (v === "" && (f.type === "select" || f.name === "pmid" || f.name === "doi")) v = null;
    if (f.req && (v === null || v === "" || v === undefined)) bad = bad || f.name;
    out[f.name] = v;
  }
  if (bad) { toast(`Check field: ${bad}`, "bad"); return null; }
  return out;
}

async function saveRow(ev) {
  ev.preventDefault();
  const e = ENTITIES[S.entity];
  const vals = collectForm();
  if (!vals) return;
  const isNew = !Object.keys(S.editing).length || e.pk.some(k => S.editing[k] === undefined);
  let error;
  if (isNew) ({ error } = await sb.from(S.entity).insert(vals));
  else {
    const match = {}; for (const k of e.pk) match[k] = S.editing[k];
    ({ error } = await sb.from(S.entity).update(vals).match(match));
  }
  if (error) return toast(error.message, "bad", 6000);
  toast("Saved — live in the game on next load", "ok");
  await Promise.all([refreshVersion(true), loadOptions()]);
  S.editing = null; renderEntity();
}

async function deleteRow() {
  const e = ENTITIES[S.entity];
  if (!confirm("Delete this row permanently?")) return;
  const match = {}; for (const k of e.pk) match[k] = S.editing[k];
  const { error } = await sb.from(S.entity).delete().match(match);
  if (error) return toast(error.message, "bad", 6000);
  toast("Deleted", "ok");
  await Promise.all([refreshVersion(true), loadOptions()]);
  S.editing = null; renderEntity();
}

/* ---------- Paper metadata prefill (PubMed / Crossref) ---------- */
async function prefillPaper() {
  const pmid = $("#f_pmid").value.trim();
  const doi = $("#f_doi").value.trim();
  try {
    if (pmid) {
      const sum = await (await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`)).json();
      const r = sum.result && sum.result[pmid];
      if (!r || r.error) throw new Error("PMID not found");
      $("#f_title").value = r.title || "";
      $("#f_authors").value = (r.authors || []).map(a => a.name).join(", ");
      $("#f_journal").value = r.fulljournalname || r.source || "";
      const yr = parseInt((r.pubdate || "").slice(0, 4), 10);
      if (yr) $("#f_pub_year").value = yr;
      const doiId = (r.articleids || []).find(a => a.idtype === "doi");
      if (doiId && !doi) $("#f_doi").value = doiId.value;
      try {
        const ab = await (await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&rettype=abstract&retmode=text`)).text();
        $("#f_abstract").value = ab.trim();
      } catch { /* abstract optional */ }
      toast("Prefilled from PubMed — now enter the structured fields from the paper itself", "ok", 5000);
    } else if (doi) {
      const cr = await (await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)).json();
      const m = cr.message;
      $("#f_title").value = (m.title && m.title[0]) || "";
      $("#f_authors").value = (m.author || []).map(a => `${a.given || ""} ${a.family || ""}`.trim()).join(", ");
      $("#f_journal").value = (m["container-title"] && m["container-title"][0]) || "";
      const yr = m.issued && m.issued["date-parts"] && m.issued["date-parts"][0][0];
      if (yr) $("#f_pub_year").value = yr;
      toast("Prefilled from Crossref — now enter the structured fields from the paper itself", "ok", 5000);
    } else {
      toast("Enter a PMID or DOI first", "bad");
    }
  } catch (err) {
    toast("Prefill unavailable (" + err.message + ") — enter metadata manually", "bad", 5000);
  }
}

/* ---------- Boot ---------- */
async function main() {
  sb.auth.onAuthStateChange(async (_ev, session) => {
    S.session = session;
    await checkAdmin();
    renderUserBox();
    if (session) { await loadOptions(); renderEntity(); }
    else renderAuth();
  });
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  await checkAdmin();
  renderUserBox();
  refreshVersion(false);
  if (S.session) { await loadOptions(); renderEntity(); }
  else renderAuth();
}
main();
