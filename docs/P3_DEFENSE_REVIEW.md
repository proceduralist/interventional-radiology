# P3 Conference Defense — accuracy & design review (for Ryan)

Built 2026-07-03 · DB migration `p3_defense_seed` (data_version 62) · repo copy `db/seed_p3_defense.sql`

## What shipped

The Sherman Center auditorium (its lobby kiosk) now runs the spec §10 defense loop:
**Green room** shows the dossier — rendered directly from the `papers` row for Ahn 2012
(PMID 22563269, the paper already grounding the chest-port patient generator).
**Podium** spawns 3–5 critics (one question each, distinct archetypes, paper-specific
templates preferred). **Credibility** starts at 100; each wrong answer costs 20–30;
below 30 you are ejected with zero reward and a clout penalty.
**Verdict** awards Academic Clout that feeds the existing payout-tier multiplier,
with diminishing returns for re-presenting the same paper.

Gating: you must have ≥1 completed case to present ("no results, no podium").

## The accuracy contract, applied

- Every correct answer is the **literal entered value** from the `papers` row —
  either resolved live via `answer_path` (e.g. `baselines.female_pct`) or a
  hand-authored `literal:` string that quotes the entered data.
- Distractors are **systematic perturbations** (wrong N ±7–18%, shifted percents,
  shifted years) or hand-authored wrong options. The perturbation strategies can
  produce numbers that *look* plausible — that is the point — but they are only
  ever presented as answer options, never asserted as fact.
- One deliberate "trick" question (rival archetype) asks for the paper's radiation
  dose table; the correct answer is *"The paper does not report fluoroscopy time
  or dose"* — matching your note on the papers row. The distractors include the
  Jonczyk DAP value to punish citing the wrong source. **Please confirm you like
  this pattern** before I replicate it.

## DESIGN values to review (`game_config.defense_rewards`)

| Key | Value | Note |
|---|---|---|
| base_clout | 40 | perfect defense = 60 (base + full credibility bonus) |
| credibility_bonus_max | 20 | scaled over the 30–100 credibility span |
| repeat_mult | 0.25 | same-paper repeats: 60 → 15 → 4 → … |
| eject_clout_penalty | 10 | reputation damage |
| min_cases_to_present | 1 | gate |
| questions_min/max | 3 / 5 | per spec §10 |
| matching_grant_cap | 5000 | KOL tier, once per save (`grantClaimed`) |

Existing `credibility_gauge` (100 start / fail <30 / −20..30) and `clout_tiers`
were already in the DB and are used as-is. Note the KOL tier's `payout_mult` is
currently **1.2 — same as Rising Researcher**; spec table implies it should differ.
Want me to change it?

## Data-entry hooks for you

- 6 generic templates work for ANY published paper with the standard fields —
  when you enter the next paper and link it via `procedure_papers` (role
  `defense`), it gets a working gauntlet with zero extra work.
- Hand-authored per-paper questions: add rows to `defense_question_templates`
  with the paper's `paper_id`, `answer_path` = `literal:<the entered value>`,
  and 3 wrong `options`. The dashboard's generic table editor can do this today.
- `instant_supply` (Academic Chief) is stored but not yet wired to the shop —
  flagged for a later pass.

## Tests

`game/tests/defense.test.js` (6): answers always literal data; options unique;
one question per archetype; foreign-paper templates never leak; determinism per
seed; 20–30 credibility drain + ejection; clout math incl. repeat decay; dossier
fidelity. Plus a jsdom click-through of green room → podium → verdict.
