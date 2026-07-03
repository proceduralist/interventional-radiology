/* IR RPG — network layer.
   Supabase Auth (email/password) for accounts + saves; anon REST for content
   (RLS enforces everything). Uses the supabase-js v2 CDN global `supabase`.
   Exposes window.IRNet. */
(function (root) {
  "use strict";
  const CFG = root.IRC_CONFIG || {};
  let client = null;

  function init() {
    if (client) return client;
    if (!root.supabase || !CFG.SUPABASE_URL) return null;
    client = root.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  async function rest(path) {
    const res = await fetch(CFG.SUPABASE_URL + "/rest/v1/" + path, {
      headers: { apikey: CFG.SUPABASE_KEY },
    });
    if (!res.ok) throw new Error("REST " + res.status + " on " + path);
    return res.json();
  }

  // --- auth ---------------------------------------------------------------
  async function currentUser() {
    const c = init(); if (!c) return null;
    const { data } = await c.auth.getUser();
    return data ? data.user : null;
  }
  async function signUp(email, password, displayName) {
    const c = init();
    const { data, error } = await c.auth.signUp({
      email, password, options: { data: { display_name: displayName || "Resident" } },
    });
    if (error) throw error;
    return data.user;
  }
  async function signIn(email, password) {
    const c = init();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }
  async function signOut() { const c = init(); if (c) await c.auth.signOut(); }

  // --- saves (player_saves, owner-only via RLS) --------------------------
  async function loadSlots() {
    const c = init(); if (!c) return [];
    const { data, error } = await c.from("player_saves").select("slot,save,updated_at").order("slot");
    if (error) throw error;
    return data || [];
  }
  async function writeSlot(slot, save) {
    const c = init();
    const user = await currentUser();
    if (!user) throw new Error("not signed in");
    const { error } = await c.from("player_saves")
      .upsert({ user_id: user.id, slot, save, updated_at: new Date().toISOString() }, { onConflict: "user_id,slot" });
    if (error) throw error;
  }

  // --- case logs ----------------------------------------------------------
  async function writeCaseLog(row) {
    const c = init();
    const user = await currentUser();
    if (!user) throw new Error("not signed in");
    const { error } = await c.from("case_logs").insert({
      user_id: user.id,
      procedure_id: row.procedure_id,
      score_total: row.score_total,
      score_detail: row.score_detail || {},
      patient_seed: row.patient_seed || {},
    });
    if (error) throw error;
  }

  root.IRNet = { init, rest, currentUser, signUp, signIn, signOut, loadSlots, writeSlot, writeCaseLog };
})(window);
