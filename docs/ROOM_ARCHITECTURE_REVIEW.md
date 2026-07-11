# Room Architecture Review — The Quad + No-Nesting Refactor

_Session 2026-07-10. Scope: finish The Quad; bring every built room into line with the
project's movement/architecture rules. Fade-to-black is **not** used (your call). All 13
test suites (96 tests) green; scene rendering still needs a browser playtest._

---

## 1. What changed

1. **The Quad is finished** — striped mowed lawn with a paved promenade that links every
   surrounding entrance (Med School, research towers, hospital), benches, lamp posts and
   trees, all scaled to the 2× cast.
2. **Scale coherence** — the interrupted 2× character pass left the campus trees and quad
   furniture at the old 1× size. Trees now render 1.5× (they tower over people again);
   quad benches/lamps 2×, quad trees 1.5×; trunk/collision zones updated to match.
3. **No-Nesting fix** — the IR/CT/US suites, Sim Lab, Procurement, Staff Lounge, call
   rooms and the lobby's themed rooms were all drawn as fully-walled boxes floating
   **inside** the larger floor room (a room inside a room). They are now either the whole
   floor (single-suite floors) or **adjacent rooms sharing one partition wall with a
   doorway** — the same-level "seamless" connection from your instructions.

---

## 2. The Quad — Mandatory Architectural Output

- **Map Node Name:** The Quad (campus green)
- **Level ID:** Overworld — UMass Chan Campus (part of the single scrolling Level Node;
  it is outdoor ground, not a separate map)
- **Movement Type:** **Seamless / Panning.** The quad is open terrain inside the Overworld
  node — the camera pans across it exactly like the rest of campus. You do **not** cross a
  gateway to be "in" the quad; you cross a gateway (a building door) only when you leave it
  to go inside a building.
- **Coordinate Bounds** (32 px tiles; world is 58×54 = 1856×1728 px):
  - Lawn: tiles cols 17–30 × rows 19–30 → px **x[544, 992], y[608, 992]**
  - Promenade (E–W): row 28 → y≈896; cols 14–35 → x[448, 1152]
  - Spine (N–S from the MSB door): col 24 → x≈768; rows 19–30
- **Portal Coordinates:** The quad owns **no portals** — it is a connective space. The
  promenade walks you to the surrounding gateways (each a Hard Transition into that
  building):
  - MSB / Med School door — tile (24,19) → px (784, 624)
  - UMass Memorial door — tile (35,29) → px (1136, 944)  → `Hospital`
  - DiMare door — tile (14,29) → px (464, 944)
  - Lazare door — tile (7,29) → px (240, 944)
  - ACC door — tile (21,33) → px (688, 1072), across the south road
- **Logic Structure:** pure data + painters, no portal logic (seamless):
  ```
  world_data.js  terrain:  'q'/'Q' = mowed-lawn stripes,  's' = paved path
                 quad:     { benches[], lamps[], trees[] }   (tile coords)
                 labels.greens: [[24,26,"The Quad"]]
  world.js       tileset painter draws the lawn stripes; t_bench/t_lamp painters
  scenes.js      Overworld renders furniture Y-sorted (setDepth = y) with trunk/seat
                 collision zones; promenade tiles are walkable (never solid)
  Regenerate:    python3 game/tools/gen_campus.py   → rewrites world_data.js
  ```

---

## 3. Hospital floors — before / after (No-Nesting rule)

**Before:** every floor drew a big walled shell, and inside it a smaller fully-walled
`procRoom` box (IR suite, Sim Lab, etc.) with dead floor between the two — a room nested
in a room.

**After — two compliant patterns:**

- **Single-suite floors (3 IR / 4 CT / 5 US):** the **floor *is* the room** — one node.
  The floor's own walls are the suite walls; the north wall carries the suite's accent
  stripe + name; the C-arm / gantry / cart and the control-room & reading-room interaction
  points fill the open floor. No inner box.
- **Multi-room floors (B Sim Lab + Procurement, 6 Lounge + 3 Call Rooms):** the floor is
  divided into **adjacent rooms** by a single shared **partition wall with a doorway**
  (`partition(x, doorCY)`), each room dressed with `suiteDress(...)`. The player walks
  room→room through the doorway — same level, seamless, no gateway, no nesting.

**Representative node — 3rd Floor IR Suite:**
- **Map Node Name:** IR Suite
- **Level ID:** 3rd Floor (Hospital)
- **Movement Type:** the suite itself = the floor node (Seamless within). Reaching other
  floors = **Hard Gateway** via the north-wall elevator/stairs (coordinate reset, no pan).
- **Coordinate Bounds:** floor interior px x[130, 830], y[232, 590]
- **Portal Coordinates (gateways on the north wall):** Elevator (240, 262) → any floor;
  Stairs ↑ (660, 262) → 4th; Stairs ↓ (760, 262) → 2nd. Handshake spawn on arrival:
  (480, 520) in the suite; ward/lobby floors spawn (480, 420).
- **Logic Structure:**
  ```
  scene.restart({ floor })            // hard gateway, coordinate reset
  suiteDress(130,830,accent,"IR SUITE")   // one room = whole floor
  // patient arrives on the table only after the 2nd-floor ward consult (wheel-away
  // cutscene → elevator → this floor), preserving the ward→suite handshake.
  ```

**Basement layout (adjacency example):**
```
[ SIMULATION LAB ]  |doorway|  [ PROCUREMENT / SUPPLY ]
 x130 ........ x476  partition   x476 ........ x830
 elevator (west)      @x476,y520   stairs (east)
```
Spawn moved to (300, 520) on B and 6 so you never start inside the central partition.

---

## 4. Lobby (all campus buildings)

The themed rooms behind each sign (auditorium, cafe, lab, study, clinic, office) were
floating boxes with gaps. They now **tile the hall edge-to-edge as adjacent rooms sharing
partition walls**, attached to the north wall, each opening **south into the shared lobby
hall** (the hub). Same content (stage + speaker + seated audience, counter + barista +
customers, etc.), now laid out per the adjacency rule instead of nested.

- **Movement Type:** hall = the floor node (Seamless); each themed room is adjacent off it.
  Building entry/exit and MSB→Memorial corridor and MSB→Library stairs remain **Hard
  Gateways** (`scene.start` / `scene.restart`, coordinate reset).

---

## 5. Compliance checklist (vs. project rules)

| Rule | Status |
|---|---|
| 3/4 top-down oblique, 16/32 px grid | ✅ unchanged, all tile-aligned |
| Fully-realized scenes (never signposts) | ✅ every room has floor/walls, furniture, NPCs, embedded interactions |
| Y-sorting (depth = entity Y) | ✅ player, NPCs, furniture, trees, cars |
| Grid-aligned collisions | ✅ walls, partitions, furniture, trunks all have static bodies |
| Same-level = seamless panning, adjacent | ✅ sub-rooms now adjacent w/ doorways (no nesting) |
| Floor↔floor / building↔interior = hard gateway + coordinate reset | ✅ elevator/stairs/doors reset coords (fade-to-black intentionally omitted) |
| No nesting (each room a unique node) | ✅ **fixed this pass** |
| Consistent handshakes (spawn coords) | ✅ arrival spawns defined per gateway; B/6 spawn clear of partitions |

---

## 6. Needs a browser playtest (can't verify headless)

Phaser scene rendering isn't node-testable. On the Pages URL after you push, please eyeball:
- Quad: promenade actually reads as connecting MSB ↔ hospital ↔ towers; furniture scale.
- Each refactored floor: doorways line up, you can walk room→room and reach the
  elevator/stairs, nothing spawns inside a wall, equipment isn't clipped by a partition.
- Overworld tree size vs. the 2× player (1.5× is my estimate — easy to nudge).

---

## 7. Physics pass (collisions + traffic)

The root cause: `wireNpcPhysics` existed but was **never called**, and cars were plain
tweened images with no bodies. Both fixed.

- **People never phase through anything.** `wireNpcPhysics(scene, solids)` is now called in
  the Overworld, both Lobby floors and every Hospital floor, after the player + NPCs exist.
  It colliders each patrolling NPC against the walls/furniture (`solids`), against **other
  NPCs**, against the **player**, and against **cars**. Idle/seated NPCs were already static
  bodies inside `solids`, so the player and moving NPCs stop on them too. NPCs are
  `pushable = false` so the player can't shove staff around.
- **The player can't walk through walls, people, cars, or objects.** Player↔solids (walls +
  furniture + idle-NPC zones), player↔NPCs, and player↔cars colliders are all in place.
- **Cars are real physics bodies now** (immovable, velocity-driven), not tweens. Per frame
  (`updateCars`): a car looks ahead in its lane; if a **person (player or NPC)** is within
  ~48 px it **stops, shows a `HONK!` bubble (+ a short Web-Audio beep) and waits** until they
  move; if another **car** is close ahead it **queues** (no overlap); otherwise it cruises.
  Cars wrap at the map edges to keep traffic looping, and freeze while a menu/map overlay is
  open. Look-ahead braking is what prevents car↔car and car↔person overlap (two immovable
  bodies can't separate, so stopping short is the mechanism).
- **Note:** the Overworld currently has no pedestrian NPCs, so on campus the honk fires for
  **you** crossing a road; the NPC path is exercised anywhere staff patrol (lobbies/hospital
  have no cars, but the code is general). Say the word if you want a few campus pedestrians
  added so the car-vs-NPC honk is visible outdoors.

_Honk = visual `HONK!` bubble always; the beep is best-effort (browsers block audio until
you've clicked once — after the login click it works)._

## 8. Commit (from your Mac — sandbox can't push)

```bash
cd ~/Documents/Claude/Projects/Interventional\ Radiology
rm -f .git/index.lock
git add -A
git commit -m "Quad promenade + no-nesting rooms + real physics (NPC/car collisions, cars stop+honk for people)"
git push
```
_Hard-refresh after pushing (service worker is network-first for /game/, but close stale tabs)._
