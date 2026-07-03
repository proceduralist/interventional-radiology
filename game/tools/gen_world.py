#!/usr/bin/env python3
"""Generate game/js/world_data.js from the UMass Chan May-2025 site plan PDF.
Buildings: color-segmented -> 80x100 tile masks (label-seeded split of merged
masses, radius caps for small buildings). Lots: gray fills. Roads: hand-traced
polylines matching the plan. Sidewalks: BFS door->nearest road, baked."""
import fitz, numpy as np, json, math
from collections import deque, defaultdict
from PIL import Image, ImageDraw

X0, X1, Y0, Y1 = 200, 4600, 1100, 6600
COLS, ROWS = 80, 100
TW, TH = (X1 - X0) / COLS, (Y1 - Y0) / ROWS

a = np.asarray(Image.open("campus2x.png")).astype(np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
navy = (r < 70) & (g < 80) & (b > 120) & (b < 210)
cyan = (r > 60) & (r < 150) & (g > 180) & (b > 190)
steel = (r > 90) & (r < 160) & (g > 130) & (g < 190) & (b > 180) & (b < 230)
gray = (abs(r - g) < 12) & (abs(g - b) < 12) & (r > 178) & (r < 228)

def to_grid(mask, thresh):
    out = np.zeros((ROWS, COLS), bool)
    for i in range(ROWS):
        ys, ye = int(Y0 + i * TH), int(Y0 + (i + 1) * TH)
        for j in range(COLS):
            xs, xe = int(X0 + j * TW), int(X0 + (j + 1) * TW)
            if mask[ys:ye, xs:xe].mean() > thresh: out[i, j] = True
    return out

bgrid = to_grid(navy | cyan | steel, 0.32)
bgrid[:6, :22] = False  # legend / logo
lgrid = to_grid(gray, 0.30)

# ---- connected components over buildings ------------------------------------
comp = np.full(bgrid.shape, -1, int); ncomp = 0
for i in range(ROWS):
    for j in range(COLS):
        if bgrid[i, j] and comp[i, j] < 0:
            q = deque([(i, j)]); comp[i, j] = ncomp
            while q:
                y, x = q.popleft()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < ROWS and 0 <= xx < COLS and bgrid[yy, xx] and comp[yy, xx] < 0:
                        comp[yy, xx] = ncomp; q.append((yy, xx))
            ncomp += 1
cells_by_comp = defaultdict(list)
for i in range(ROWS):
    for j in range(COLS):
        if comp[i, j] >= 0: cells_by_comp[comp[i, j]].append((i, j))

# seeds: (2x-px from PDF text labels) -> tile coords; cap = max BFS radius (tiles)
S = {
 "garage_plantation": (2465, 1601, None), "biotech5": (1900, 2420, None), "biotech4": (1838, 2902, None),
 "anderson": (2711, 2755, None), "pavilion": (3100, 3214, None), "biotech2": (1727, 3453, None),
 "biotech3": (1234, 3703, None), "mercadante": (2361, 3474, None), "p367": (1610, 4103, None),
 "garage_bio3": (760, 4128, None), "biotech1": (1317, 4701, None), "powerplant": (4025, 3848, None),
 "sherman": (2367, 4010, None), "msb": (3128, 4152, None), "ummmc": (3399, 4666, None),
 "garage_west": (2159, 4435, None), "dimare": (2481, 4482, 2.2), "lazare": (2329, 5000, None),
 "benedict": (3298, 5112, 2.4), "leahy": (2091, 5855, None), "acc": (2949, 5834, None),
 "garage_south": (3185, 5827, None), "va": (3742, 5697, None), "army": (4204, 5712, None),
 "shaw": (4318, 6076, None),
}
seeds = {k: ((px - X0) / TW, (py - Y0) / TH, cap) for k, (px, py, cap) in S.items()}
FALLBACK = {"dimare": "garage_west", "benedict": "ummmc"}  # capped overflow goes to neighbor

seed_comp = {}
for k, (sx, sy, cap) in seeds.items():
    best = (1e9, None)
    for c, cells in cells_by_comp.items():
        if len(cells) < 3: continue
        d = min((sy - i - 0.5) ** 2 + (sx - j - 0.5) ** 2 for i, j in cells)
        if d < best[0]: best = (d, c)
    seed_comp[k] = best[1]
comp_seeds = defaultdict(list)
for k, c in seed_comp.items(): comp_seeds[c].append(k)

assign = {}
for c, ks in comp_seeds.items():
    cells = set(cells_by_comp[c])
    if len(ks) == 1:
        for cell in cells: assign[cell] = ks[0]
        continue
    owner, dist, q = {}, {}, deque()
    for k in ks:
        sx, sy, cap = seeds[k]
        start = min(cells, key=lambda cl: (sy - cl[0] - 0.5) ** 2 + (sx - cl[1] - 0.5) ** 2)
        if start not in owner: owner[start] = k; dist[start] = 0; q.append(start)
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (y + dy, x + dx)
            if n in cells and n not in owner:
                k = owner[(y, x)]; nd = dist[(y, x)] + 1
                cap = seeds[k][2]
                if cap and nd > cap and FALLBACK.get(k):
                    owner[n] = FALLBACK[k]; dist[n] = nd
                else:
                    owner[n] = k; dist[n] = nd
                q.append(n)
    assign.update(owner)
# leftover comps >=4 tiles become unnamed deco
extra = 0
for c, cells in cells_by_comp.items():
    if c not in comp_seeds and len(cells) >= 4:
        extra += 1
        for cell in cells: assign[cell] = f"deco{extra}"
# manual claims: benedict pokes south to HP Lot so it owns a real south facade
for cell in [(75, 55), (75, 56), (75, 57)]:
    if cell in assign: assign[cell] = "benedict"
# east-facing entrances (facade is another building / no south face at tile res)
DOOR_OVERRIDE = {"dimare": (45, 62, "e")}

solid_roof = np.zeros((ROWS, COLS), bool)
owner_grid = np.full((ROWS, COLS), "", dtype=object)
for (i, j), k in assign.items(): solid_roof[i, j] = True; owner_grid[i, j] = k

# ---- walls: 2 rows below every south edge (clipped by gaps) ------------------
wall = np.zeros((ROWS, COLS), bool)
wall_owner = np.full((ROWS, COLS), "", dtype=object)
for i in range(ROWS):
    for j in range(COLS):
        if solid_roof[i, j] and (i + 1 >= ROWS or not solid_roof[i + 1, j]):
            for d in (1, 2):
                if i + d < ROWS and not solid_roof[i + d, j]:
                    wall[i + d, j] = True; wall_owner[i + d, j] = owner_grid[i, j]
                else: break
solid = solid_roof | wall

# ---- roads (hand-traced polylines, tile coords) ------------------------------
MAIN, MINOR = 1.25, 0.85
ROADS = [
 ("plantation", MAIN, [(49,0),(46,6),(41,14),(36,22),(32,30),(30,38),(28.5,46),(28,53),(27,59),(25,65),(22,72),(17,82),(11,92),(8,97)]),
 ("northrd", MAIN, [(28.7,47),(38,46.5),(48,45.5),(57,44.5),(66,42.5),(73,41),(79,39.5)]),
 ("lakeave", MAIN, [(80,32),(79,38),(78.5,50),(78.5,64),(78,78),(77,90),(76.5,97)]),
 ("belmont", MAIN, [(0,97.5),(20,97),(45,96.5),(70,95.5),(80,95)]),
 ("southrd", MAIN, [(25,67),(32,71),(40,74),(48,76.5),(54,77),(60,76),(65,73),(70,70.5),(78,68.5)]),
 ("researchdr", MINOR, [(0,84),(6,82),(12,79.5),(18,76.5),(23,72),(25,67)]),
 ("recoveryrd", MINOR, [(0,40),(10,39.5),(20,39),(30,38)]),
 ("innovation", MINOR, [(28,56),(20,58),(13,60),(7,62),(2,66)]),
 ("clocktower", MINOR, [(8.5,50.5),(4,48),(0,47)]),
 ("hospdrive", MINOR, [(61,46.5),(62,52),(63,58),(63,63),(62,67),(60,71),(57,74.5),(54,77)]),
 ("fifthrd", MINOR, [(66,43),(67,47),(66.5,51)]),
 ("thirdrd", MINOR, [(43.5,70),(44,68.5),(52,68.5)]),
 ("firstrd", MINOR, [(43,70),(42.5,74),(42.7,75.5)]),
 ("secondrd", MINOR, [(48.5,70),(48.5,76.5)]),
]
terrain = np.zeros((ROWS, COLS), np.uint8)  # 0 grass 1 road 2 sidewalk 3 parking
# lots are white-with-hatching on the plan (not extractable) -> placed at label positions
LOTS = [(49, 46, 6, 3), (68, 43, 5, 3), (59, 50, 3, 6), (54, 78, 5, 2), (65, 65, 6, 5),
        (60, 90, 8, 4), (28, 79, 6, 4), (19, 90, 6, 4), (50, 73, 3, 2), (12, 33, 5, 3)]
for (lx, ly, lw, lh) in LOTS:
    for i in range(ly, ly + lh):
        for j in range(lx, lx + lw):
            if 0 <= i < ROWS and 0 <= j < COLS and not solid[i, j]: terrain[i, j] = 3
for _, wdt, pts in ROADS:
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(x2 - x1, y2 - y1) * 3))
        for t in range(n + 1):
            cx, cy = x1 + (x2 - x1) * t / n, y1 + (y2 - y1) * t / n
            for i in range(max(0, int(cy - wdt - 1)), min(ROWS, int(cy + wdt + 2))):
                for j in range(max(0, int(cx - wdt - 1)), min(COLS, int(cx + wdt + 2))):
                    if (j + 0.5 - cx) ** 2 + (i + 0.5 - cy) ** 2 <= wdt * wdt and not solid[i, j]:
                        terrain[i, j] = 1

# ---- doors + BFS sidewalks ----------------------------------------------------
LOCKED = {"garage_plantation", "garage_west", "garage_south", "garage_bio3", "powerplant",
          "army", "mercadante", "p367"} | {f"deco{i+1}" for i in range(extra)}
blds = defaultdict(list)
for (i, j), k in assign.items(): blds[k].append((i, j))
doors = {}; door_side = {}
for k, cells in blds.items():
    if k in DOOR_OVERRIDE:
        c, rr, side = DOOR_OVERRIDE[k]; doors[k] = (c, rr); door_side[k] = side
        continue
    sx = seeds[k][0] if k in seeds else np.mean([c[1] for c in cells]) + 0.5
    cand = []
    for (i, j) in cells:
        if wall[min(i + 1, ROWS - 1), j] and wall[min(i + 2, ROWS - 1), j] and i + 3 < ROWS and not solid[i + 3, j]:
            cand.append((abs(j + 0.5 - sx), i, j))
    if not cand:  # fallback: any open cell adjacent below the mass
        for (i, j) in cells:
            if i + 1 < ROWS and not solid[i + 1, j]: cand.append((abs(j + 0.5 - sx), i - 2, j))
    cand.sort()
    _, i, j = cand[0]
    doors[k] = (j, i + 3)  # tile the player stands on in front of the door
    door_side[k] = "s"
for k, (dc, dr) in doors.items():
    if k in LOCKED: continue
    # BFS through non-solid to nearest road
    start = (dr, dc); prev = {start: None}; q = deque([start]); goal = None
    while q:
        y, x = q.popleft()
        if terrain[y, x] == 1: goal = (y, x); break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (y + dy, x + dx)
            if 0 <= n[0] < ROWS and 0 <= n[1] < COLS and n not in prev and not solid[n[0], n[1]]:
                prev[n] = (y, x); q.append(n)
    if goal is None: print("WARN no road reachable from", k); continue
    node = prev[goal]
    while node:
        if terrain[node[0], node[1]] == 0: terrain[node[0], node[1]] = 2
        node = prev[node]
    if terrain[dr, dc] == 0: terrain[dr, dc] = 2

# ---- skybridge: narrowest gap between sherman east and msb west ---------------
best = None
sherman = set(blds["sherman"]); msb = set(blds["msb"])
for (i, j) in sherman:
    jj = j + 1
    while jj < COLS and not solid_roof[i, jj]: jj += 1
    if jj < COLS and owner_grid[i, jj] == "msb" and (best is None or jj - j < best[2]):
        best = (i, j + 1, jj - j - 1)
sky = {"row": best[0], "x": best[1], "w": best[2]} if best else None
print("skybridge:", sky)
# msb<->ummmc contiguity check
touch = any((i + 1, j) in set(blds["ummmc"]) or (i, j + 1) in set(blds["ummmc"]) or (i, j - 1) in set(blds["ummmc"])
            for (i, j) in msb)
print("msb touches ummmc:", touch)

# ---- emit ---------------------------------------------------------------------
out_b = {}
for k, cells in sorted(blds.items()):
    ys = [c[0] for c in cells]; xs = [c[1] for c in cells]
    oy, ox = min(ys), min(xs); h = max(ys) - oy + 1; w = max(xs) - ox + 1
    m = [["0"] * w for _ in range(h)]
    for i, j in cells: m[i - oy][j - ox] = "1"
    out_b[k] = {"x": ox, "y": oy, "w": w, "h": h, "mask": ["".join(row) for row in m],
                "door": list(doors[k]), "side": door_side[k]}
tchars = {0: ".", 1: "r", 2: "s", 3: "p"}
data = {
 "COLS": COLS, "ROWS": ROWS,
 "terrain": ["".join(tchars[terrain[i, j]] for j in range(COLS)) for i in range(ROWS)],
 "buildings": out_b,
 "skybridge": sky,
 "helipad": {"x": 68, "y": 61},
 "labels": {
   "greens": [[48, 64, "Quad 1"], [46, 73, "Quad 2"], [45, 83, "Quad 3"], [44, 91, "Quad 4"], [77, 60, "Quinsigamond\nState Park"]],
   "lots": [[52, 48, "Library Lot"], [71, 45, "Facilities Lot"], [61, 53, "Clinical Lot"], [56, 77, "HP Lot"], [68, 68, "MD Cross Campus Lot"], [64, 93, "VA Parking"], [31, 81, "Lower Pine Tree Lot"], [22, 93, "Upper Pine Tree Lot"], [51, 74, "Valet"], [61, 72, "Drop-off"]],
   "streets": [[40, 22, -62, "Plantation Street"], [57, 44, -6, "North Road"], [79, 55, -90, "Lake Avenue North"], [45, 97, 0, "Belmont Street (Rte 9)"], [42, 75, 12, "South Road"], [8, 81, -18, "Research Drive"], [15, 59, 8, "Innovation Drive"]],
   "signs": [[6, 94, "← Downtown Worcester"], [72, 92, "Shrewsbury →"], [47, 1, "↑ to I-290"], [3, 38, "← Worcester Recovery Ctr"]],
 },
 "spawn": {"x": 45, "y": 95},
}
js = "/* GENERATED by gen_world.py from campus-map-may-2025-letter.pdf — do not hand-edit.\n   Tile masks color-segmented from the site plan; roads traced from the plan. */\n"
js += "(function(root){\n\"use strict\";\nconst D = " + json.dumps(data, separators=(",", ":")) + ";\n"
js += "if (typeof module!==\"undefined\" && module.exports) module.exports = D; else root.IRWorldData = D;\n})(typeof window!==\"undefined\"?window:globalThis);\n"
open("/sessions/cool-dreamy-franklin/mnt/Interventional Radiology/game/js/world_data.js", "w").write(js)
print("wrote world_data.js;", len(out_b), "buildings; terrain rows", len(data["terrain"]))

# ---- debug render -------------------------------------------------------------
SC = 8
img = Image.new("RGB", (COLS * SC, ROWS * SC), (30, 46, 32))
d = ImageDraw.Draw(img)
tc = {1: (60, 65, 74), 2: (155, 161, 169), 3: (46, 51, 60)}
for i in range(ROWS):
    for j in range(COLS):
        if terrain[i, j]: d.rectangle([j * SC, i * SC, (j + 1) * SC - 1, (i + 1) * SC - 1], fill=tc[terrain[i, j]])
import colorsys
ids = sorted(out_b.keys())
for n, k in enumerate(ids):
    bb = out_b[k]
    col = tuple(int(c * 255) for c in colorsys.hsv_to_rgb((n * 0.37) % 1, 0.6, 0.95))
    for i, row in enumerate(bb["mask"]):
        for j, ch in enumerate(row):
            if ch == "1": d.rectangle([(bb["x"] + j) * SC, (bb["y"] + i) * SC, (bb["x"] + j + 1) * SC - 1, (bb["y"] + i + 1) * SC - 1], fill=col)
    dc, drr = bb["door"]
    d.rectangle([dc * SC, drr * SC, (dc + 1) * SC - 1, (drr + 1) * SC - 1], outline=(255, 230, 120), width=2)
for i in range(ROWS):
    for j in range(COLS):
        if wall[i, j]: d.point((j * SC + SC // 2, i * SC + SC // 2), fill=(0, 0, 0))
if sky: d.rectangle([sky["x"] * SC, sky["row"] * SC - 4, (sky["x"] + sky["w"]) * SC, sky["row"] * SC + 8], outline=(255, 120, 220), width=2)
orig = Image.open("campus2x.png").crop((X0, Y0, X1, Y1)).resize((COLS * SC, ROWS * SC))
combo = Image.new("RGB", (COLS * SC * 2 + 20, ROWS * SC), (255, 255, 255))
combo.paste(orig, (0, 0)); combo.paste(img, (COLS * SC + 20, 0))
combo.save("world_final_vs_pdf.png")
print("debug saved")
