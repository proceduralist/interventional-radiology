#!/usr/bin/env python3
"""Generate game/js/world_data.js — hand-authored UMass Chan campus laid out by the
relationships + road/water grid Ryan specified (replaces the PDF-extracted layout).
Vertical spacing leaves room for the 2-tile south wall faces so nothing overlaps roads.
Emits COLS/ROWS, buildings (+facade spec), terrain (roads/water/bridges), skybridges,
spawn, helipad, labels. Node-testable geometry."""
import json, os

COLS, ROWS = 58, 54
WALL = 2   # must match world.js WALL (south wall face is WALL tiles tall)

NORTH_ROAD = 9       # horizontal, full width, 2 tiles N of Sherman/MedSchool (top y=12)
SOUTH_ROAD = 32      # horizontal, splits hospital/Lazare (N) from ACC (S)
ROUTE9     = 50      # main E-W road; bridges over the water
PLANTATION = 2       # vertical, full height, W of the buildings (x>=5)
LAKE_AVE   = 51      # vertical, full height, well E of the buildings (room for helipad + plant)
WATER      = [54, 55, 56]   # column ~2 E of Lake Ave, full N-S
HROADS = [NORTH_ROAD, SOUTH_ROAD, ROUTE9]
VROADS = [PLANTATION, LAKE_AVE]

# id -> geometry + door column/side + facade spec (Ryan's building specs)
BLD = {
 "sherman": dict(x=5,  y=12, w=12, h=6,  dcol=8,  side="s", floors=11, facade="glass",     wall="#cbd0d6", roof="#39414d", accent="#9fb7cc", glass="#9fb7cc", short="SHERMAN"),
 "msb":     dict(x=20, y=12, w=20, h=5,  dcol=24, side="s", floors=9,  facade="punched",   wall="#d8d1c2", roof="#7c848c", accent="#9fb7cc", glass="#5f6570", short="MED SCHOOL"),
 "ummmc":   dict(x=31, y=17, w=9,  h=10, dcol=35, side="s", floors=8,  facade="punched",   wall="#d8d1c2", roof="#8a9298", accent="#b5502f", glass="#5f6570", short="UMASS MEMORIAL"),
 "dimare":  dict(x=12, y=22, w=5,  h=5,  dcol=14, side="s", floors=14, facade="darkglass", wall="#2f3a49", roof="#232a33", accent="#c8ccd0", glass="#39465a", short="DIMARE"),
 "lazare":  dict(x=5,  y=22, w=6,  h=5,  dcol=7,  side="s", floors=9,  facade="punched",   wall="#d8d1c2", roof="#8a9298", accent="#2e6db4", glass="#5f6570", short="LAZARE"),
 "acc":     dict(x=20, y=34, w=4,  h=10, dcol=21, side="n", floors=7,  facade="glass",     wall="#6f93b8", roof="#8a9298", accent="#b5502f", glass="#5a7ea3", short="ACC"),
 "powerplant": dict(x=42, y=16, w=5, h=4, dcol=44, side="s", floors=3, facade="punched",  wall="#62584a", roof="#4a423a", accent="#8a7a5a", glass="#3a342c", short="POWER"),
}
SKY = [
 {"x":17,"y":14,"w":3,"h":2, "a":"sherman","b":"msb"},     # Sherman E <-> Med School W (open gap x17-19)
 {"x":13,"y":20,"w":2,"h":2, "a":"sherman","b":"dimare"},  # Sherman S wall(18-19) <-> DiMare roof(22): gap y20-21
]
SPAWN = {"x":10, "y":10}          # grass between the north road and the buildings
HELIPAD = {"x":42, "y":23}        # ground pad in the gap between the buildings and Lake Ave

def door_of(b):
    if b["side"] == "s": return [b["dcol"], b["y"] + b["h"] + WALL]   # below the 2-tile wall face
    if b["side"] == "n": return [b["dcol"], b["y"] - 1]
    if b["side"] == "e": return [b["x"] + b["w"], b["y"] + b["h"] // 2]
    return [b["x"] - 1, b["y"] + b["h"] // 2]

def build_terrain():
    g = [["." for _ in range(COLS)] for _ in range(ROWS)]
    for r in range(ROWS):
        for c in VROADS: g[r][c] = "r"
    for c in range(COLS):
        for r in HROADS: g[r][c] = "r"
    for r in range(ROWS):
        for c in WATER: g[r][c] = "w"
    for r in HROADS:                       # roads bridge over the water column
        for c in WATER: g[r][c] = "b"
    for b in BLD.values():                 # clear grass under roofs
        for i in range(b["h"]):
            for j in range(b["w"]):
                rr, cc = b["y"]+i, b["x"]+j
                if 0 <= rr < ROWS and 0 <= cc < COLS: g[rr][cc] = "."
    for r in HROADS:                       # sidewalks flanking horizontal roads
        for c in range(COLS):
            for rr in (r-1, r+1):
                if 0 <= rr < ROWS and g[rr][c] == ".": g[rr][c] = "s"
    return ["".join(row) for row in g]

terrain = build_terrain()

buildings = {}
for bid, b in BLD.items():
    buildings[bid] = {
        "x": b["x"], "y": b["y"], "w": b["w"], "h": b["h"],
        "mask": ["1"*b["w"] for _ in range(b["h"])],
        "door": door_of(b), "side": b["side"], "short": b["short"],
        "floors": b["floors"], "facade": b["facade"],
        "wall": b["wall"], "roof": b["roof"], "accent": b["accent"], "glass": b["glass"],
    }

# labels object matches scenes.js Overworld: greens/lots [x,y,name], streets [x,y,angle,name], signs [x,y,text]
labels = {
    "greens": [[WATER[1]-1, 40, "Lake Quinsigamond"]],
    "lots": [],
    "streets": [
        [PLANTATION, 6, -90, "Plantation St"],
        [LAKE_AVE, 6, -90, "Lake Ave"],
        [7, ROUTE9 - 1, 0, "Route 9"],
        [2, NORTH_ROAD - 1, 0, "North Rd"],
        [2, SOUTH_ROAD - 1, 0, "South Rd"],
    ],
    "signs": [],
}

data = {
    "COLS": COLS, "ROWS": ROWS,
    "buildings": buildings, "terrain": terrain,
    "skybridges": SKY, "spawn": SPAWN, "helipad": HELIPAD, "labels": labels,
    "roads": {"north": NORTH_ROAD, "south": SOUTH_ROAD, "route9": ROUTE9,
              "plantation": PLANTATION, "lakeAve": LAKE_AVE, "water": WATER},
}

js = ("/* GENERATED by game/tools/gen_campus.py — do not hand-edit.\n"
      "   UMass Chan campus laid out by relationship + road/water grid (Ryan's spec).\n"
      "   Buildings carry facade spec (floors/facade/wall/roof/accent/glass) for the 3/4 renderer. */\n"
      "(function (root) {\n  \"use strict\";\n  var DATA = " + json.dumps(data, separators=(",", ":")) + ";\n"
      "  if (typeof module !== \"undefined\" && module.exports) module.exports = DATA;\n"
      "  else root.IRWorldData = DATA;\n})(typeof window !== \"undefined\" ? window : globalThis);\n")

dest = "/sessions/vigilant-determined-fermat/mnt/Interventional Radiology/game/js/world_data.js"
with open(dest, "w") as f:
    f.write(js)

print("wrote", dest, " %dx%d  %d bytes" % (COLS, ROWS, len(js)))
print("roads: north y=%d south y=%d route9 y=%d | plantation x=%d lakeAve x=%d water x=%s" % (NORTH_ROAD, SOUTH_ROAD, ROUTE9, PLANTATION, LAKE_AVE, WATER))
for bid, b in BLD.items():
    print("  %-10s x[%d..%d] y[%d..%d] %2dF door=%s" % (bid, b["x"], b["x"]+b["w"]-1, b["y"], b["y"]+b["h"]-1, b["floors"], door_of(b)))

# ---- invariants ----
occ, wallcells = set(), set()
for b in BLD.values():
    for i in range(b["h"]):
        for j in range(b["w"]):
            occ.add((b["x"]+j, b["y"]+i))
    se = b["y"]+b["h"]-1
    for d in range(1, WALL+1):                 # 2-tile south wall face
        for j in range(b["w"]):
            wallcells.add((b["x"]+j, se+d))
solidset = occ | wallcells
for r in HROADS:
    for c in range(COLS): assert (c, r) not in solidset, "H road y=%d overlaps a building/wall at x=%d" % (r, c)
for c in VROADS + WATER:
    for r in range(ROWS): assert (c, r) not in solidset, "V road/water x=%d overlaps a building/wall at y=%d" % (c, r)
assert BLD["ummmc"]["y"] == BLD["msb"]["y"]+BLD["msb"]["h"], "Memorial abuts MedSchool south edge"
assert BLD["msb"]["x"] <= BLD["ummmc"]["x"] and BLD["ummmc"]["x"]+BLD["ummmc"]["w"] <= BLD["msb"]["x"]+BLD["msb"]["w"], "Memorial within MedSchool span"
assert BLD["sherman"]["y"] == BLD["msb"]["y"], "Sherman & MedSchool north-aligned"
assert BLD["acc"]["y"] == SOUTH_ROAD+2, "ACC 1 tile S of south road"
assert BLD["msb"]["y"] - NORTH_ROAD == 3, "2-tile gap N of the buildings"
for bid, b in BLD.items():                     # doors land on non-solid tiles
    dc, dr = door_of(b); assert (dc, dr) not in solidset, "%s door in a solid" % bid
assert BLD["powerplant"]["x"] >= BLD["ummmc"]["x"]+BLD["ummmc"]["w"] and BLD["powerplant"]["x"]+BLD["powerplant"]["w"] < LAKE_AVE, "power plant in the east gap"
assert HELIPAD["x"] > BLD["ummmc"]["x"]+BLD["ummmc"]["w"] and HELIPAD["x"]+5 < LAKE_AVE, "helipad in the east gap"
for sb in SKY:                                 # skybridge tiles must be walkable underneath
    for i in range(sb["h"]):
        for j in range(sb["w"]):
            assert (sb["x"]+j, sb["y"]+i) not in solidset, "skybridge tile over a solid"
print("layout invariants OK (roads+walls clear of buildings; doors + skybridge gaps walkable)")
