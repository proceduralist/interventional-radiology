/* ============================================================
   IR Casebook — app.js
   Buildless vanilla-JS SPA. Data lives in Supabase (see
   js/data-loader.js); procedures.json is the offline fallback.
   ============================================================ */
"use strict";

/* ---------- State ---------- */
const S = {
  data: null,
  byId: new Map(),
  modFilter: new Set(),      // active modality filters
  study: localStorage.getItem("irc-study") === "1",
  theme: localStorage.getItem("irc-theme") || "dark",
  omniIdx: -1,
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/* ---------- Utilities ---------- */
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/* Escape + convert [1] / [1,2] citation markers into superscript links. */
function rich(text, procId) {
  return esc(text).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, nums) => {
    const sups = nums.split(",").map(n => n.trim()).map(n =>
      `<a href="#ref-${procId}-${n}" onclick="event.stopPropagation()">${n}</a>`
    ).join(",");
    return `<sup class="cite">${sups}</sup>`;
  });
}

function blur(html) { return `<span class="blurable">${html}</span>`; }

function toast(msg, btnLabel, onClick, ms = 4200) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${btnLabel ? `<button id="toastBtn">${esc(btnLabel)}</button>` : ""}`;
  t.hidden = false;
  if (btnLabel) $("#toastBtn").onclick = onClick;
  clearTimeout(toast._t);
  if (ms) toast._t = setTimeout(() => (t.hidden = true), ms);
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- Fuzzy search ---------- */
function scoreText(q, text, weight) {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === q) return weight * 3;
  if (t.startsWith(q)) return weight * 2;
  if (t.includes(q)) return weight * 1.5;
  // token prefix match
  if (t.split(/[\s/&,()-]+/).some(w => w.startsWith(q))) return weight;
  // loose subsequence (fuzzy) — require q length ≥ 3
  if (q.length >= 3) {
    let i = 0;
    for (const ch of t) if (ch === q[i]) i++;
    if (i === q.length) return weight * 0.4;
  }
  return 0;
}

function searchProcedures(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const results = [];
  for (const p of S.data.procedures) {
    let total = 0;
    for (const term of terms) {
      let s = 0;
      s = Math.max(s, scoreText(term, p.title, 10));
      for (const a of p.aliases || []) s = Math.max(s, scoreText(term, a, 9));
      s = Math.max(s, scoreText(term, catName(p.category), 5));
      for (const tag of p.tags || []) s = Math.max(s, scoreText(term, tag, 5));
      for (const m of p.modalities || []) s = Math.max(s, scoreText(term, m, 4));
      for (const e of p.preop?.equipment || []) s = Math.max(s, scoreText(term, e, 3));
      for (const i of p.preop?.indications || []) s = Math.max(s, scoreText(term, i, 2));
      if (s === 0) { total = 0; break; }   // all terms must match somewhere
      total += s;
    }
    if (total > 0) results.push({ p, score: total + (p.highYield ? 0.5 : 0) });
  }
  return results.sort((a, b) => b.score - a.score).map(r => r.p);
}

/* ---------- Data helpers ---------- */
const catName = id => S.data.categories.find(c => c.id === id)?.name || id;
const catBlurb = id => S.data.categories.find(c => c.id === id)?.blurb || "";
const procsIn = id => S.data.procedures.filter(p => p.category === id);

function modalityPass(p) {
  if (S.modFilter.size === 0) return true;
  return (p.modalities || []).some(m => S.modFilter.has(m));
}

/* ---------- Sidebar ---------- */
function buildSidebar() {
  const d = S.data;
  const mods = [...new Set(d.procedures.flatMap(p => p.modalities || []))].sort();
  const side = $("#sidebar");
  side.innerHTML = `
    <div class="side-title">Browse</div>
    <a class="side-link" data-nav href="#/"><span class="dot"></span>Home</a>
    <a class="side-link" data-nav href="#/all"><span class="dot"></span>All procedures
      <span class="cnt">${d.procedures.length}</span></a>
    <a class="side-link hy" data-nav href="#/hy"><span class="dot"></span>High-yield
      <span class="cnt">${d.procedures.filter(p => p.highYield).length}</span></a>

    <div class="side-title">Scrub Sink — Anatomy</div>
    ${d.categories.map(c => `
      <a class="side-link" data-nav href="#/cat/${c.id}"><span class="dot"></span>${esc(c.name)}
        <span class="cnt">${procsIn(c.id).length}</span></a>`).join("")}

    <div class="side-title">Modality filter</div>
    <div class="chiprow">
      ${mods.map(m => `<button class="chip" data-mod="${esc(m)}">${esc(m)}</button>`).join("")}
    </div>

    <div class="side-foot">
      <div class="row"><span id="netDot"></span><span id="netLabel">Online</span></div>
      <div class="row">Data v${esc(d.version)} · updated ${esc(d.updated)}</div>
      <div class="row">Educational reference — verify against institutional protocols.</div>
      <span class="side-logo"><img src="assets/SIRS Logo.png" alt="Society of Interventional Radiology"></span>
    </div>`;

  $$(".chip", side).forEach(ch => ch.onclick = () => {
    const m = ch.dataset.mod;
    S.modFilter.has(m) ? S.modFilter.delete(m) : S.modFilter.add(m);
    ch.classList.toggle("on");
    route(); // re-render current view with filter applied
  });
  side.addEventListener("click", e => {
    if (e.target.closest("[data-nav]")) document.body.classList.remove("nav-open");
  });
}

function markActiveNav() {
  const h = location.hash || "#/";
  $$("#sidebar .side-link").forEach(a =>
    a.classList.toggle("active", a.getAttribute("href") === h));
}

/* ---------- Views ---------- */
function procRow(p) {
  return `
    <a class="proc-row" href="#/p/${p.id}">
      <div class="t">
        <b>${esc(p.title)}</b>
        <small>${esc(catName(p.category))} · ${(p.modalities || []).map(esc).join(" / ")} · ~${esc(p.time)}</small>
      </div>
      ${p.highYield ? `<span class="hy-star" title="High-yield">★</span>` : ""}
    </a>`;
}

function listView(title, blurbTxt, procs) {
  const filtered = procs.filter(modalityPass);
  const note = S.modFilter.size
    ? `<p class="labnote">Modality filter active: ${[...S.modFilter].map(esc).join(", ")} — ${filtered.length}/${procs.length} shown. Clear chips in the sidebar to reset.</p>`
    : "";
  return `
    <div class="view">
      <h1>${esc(title)}</h1>
      ${blurbTxt ? `<p style="color:var(--muted)">${esc(blurbTxt)}</p>` : ""}
      ${note}
      ${filtered.map(procRow).join("") || `<p class="omni-empty">No procedures match the current filters.</p>`}
    </div>`;
}

function homeView() {
  const d = S.data;
  const hy = d.procedures.filter(p => p.highYield);
  return `
    <div class="view">
      <div class="hero">
        <h1>IR Casebook</h1>
        <p>A fast, offline-ready procedural reference for interventional radiology residents —
        pre-op workup, step-by-step technique, post-op care, and complication management,
        with guideline-anchored thresholds and NEJM-style citations.</p>
        <div class="statrow">
          <div class="stat"><b>${d.procedures.length}</b><span>procedures</span></div>
          <div class="stat"><b>${d.categories.length}</b><span>anatomy categories</span></div>
          <div class="stat"><b>${hy.length}</b><span>high-yield</span></div>
          <div class="stat"><b>v${esc(d.version)}</b><span>updated ${esc(d.updated)}</span></div>
        </div>
        <div class="actionrow" style="margin-top:14px">
          <a class="btn primary" href="#/hy">★ High-yield list</a>
          <button class="btn" onclick="openCalc()">Clinical calculators</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:4px">How to use</h3>
        <p style="margin:0;color:var(--muted)">Search anything with <code>/</code>. Flip on <b>Study</b> mode to blur
        answers for active recall or med-student pimping — tap any blurred line to reveal it. Every procedure page
        exports a one-page <b>Scrub Sheet</b> PDF. The entire site caches on first load and works with zero signal
        in the angio suite.</p>
      </div>

      <h2>Anatomy categories</h2>
      <div class="tilegrid">
        ${d.categories.map(c => `
          <a class="tile" href="#/cat/${c.id}">
            <h3>${esc(c.name)} <span class="cnt">${procsIn(c.id).length}</span></h3>
            <p>${esc(c.blurb)}</p>
          </a>`).join("")}
      </div>
    </div>`;
}

function searchView(q) {
  const results = searchProcedures(q).filter(modalityPass);
  return `
    <div class="view">
      <h1>Search: “${esc(q)}”</h1>
      <p style="color:var(--muted)">${results.length} result${results.length === 1 ? "" : "s"}</p>
      ${results.map(procRow).join("") || `<p class="omni-empty">Nothing matched. Try a device name, anatomy, or abbreviation (e.g. “TIPS”, “pigtail”, “biliary”).</p>`}
    </div>`;
}

/* ---------- Router ---------- */
function route() {
  const h = (location.hash || "#/").replace(/^#\/?/, "");
  const [seg, arg] = h.split("/");
  const main = $("#main");
  let html;

  if (!seg) html = homeView();
  else if (seg === "all") html = listView("All procedures", "", S.data.procedures);
  else if (seg === "hy") html = listView("High-yield procedures", "Board-favorite, on-call staples. Know these cold.", S.data.procedures.filter(p => p.highYield));
  else if (seg === "cat") html = listView(catName(arg), catBlurb(arg), procsIn(arg));
  else if (seg === "search") html = searchView(decodeURIComponent(arg || ""));
  else if (seg === "p") { renderProcedure(arg); return; }
  else html = homeView();

  main.innerHTML = html;
  main.scrollTop = 0; window.scrollTo(0, 0);
  markActiveNav();
}

/* ---------- Procedure page ---------- */
function mediaHTML(media) {
  if (!media || !media.length) return "";
  return `<div class="media">` + media.map(m => {
    if (m.type === "video") return `
      <figure style="margin:0">
        <video src="${esc(m.src)}" muted loop playsinline controls preload="none"></video>
        ${m.caption ? `<figcaption class="blurable">${esc(m.caption)}</figcaption>` : ""}
      </figure>`;
    return `
      <figure style="margin:0">
        <img src="${esc(m.src)}" alt="${esc(m.caption || "procedure image")}" loading="lazy">
        ${m.caption ? `<figcaption class="blurable">${esc(m.caption)}</figcaption>` : ""}
      </figure>`;
  }).join("") + `</div>`;
}

function liB(items, procId) {
  return (items || []).map(i => `<li>${blur(rich(i, procId))}</li>`).join("");
}

function renderProcedure(id) {
  const p = S.byId.get(id);
  const main = $("#main");
  if (!p) { main.innerHTML = `<div class="view"><h1>Not found</h1><p>No procedure with id “${esc(id)}”.</p></div>`; return; }
  const pre = p.preop || {};
  const contra = pre.contraindications || {};
  const secs = [
    ["overview", "Overview"], ["preop", "Pre-Op"], ["steps", "Procedure"],
    ["postop", "Post-Op"], ["complications", "Complications"],
    ...(p.pearls?.length ? [["pearls", "Pearls"]] : []),
    ["refs", "References"],
  ];

  main.innerHTML = `
  <div class="view">
    <div class="proc-grid">
      <article>
        <header class="proc-head">
          <h1>${esc(p.title)}</h1>
          ${p.aliases?.length ? `<p class="sub">Also: ${p.aliases.map(esc).join(" · ")}</p>` : ""}
          <div class="badgerow">
            <span class="badge teal">${esc(catName(p.category))}</span>
            ${(p.modalities || []).map(m => `<span class="badge">${esc(m)}</span>`).join("")}
            <span class="badge">⏱ ${esc(p.time)}</span>
            <span class="badge ${pre.bleedingRisk === "high" ? "" : "acc"}">${pre.bleedingRisk === "high" ? "High bleeding risk" : "Low bleeding risk"} (SIR)</span>
            ${p.highYield ? `<span class="badge acc">★ High-yield</span>` : ""}
          </div>
          <div class="actionrow">
            <button class="btn primary" onclick="exportScrubSheet('${p.id}')">
              ⤓ Export Scrub Sheet (PDF)</button>
            <button class="btn" onclick="openCalc()">Calculators</button>
          </div>
        </header>

        <div class="studybar">
          <b>Study mode on</b> — tap blurred text to reveal.
          <button class="btn" onclick="revealAll(true)">Reveal all</button>
          <button class="btn" onclick="revealAll(false)">Hide all</button>
        </div>

        <section class="psec" id="sec-overview">
          <div class="sec-head"><span class="ph">Ov</span><h2>Overview</h2></div>
          <p>${rich(p.overview, p.id)}</p>
        </section>

        <section class="psec" id="sec-preop">
          <div class="sec-head"><span class="ph">Pre</span><h2>Pre-Op</h2></div>
          <div class="twocol">
            <div class="minicard"><h4>Indications</h4><ul>${liB(pre.indications, p.id)}</ul></div>
            <div class="minicard"><h4>Contraindications</h4>
              ${contra.absolute?.length ? `<h4 style="color:var(--danger)">Absolute</h4><ul>${liB(contra.absolute, p.id)}</ul>` : ""}
              ${contra.relative?.length ? `<h4 style="margin-top:8px">Relative</h4><ul>${liB(contra.relative, p.id)}</ul>` : ""}
            </div>
            <div class="minicard"><h4>Labs &amp; thresholds</h4><ul>${liB(pre.labs, p.id)}</ul></div>
            <div class="minicard"><h4>Equipment / kit</h4><ul>${liB(pre.equipment, p.id)}</ul></div>
          </div>
          ${pre.meds ? `<p class="labnote"><b>Peri-procedural meds:</b> ${blur(rich(pre.meds, p.id))}</p>` : ""}
        </section>

        <section class="psec" id="sec-steps">
          <div class="sec-head"><span class="ph">Px</span><h2>Procedure — Technique</h2></div>
          <ol class="steps">
            ${(p.steps || []).map(st => `
              <li class="step">
                <h4>${esc(st.title)}</h4>
                <p>${blur(rich(st.text, p.id))}</p>
                ${mediaHTML(st.media)}
              </li>`).join("")}
          </ol>
        </section>

        <section class="psec" id="sec-postop">
          <div class="sec-head"><span class="ph">Post</span><h2>Post-Op</h2></div>
          <div class="minicard"><ul>${liB(p.postop, p.id)}</ul></div>
        </section>

        <section class="psec" id="sec-complications">
          <div class="sec-head"><span class="ph">⚠</span><h2>Complications</h2></div>
          <div class="card" style="padding:6px 10px">
            <table class="ctable">
              <thead><tr><th>Complication</th><th>Rate</th><th>Severity</th><th>Recognition &amp; management</th></tr></thead>
              <tbody>
                ${(p.complications || []).map(c => `
                  <tr>
                    <td><b>${esc(c.name)}</b></td>
                    <td>${blur(esc(c.rate || "—"))}</td>
                    <td><span class="sev ${esc(c.severity || "moderate")}">${esc(c.severity || "moderate")}</span></td>
                    <td>${blur(rich(c.management, p.id))}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>

        ${p.pearls?.length ? `
        <section class="psec" id="sec-pearls">
          <div class="sec-head"><span class="ph">💡</span><h2>Pearls &amp; pitfalls</h2></div>
          ${p.pearls.map(pe => `<div class="pearl"><span class="pi">▸</span><span>${blur(rich(pe, p.id))}</span></div>`).join("")}
        </section>` : ""}

        <section class="psec" id="sec-refs">
          <div class="sec-head"><span class="ph">Ref</span><h2>References</h2></div>
          <ol class="refs">
            ${(p.citations || []).map(c => `<li id="ref-${p.id}-${c.id}">${esc(c.text)}</li>`).join("")}
          </ol>
        </section>
      </article>

      <nav id="toc" aria-label="On this page">
        <div class="side-title">On this page</div>
        ${secs.map(([sid, label]) => `<a href="#sec-${sid}" data-toc="${sid}">${label}</a>`).join("")}
      </nav>
    </div>
  </div>`;

  window.scrollTo(0, 0);
  markActiveNav();
  initScrollSpy();
  // TOC links: smooth scroll without breaking hash-router
  $$("#toc a").forEach(a => a.onclick = e => {
    e.preventDefault();
    $(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function initScrollSpy() {
  const links = $$("#toc a");
  if (!links.length) return;
  const obs = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (en.isIntersecting) {
        links.forEach(l => l.classList.toggle("active",
          l.dataset.toc === en.target.id.replace("sec-", "")));
      }
    }
  }, { rootMargin: "-15% 0px -70% 0px" });
  $$("section.psec").forEach(s => obs.observe(s));
}

/* ---------- Study / pimping mode ---------- */
function setStudy(on) {
  S.study = on;
  document.body.classList.toggle("study-on", on);
  $("#studyToggle").checked = on;
  localStorage.setItem("irc-study", on ? "1" : "0");
  if (!on) revealAll(false);
}
function revealAll(show) {
  $$(".blurable").forEach(b => b.classList.toggle("revealed", show));
}
document.addEventListener("click", e => {
  if (!S.study) return;
  const b = e.target.closest(".blurable");
  if (b) { b.classList.toggle("revealed"); e.preventDefault(); }
});

/* ---------- Scrub Sheet (client-side PDF via print) ---------- */
function exportScrubSheet(id) {
  const p = S.byId.get(id); if (!p) return;
  const pre = p.preop || {}, contra = pre.contraindications || {};
  const strip = s => String(s ?? "").replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, "").trim();
  const li = arr => (arr || []).map(i => `<li>${esc(strip(i))}</li>`).join("");
  $("#printRoot").innerHTML = `
    <div class="ps-head">
      <h1>${esc(p.title)} — Scrub Sheet</h1>
      <div class="meta">${esc(catName(p.category))} · ${(p.modalities || []).map(esc).join("/")} ·
        ~${esc(p.time)} · ${pre.bleedingRisk === "high" ? "HIGH" : "LOW"} bleeding-risk (SIR) ·
        IR Casebook v${esc(S.data.version)} · printed ${new Date().toLocaleDateString()}</div>
    </div>
    <div class="cols2">
      <h2>Indications</h2><ul>${li(pre.indications)}</ul>
      <h2>Contraindications</h2>
      <ul>${li(contra.absolute)}${(contra.relative || []).map(i => `<li><i>(rel)</i> ${esc(strip(i))}</li>`).join("")}</ul>
      <h2>Labs</h2><ul>${li(pre.labs)}</ul>
      ${pre.meds ? `<h2>Meds</h2><ul><li>${esc(strip(pre.meds))}</li></ul>` : ""}
      <h2>Equipment</h2><ul>${li(pre.equipment)}</ul>
    </div>
    <h2>Technique</h2>
    <ol>${(p.steps || []).map(s => `<li><b>${esc(s.title)}.</b> ${esc(strip(s.text))}</li>`).join("")}</ol>
    <h2>Post-op</h2><ul>${li(p.postop)}</ul>
    <h2>Complications</h2>
    <table><tr><th>Complication</th><th>Rate</th><th>Management</th></tr>
      ${(p.complications || []).map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.rate || "—")}</td><td>${esc(strip(c.management))}</td></tr>`).join("")}
    </table>
    <div class="ps-foot">Educational reference only — verify doses, thresholds, and technique against current institutional protocols and society guidelines. Not for patient-care documentation.</div>`;
  document.body.classList.add("print-scrub");
  const cleanup = () => { document.body.classList.remove("print-scrub"); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

/* ---------- Clinical calculators ---------- */
function openCalc() { $("#calcDrawer").hidden = false; $("#calcScrim").hidden = false; }
function closeCalc() { $("#calcDrawer").hidden = true; $("#calcScrim").hidden = true; }

function buildCalcDrawer() {
  $("#calcDrawer").innerHTML = `
    <div class="calc-head"><h2>Clinical calculators</h2>
      <button class="icon-btn" onclick="closeCalc()" aria-label="Close" style="border:1px solid var(--line)">✕</button>
    </div>

    <div class="calc">
      <h3>Max iodinated contrast dose</h3>
      <p class="hint">Cigarroa MACD = 5 mL × kg / SCr (cap 300 mL). ACR: routine CA-AKI prophylaxis when eGFR &lt;30.</p>
      <div class="frow">
        <div><label>Weight (kg)</label><input id="c-wt" type="number" min="1" inputmode="decimal"></div>
        <div><label>SCr (mg/dL)</label><input id="c-scr" type="number" step="0.1" min="0.1" inputmode="decimal"></div>
      </div>
      <div class="out" id="c-out">—</div>
    </div>

    <div class="calc">
      <h3>eGFR — CKD-EPI 2021 (race-free)</h3>
      <div class="frow">
        <div><label>Age (y)</label><input id="g-age" type="number" min="18" inputmode="numeric"></div>
        <div><label>Sex</label><select id="g-sex"><option value="f">Female</option><option value="m">Male</option></select></div>
      </div>
      <div class="frow"><div><label>SCr (mg/dL)</label><input id="g-scr" type="number" step="0.1" min="0.1" inputmode="decimal"></div><div></div></div>
      <div class="out" id="g-out">—</div>
    </div>

    <div class="calc">
      <h3>MELD 3.0</h3>
      <p class="hint">TIPS risk stratification; elective TIPS mortality rises steeply above ~18.</p>
      <div class="frow">
        <div><label>Sex</label><select id="m-sex"><option value="f">Female</option><option value="m">Male</option></select></div>
        <div><label>Bilirubin (mg/dL)</label><input id="m-bili" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>INR</label><input id="m-inr" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>SCr (mg/dL)</label><input id="m-scr" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>Na (mEq/L)</label><input id="m-na" type="number" inputmode="numeric"></div>
        <div><label>Albumin (g/dL)</label><input id="m-alb" type="number" step="0.1" inputmode="decimal"></div>
      </div>
      <div class="out" id="m-out">—</div>
    </div>

    <div class="calc">
      <h3>Child-Pugh</h3>
      <div class="frow">
        <div><label>Bilirubin</label><select id="cp-b"><option value="1">&lt;2</option><option value="2">2–3</option><option value="3">&gt;3</option></select></div>
        <div><label>Albumin</label><select id="cp-a"><option value="1">&gt;3.5</option><option value="2">2.8–3.5</option><option value="3">&lt;2.8</option></select></div>
        <div><label>INR</label><select id="cp-i"><option value="1">&lt;1.7</option><option value="2">1.7–2.3</option><option value="3">&gt;2.3</option></select></div>
        <div><label>Ascites</label><select id="cp-as"><option value="1">None</option><option value="2">Mild</option><option value="3">Mod–severe</option></select></div>
        <div><label>Encephalopathy</label><select id="cp-e"><option value="1">None</option><option value="2">Grade 1–2</option><option value="3">Grade 3–4</option></select></div>
      </div>
      <div class="out" id="cp-out">—</div>
    </div>

    <div class="calc">
      <h3>Max local anesthetic (lidocaine)</h3>
      <div class="frow">
        <div><label>Weight (kg)</label><input id="l-wt" type="number" min="1" inputmode="decimal"></div>
        <div><label>Epinephrine</label><select id="l-epi"><option value="0">Without</option><option value="1">With</option></select></div>
      </div>
      <div class="out" id="l-out">—</div>
    </div>

    <div class="calc">
      <h3>Y-90 activity — MIRD (glass)</h3>
      <p class="hint">A (GBq) = Dose (Gy) × mass (kg) / 50. Liver mass ≈ volume (mL) × 1.05 / 1000.</p>
      <div class="frow">
        <div><label>Target dose (Gy)</label><input id="y-d" type="number" value="120" inputmode="decimal"></div>
        <div><label>Perfused volume (mL)</label><input id="y-v" type="number" inputmode="decimal"></div>
      </div>
      <div class="out" id="y-out">—</div>
    </div>

    <p class="note" style="font-size:.76rem;color:var(--faint)">Decision-support only. Verify against institutional protocol and pharmacy. Formulas: CKD-EPI 2021; MELD 3.0 (Kim 2021); Cigarroa MACD; MIRD single-compartment.</p>`;

  const num = id => parseFloat($(id).value);
  const on = (ids, fn) => ids.forEach(id => $(id).addEventListener("input", fn));

  on(["#c-wt", "#c-scr"], () => {
    const wt = num("#c-wt"), scr = num("#c-scr");
    if (!wt || !scr) return $("#c-out").textContent = "—";
    const macd = Math.min((5 * wt) / scr, 300);
    $("#c-out").innerHTML = `MACD ≈ <b>${macd.toFixed(0)} mL</b> of full-strength contrast<div class="note">Dilute for DSA runs; consider CO₂ if eGFR &lt;30 (infradiaphragmatic only).</div>`;
  });

  on(["#g-age", "#g-scr"], calcGFR); $("#g-sex").addEventListener("change", calcGFR);
  function calcGFR() {
    const age = num("#g-age"), scr = num("#g-scr"), f = $("#g-sex").value === "f";
    if (!age || !scr) return $("#g-out").textContent = "—";
    const k = f ? 0.7 : 0.9, a = f ? -0.241 : -0.302;
    const g = 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.200 * 0.9938 ** age * (f ? 1.012 : 1);
    const band = g >= 60 ? "no CA-AKI precautions needed (ACR)" : g >= 30 ? "intermediate — individualize; minimize volume" : "eGFR <30 — IV volume expansion per ACR; consider CO₂ / staging";
    $("#g-out").innerHTML = `eGFR ≈ <b>${g.toFixed(0)}</b> mL/min/1.73m²<div class="note">${band}.</div>`;
  }

  on(["#m-bili", "#m-inr", "#m-scr", "#m-na", "#m-alb"], calcMELD); $("#m-sex").addEventListener("change", calcMELD);
  function calcMELD() {
    let b = num("#m-bili"), i = num("#m-inr"), c = num("#m-scr"), na = num("#m-na"), al = num("#m-alb");
    if (!b || !i || !c || !na || !al) return $("#m-out").textContent = "—";
    const F = $("#m-sex").value === "f" ? 1 : 0;
    b = Math.max(b, 1); i = Math.max(i, 1); c = Math.min(Math.max(c, 1), 3);
    na = Math.min(Math.max(na, 125), 137); al = Math.min(Math.max(al, 1.5), 3.5);
    let m = 1.33 * F + 4.56 * Math.log(b) + 0.82 * (137 - na) - 0.24 * (137 - na) * Math.log(b)
      + 9.09 * Math.log(i) + 11.14 * Math.log(c) + 1.85 * (3.5 - al) - 1.83 * (3.5 - al) * Math.log(c) + 6;
    m = Math.min(Math.round(m), 40);
    const risk = m < 15 ? "acceptable elective-TIPS candidate range" : m <= 18 ? "elevated risk — weigh urgency" : "high 90-day mortality risk for elective TIPS";
    $("#m-out").innerHTML = `MELD 3.0 = <b>${m}</b><div class="note">${risk}.</div>`;
  }

  const cpCalc = () => {
    const s = ["#cp-b", "#cp-a", "#cp-i", "#cp-as", "#cp-e"].reduce((t, id) => t + parseInt($(id).value), 0);
    const cls = s <= 6 ? "A" : s <= 9 ? "B" : "C";
    $("#cp-out").innerHTML = `Score <b>${s}</b> — Child-Pugh <b>${cls}</b>`;
  };
  ["#cp-b", "#cp-a", "#cp-i", "#cp-as", "#cp-e"].forEach(id => $(id).addEventListener("change", cpCalc));

  on(["#l-wt"], calcLido); $("#l-epi").addEventListener("change", calcLido);
  function calcLido() {
    const wt = num("#l-wt"); if (!wt) return $("#l-out").textContent = "—";
    const epi = $("#l-epi").value === "1";
    const mg = Math.min(wt * (epi ? 7 : 4.5), epi ? 500 : 300);
    $("#l-out").innerHTML = `Max <b>${mg.toFixed(0)} mg</b> = <b>${(mg / 10).toFixed(0)} mL</b> of 1% lidocaine${epi ? " with epi" : ""}`;
  }

  on(["#y-d", "#y-v"], () => {
    const d = num("#y-d"), v = num("#y-v");
    if (!d || !v) return $("#y-out").textContent = "—";
    const a = (d * (v * 1.05 / 1000)) / 50;
    $("#y-out").innerHTML = `Activity ≈ <b>${a.toFixed(2)} GBq</b> (${(a * 27.027).toFixed(0)} mCi)<div class="note">Decay-correct to treatment time; confirm with authorized-user physicist.</div>`;
  });
}

/* ---------- Omni-search UI ---------- */
function bindOmni() {
  const inp = $("#omniInput"), box = $("#omniResults");

  const render = () => {
    const q = inp.value.trim();
    if (!q) { box.hidden = true; box.innerHTML = ""; S.omniIdx = -1; return; }
    const res = searchProcedures(q).slice(0, 8);
    box.innerHTML = res.length
      ? res.map((p, i) => `
        <a class="omni-item ${i === S.omniIdx ? "active" : ""}" href="#/p/${p.id}">
          ${p.highYield ? `<span class="hy-star">★</span>` : `<span style="width:14px"></span>`}
          <span class="t"><b>${esc(p.title)}</b><small>${esc(catName(p.category))} · ${(p.modalities || []).map(esc).join("/")}</small></span>
        </a>`).join("")
      : `<div class="omni-empty">No matches — press Enter for full search.</div>`;
    box.hidden = false;
  };

  inp.addEventListener("input", debounce(() => { S.omniIdx = -1; render(); }, 90));
  inp.addEventListener("keydown", e => {
    const items = $$(".omni-item", box);
    if (e.key === "ArrowDown") { e.preventDefault(); S.omniIdx = Math.min(S.omniIdx + 1, items.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); S.omniIdx = Math.max(S.omniIdx - 1, -1); render(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (S.omniIdx >= 0 && items[S.omniIdx]) location.hash = items[S.omniIdx].getAttribute("href");
      else if (inp.value.trim()) location.hash = "#/search/" + encodeURIComponent(inp.value.trim());
      box.hidden = true; inp.blur();
    } else if (e.key === "Escape") { box.hidden = true; inp.blur(); }
  });
  box.addEventListener("click", () => { box.hidden = true; });
  document.addEventListener("click", e => { if (!e.target.closest("#omni")) box.hidden = true; });
}

/* ---------- Theme ---------- */
function setTheme(t) {
  S.theme = t;
  document.documentElement.dataset.theme = t;
  localStorage.setItem("irc-theme", t);
  $('meta[name="theme-color"]').content = t === "dark" ? "#0d1b24" : "#16303f";
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea")) return;
  if (e.key === "/") { e.preventDefault(); $("#omniInput").focus(); }
  else if (e.key.toLowerCase() === "s") setStudy(!S.study);
  else if (e.key.toLowerCase() === "c") { $("#calcDrawer").hidden ? openCalc() : closeCalc(); }
  else if (e.key === "Escape") { closeCalc(); document.body.classList.remove("nav-open"); }
});

/* ---------- Network status ---------- */
function netStatus() {
  const on = navigator.onLine;
  const dot = $("#netDot"), lab = $("#netLabel");
  if (dot) { dot.classList.toggle("off", !on); lab.textContent = on ? "Online" : "Offline — cached copy"; }
}

/* ---------- Service worker ---------- */
function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          toast("Updated content available.", "Refresh", () => location.reload(), 0);
        }
      });
    });
  }).catch(() => {/* offline-first is best-effort */});
}

/* ---------- Init ---------- */
async function init() {
  setTheme(S.theme);
  setStudy(S.study);

  $("#menuBtn").onclick = () => document.body.classList.toggle("nav-open");
  $("#scrim").onclick = () => document.body.classList.remove("nav-open");
  $("#calcScrim").onclick = closeCalc;
  $("#themeBtn").onclick = () => setTheme(S.theme === "dark" ? "light" : "dark");
  $("#studyToggle").onchange = e => setStudy(e.target.checked);
  $("#calcBtn").onclick = openCalc;
  window.addEventListener("online", netStatus);
  window.addEventListener("offline", netStatus);

  try {
    S.data = await window.loadCasebookData();
  } catch {
    $("#main").innerHTML = `<div class="view"><h1>Couldn’t load data</h1>
      <p>The database is unreachable and no local snapshot exists yet. If you opened index.html directly
      from disk, run a local server (e.g. <code>python3 -m http.server</code>) or deploy to GitHub Pages —
      the service worker needs http(s).</p></div>`;
    return;
  }
  S.data.procedures.forEach(p => S.byId.set(p.id, p));

  buildSidebar();
  buildCalcDrawer();
  bindOmni();
  netStatus();
  window.addEventListener("hashchange", route);
  route();
  registerSW();
}

init();

