// A map spec's rooms broken out of their boxes and dressed for what they are, as Valve's are (research/
// level-dressing.md, ranked item 4). Two things, each asked for by the spec:
//
//   breaksOf(room, frame, { kept, textureOf, chamfer })  `frame.breaks`: pieces that break a box room's
//       silhouette, as func_detail brushes off the axes: round pillars standing in its corners (where a corner is
//       not cut and no way is near), a sloped cove where each long wall meets the ceiling, and a pipe run along
//       the top of the longest wall with brackets to it. Valve's campaign has 42 in 100 of its corners off the
//       axes; a spec's box room none.
//   dressRooms({ rooms, ways, landmarks, seed })  a room's `use` (lab, storage, control, office, industrial,
//       corridor, plant): brush prefabs placed by its rules (at its walls and in its corners, clear of every way
//       through and of the landmark, facing into the room), varied (several of each kind, turned, no one more than
//       twice in a room), returned as `prefabs` and `furniture` for the build to place as it places a spec's own.
//       What stands against a wall shades the floor under and behind it: the dark Valve's floors have and a
//       room's lamps alone do not make (step 2, research/level-dressing.md).
import { box, cylinder, prism } from "../maps/source.mjs";

/** What `frame.breaks` adds, unless told: pillars, coves and a pipe run. */
export const BREAKS = { pillars: true, coves: true, pipes: true, pillar: 12, cove: 24, pipe: 4 };
/** The words of `frame.breaks` (true, or these over BREAKS). */
export const BREAK_WORDS = ["pillars", "coves", "pipes", "pillar", "cove", "pipe"];

/**
 * The pieces that break a framed room's silhouette. `room`: { min, max }. `kept(piece)`: whether a box keeps clear
 * of the room's ways and their frames. `chamfer`: the room's cut corners (no pillar where a corner is cut).
 * Returns [brush] and a count of each kind.
 */
export function breaksOf(room, breaks, { kept, textureOf, chamfer = 0, beamDeep = 0 }) {
  const b = { ...BREAKS, ...(typeof breaks === "object" ? breaks : {}) };
  const [x0, y0, z0] = room.min;
  const [x1, y1, z1] = room.max;
  const out = [];
  const counts = { pillars: 0, coves: 0, pipes: 0 };
  const frame = textureOf("frame");
  // round pillars in the corners: ten sides, standing a radius off each wall, where the corner is not cut
  if (b.pillars && !(chamfer > 0)) {
    const r = b.pillar;
    for (const [cx, cy] of [[x0 + r, y0 + r], [x1 - r, y0 + r], [x0 + r, y1 - r], [x1 - r, y1 - r]]) {
      const piece = { min: [cx - r, cy - r, z0], max: [cx + r, cy + r, z1] };
      if (!kept(piece)) continue;
      out.push(cylinder("z", [cx, cy], r, z0, z1, frame, { sides: 10, snap: 1 }));
      counts.pillars++;
    }
  }
  // a cove where each long wall meets the ceiling: a slope of `cove` along it, as a ceiling's edge is eased
  if (b.coves && z1 - z0 - b.cove >= 112) {
    const c = b.cove;
    for (const wall of [
      { axis: "x", along: [x0, x1], outline: [[y0, z1], [y0 + c, z1], [y0, z1 - c]] },
      { axis: "x", along: [x0, x1], outline: [[y1, z1], [y1, z1 - c], [y1 - c, z1]] },
      { axis: "y", along: [y0, y1], outline: [[x0, z1], [x0, z1 - c], [x0 + c, z1]] },
      { axis: "y", along: [y0, y1], outline: [[x1, z1], [x1 - c, z1], [x1, z1 - c]] },
    ]) {
      const [a0, a1] = wall.along;
      if (a1 - a0 < 192) continue;
      // its box, to keep clear of the ways under it (a door's frame reaches up to the ceiling in a low room)
      const across = wall.outline.map((p) => p[0]);
      const piece = wall.axis === "x"
        ? { min: [a0, Math.min(...across), z1 - c], max: [a1, Math.max(...across), z1] }
        : { min: [Math.min(...across), a0, z1 - c], max: [Math.max(...across), a1, z1] };
      if (!kept(piece)) continue;
      out.push(prism(wall.axis, wall.outline, a0, a1, frame));
      counts.coves++;
    }
  }
  // a pipe run under the ceiling along the longest wall, below the cove and any beam, with a bracket every 128
  if (b.pipes) {
    const r = b.pipe;
    const alongX = x1 - x0 >= y1 - y0;
    const [a0, a1] = alongX ? [x0, x1] : [y0, y1];
    const z = z1 - (b.coves ? b.cove : 0) - Math.max(beamDeep, 0) - r - 6;
    const off = (alongX ? y0 : x0) + r + 4;
    const run = alongX ? { min: [a0, off - r, z - r], max: [a1, off + r, z + r] } : { min: [off - r, a0, z - r], max: [off + r, a1, z + r] };
    if (a1 - a0 >= 192 && z - r > z0 + 112 && kept(run)) {
      out.push(cylinder(alongX ? "x" : "y", [off, z], r, a0, a1, textureOf("pipe"), { sides: 8, snap: 1 }));
      for (let a = a0 + 64; a < a1 - 32; a += 128)
        out.push(alongX ? box([a - 2, y0, z - r - 2], [a + 2, off + r + 2, z - r], frame) : box([x0, a - 2, z - r - 2], [off + r + 2, a + 2, z - r], frame));
      counts.pipes++;
    }
  }
  return { brushes: out, counts };
}

// ── dressing by a room's use ──────────────────────────────────────────────────────────────────────────────

/**
 * The pieces a room is dressed with: brush prefabs, each built facing +x (its back at x 0, against a wall, its
 * front out into the room), its foot on the floor. Several of each kind, so that no two rooms read the same.
 */
const KIT_PIECES = {
  crate_small: { pieces: [{ box: [[0, -12, 0], [24, 12, 24]], texture: "crate" }] },
  crate_large: { pieces: [{ box: [[0, -16, 0], [32, 16, 32]], texture: "crate" }] },
  crate_stack: { pieces: [{ box: [[0, -32, 0], [32, 0, 32]], texture: "crate" }, { box: [[0, 0, 0], [28, 28, 28]], texture: "crate" }, { box: [[2, -28, 32], [26, -4, 56]], texture: "crate" }] },
  barrel: { pieces: [{ cylinder: { centre: [12, 0], radius: 12, from: 0, to: 40, sides: 8 }, texture: "barrel" }] },
  barrels: { pieces: [{ cylinder: { centre: [12, -13], radius: 12, from: 0, to: 40, sides: 8 }, texture: "barrel" }, { cylinder: { centre: [12, 13], radius: 12, from: 0, to: 40, sides: 8 }, texture: "barrel" }, { cylinder: { centre: [30, 0], radius: 11, from: 0, to: 36, sides: 8 }, texture: "barrel" }] },
  locker: { pieces: [{ box: [[0, -12, 0], [20, 12, 72]], texture: "locker" }] },
  lockers: { pieces: [{ box: [[0, -36, 0], [20, -12, 72]], texture: "locker" }, { box: [[0, -12, 0], [20, 12, 72]], texture: "locker" }, { box: [[0, 12, 0], [20, 36, 72]], texture: "locker" }] },
  shelf: { pieces: [{ box: [[0, -32, 0], [16, -30, 80]], texture: "strut" }, { box: [[0, 30, 0], [16, 32, 80]], texture: "strut" }, ...[4, 28, 52, 76].map((z) => ({ box: [[0, -30, z], [16, 30, z + 2]], texture: "strut" })), { box: [[1, -26, 6], [13, -6, 22]], texture: "crate" }, { box: [[1, 6, 54], [13, 22, 70]], texture: "crate" }] },
  console: { pieces: [{ box: [[0, -24, 0], [24, 24, 32]], texture: "console" }, { prism: { outline: [[0, -24], [24, -24], [24, 24], [0, 24]], from: 32, to: 36 }, texture: "console" }, { box: [[0, -24, 36], [8, 24, 52]], texture: "screen" }] },
  console_wide: { pieces: [{ box: [[0, -40, 0], [24, 40, 32]], texture: "console" }, { box: [[0, -40, 32], [8, 40, 56]], texture: "screen" }] },
  desk: { pieces: [{ box: [[0, -28, 28], [28, 28, 32]], texture: "desk" }, { box: [[2, -26, 0], [6, -22, 28]], texture: "strut" }, { box: [[2, 22, 0], [6, 26, 28]], texture: "strut" }, { box: [[22, -26, 0], [26, -22, 28]], texture: "strut" }, { box: [[22, 22, 0], [26, 26, 28]], texture: "strut" }] },
  cabinet: { pieces: [{ box: [[0, -16, 0], [20, 16, 52]], texture: "locker" }] },
  machine: { pieces: [{ box: [[0, -32, 0], [40, 32, 48]], texture: "machine" }, { cylinder: { centre: [20, 0], radius: 14, from: 48, to: 72, sides: 8 }, texture: "machine" }] },
  tank: { pieces: [{ cylinder: { centre: [24, 0], radius: 24, from: 0, to: 88, sides: 10 }, texture: "machine" }, { box: [[22, -2, 88], [26, 2, 100]], texture: "strut" }] },
  pipes_up: { pieces: [{ cylinder: { centre: [6, -14], radius: 5, from: 0, to: 200, sides: 6 }, texture: "pipe" }, { cylinder: { centre: [6, 2], radius: 5, from: 0, to: 200, sides: 6 }, texture: "pipe" }, { cylinder: { centre: [8, 18], radius: 7, from: 0, to: 200, sides: 6 }, texture: "pipe" }] },
  bench: { pieces: [{ box: [[0, -40, 32], [32, 40, 36]], texture: "desk" }, { box: [[0, -40, 0], [32, -36, 32]], texture: "strut" }, { box: [[0, 36, 0], [32, 40, 32]], texture: "strut" }] },
};
/** The materials the pieces wear, as the spec's own words when it gives them, else these bases. */
export const DRESS_MATERIALS = { crate: "wood", barrel: "metal", locker: "steel", console: "metal", screen: "neon", desk: "darkwood", machine: "iron", pipe: "metal", strut: "metal" };

/**
 * A room's use: the pieces it wants, each [kind, its variants, where (wall or corner), how many a 256 x 256 of
 * floor (the first kind at least one)]. Rules read off what such rooms in Valve's maps hold (research/level-dressing.md, 2.1:
 * crates at wall feet in twos to fours, consoles under windows and lamps, lockers in rows, pipes up the walls of a
 * plant), kept sparse (tip 18: prefabs sparingly, no row of identical ones).
 */
const USES = {
  storage: [["crate", ["crate_small", "crate_large", "crate_stack"], "corner", 1.2], ["shelf", ["shelf"], "wall", 0.5], ["barrel", ["barrel", "barrels"], "corner", 0.4]],
  lab: [["console", ["console", "console_wide"], "wall", 0.5], ["bench", ["bench", "desk"], "wall", 0.5], ["cabinet", ["cabinet", "locker"], "corner", 0.4]],
  control: [["console", ["console_wide", "console"], "wall", 0.9], ["cabinet", ["cabinet"], "corner", 0.3]],
  office: [["desk", ["desk"], "wall", 0.7], ["cabinet", ["cabinet", "shelf"], "corner", 0.5]],
  industrial: [["machine", ["machine", "tank"], "wall", 0.4], ["barrel", ["barrels", "barrel"], "corner", 0.6], ["pipes", ["pipes_up"], "wall", 0.3], ["crate", ["crate_stack", "crate_large"], "corner", 0.4]],
  plant: [["pipes", ["pipes_up"], "wall", 0.5], ["tank", ["tank"], "corner", 0.4], ["machine", ["machine"], "wall", 0.3], ["barrel", ["barrels"], "corner", 0.3]],
  corridor: [["pipes", ["pipes_up"], "wall", 0.25], ["crate", ["crate_small"], "wall", 0.15]],
};
export const USE_WORDS = Object.keys(USES);

/** The footprint of a piece in its own space: [min, max] in x and y over its pieces. */
function printOf(prefab) {
  const pts = prefab.pieces.flatMap((p) => p.box ?? p.prism?.outline ?? (p.cylinder ? [[p.cylinder.centre[0] - p.cylinder.radius, p.cylinder.centre[1] - p.cylinder.radius], [p.cylinder.centre[0] + p.cylinder.radius, p.cylinder.centre[1] + p.cylinder.radius]] : []));
  return { min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] };
}

/** A footprint turned by quarter turns `q` (as the build turns a prefab: (x, y) to (-y, x) each). */
function turned({ min, max }, q) {
  let corners = [[min[0], min[1]], [max[0], max[1]]];
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) corners = corners.map(([x, y]) => [-y, x]);
  return { min: [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1])], max: [Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1])] };
}

const overlaps = (a, b, gap = 0) => a.min[0] < b.max[0] + gap && b.min[0] < a.max[0] + gap && a.min[1] < b.max[1] + gap && b.min[1] < a.max[1] + gap;

/** The words of a room's `use`: the kit's own, and a mod's (its profile's `spec.uses`). */
export const useWordsOf = (uses = {}) => [...new Set([...USE_WORDS, ...Object.keys(uses)])];

/**
 * A thing of a mod's (`{ model, r, wall, lift, deep, turn, on }`, as interiors.mjs's ROOM_THINGS: `r` the room it
 * takes on the plan (along the wall), `wall` how far its middle stands off a wall, `lift` how far its origin is
 * over its foot; `deep` how far it reaches from its middle into the room, when that is not `r` (a couch: long
 * along the wall, shallow across); `turn` the degrees that turn the model to face +x with its back to -x (a
 * model made facing -y turns 90); `on` a piece of the kit's it stands on (`bench`: a computer on a desk), put with
 * it, the model on its top) as a piece facing +x with its back at x 0: its footprint, and where its origin is in it.
 */
function thingPiece(thing, kit = KIT_PIECES) {
  const r = thing.r ?? 16;
  const off = thing.wall ?? r;
  const under = thing.on ? kit[thing.on] : null;
  const own = { min: [0, -r], max: [off + (thing.deep ?? r), r] };
  const print = under ? unionOf(own, printOf(under)) : own;
  return { print, origin: [off, 0], model: thing.model, z: (under ? topOf(under) : 0) + (thing.lift ?? 0), lift: thing.lift ?? 0, turn: thing.turn ?? 0, on: under ? thing.on : null };
}
/** Two footprints as one: the least box round both. */
const unionOf = (a, b) => ({ min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])], max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])] });
/** The height of a piece's top: the highest of its parts. */
function topOf(prefab) {
  return Math.max(...prefab.pieces.map((p) => (p.box ? p.box[1][2] : p.cylinder ? p.cylinder.to : p.prism ? p.prism.to : 0)));
}

/** How dense a room's dressing is, by a word (`density` on a room, or a mod's for a use): a number multiplies each kind's `per`. */
export const DENSITIES = { sparse: 0.5, normal: 1, dense: 1.5, cluttered: 2 };
/** A room's density as a number, or null when it is no number over 0 (to 4) and no word of DENSITIES. */
export const densityOf = (given) => (given === undefined ? 1 : typeof given === "number" && given > 0 && given <= 4 ? given : (DENSITIES[given] ?? null));
/** Ways a kind of a use stands: against a wall, in a corner (and along the walls from it), in the middle (one), in
 * rows in the middle, in a group about a piece in the middle, in a cluster (a pile of crates) in the middle. */
export const DRESS_WHERE = ["wall", "corner", "middle", "rows", "group", "cluster"];
/** The floor kept free between what stands in the middle of a room and what stands at its walls: a walk. */
const WALK = 48;
/** What stands in a corner stands this near its neighbours (a pile of crates); what stands along a wall this. */
const CLUSTER_GAP = 4;
const WALL_GAP = 16;

/**
 * Dressing for every room with a `use`. `rooms`: [{ id, min, max, spec }]; `ways`: the floor kept clear in front
 * of each way through ({ min: [x, y], max: [x, y] }); `landmarks`: footprints to keep clear of; `taken`:
 * footprints already standing (a place to start). `uses` and `things`: a mod's own (its profile's `spec`): uses
 * written as USES are, `[kind, variants, where, per, options]`, whose kinds name its things, models of the game's,
 * or pieces. `where`:
 *   wall     against a wall, its back to it, spread along every wall (`gap` between, 16)
 *   corner   in the corners, and along the walls from them, close (`gap` 4): crates piled into a corner
 *   middle   one, in the room's middle, along its long way
 *   rows     a grid in the middle, side by side along the long way (`gap` 8), rows facing one way with an `aisle`
 *            (64) between: desks of an office, a cafe's tables, a store's racks
 *   group    about a piece in the middle (`between`, a thing: a coffee table), two of the variants facing each
 *            other across it, `gap` (40, a walk round it) from it: couches round a table
 *   cluster  a pile of `count` (3) side by side in the middle, along the room's long way: crates to take cover behind
 * What stands in the middle keeps a walk (48) from what stands at the walls and from the walls, and every piece
 * keeps clear of the ways and of `taken`. `pieces`: a mod's brush pieces, each over the kit's of its name or a new
 * one (`{ crate_large: { breakable: "wood" } }`). `density`: a mod's by use ({ warehouse: 1.5 }), under a room's own
 * `density` (a number, or a word of DENSITIES): each kind's `per` multiplied. Returns { prefabs: { name: prefab },
 * furniture: [{ prefab, room, at, rotate }], props: [{ model, room, at, facing, z, print }], facts }.
 */
export function dressRooms({ rooms, ways = [], landmarks = [], taken = [], seed = 1, uses = {}, things = {}, pieces = {}, density = {} }) {
  const PIECES = { ...KIT_PIECES, ...Object.fromEntries(Object.entries(pieces).map(([name, piece]) => [name, { ...KIT_PIECES[name], ...piece }])) };
  const prefabs = {};
  const furniture = [];
  const props = [];
  const facts = [];
  let s = seed >>> 0 || 1;
  const random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const shuffled = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  for (const room of rooms) {
    const use = room.spec?.use;
    if (!use) continue;
    const rules = uses[use] ?? USES[use];
    if (!rules) continue;
    const dense = densityOf(room.spec?.density ?? density[use]) ?? 1;
    const [x0, y0] = room.min;
    const [x1, y1] = room.max;
    const mid = [(x0 + x1) / 2, (y0 + y1) / 2];
    const area = (x1 - x0) * (y1 - y0);
    // the room's long way (0: x) and its short way
    const long = x1 - x0 >= y1 - y0 ? 0 : 1;
    const short = 1 - long;
    // the floor kept clear: every way's, the landmark's, what stands already (a place to start)
    const blocked = [...ways.map((w) => ({ min: w.min, max: w.max })), ...landmarks, ...taken];
    // what stands at the walls, and what stands in the middle
    const atWalls = [];
    const inMiddle = [];
    const used = new Map();
    const inset = 2;
    const QUARTERS = { west: 0, south: 1, east: 2, north: 3 };
    const WALLS = { west: [0, x0], east: [0, x1], south: [1, y0], north: [1, y1] };
    /** A piece by name: its footprint facing +x, and the model's place in it when it is a mod's thing. */
    const pieceOf = (name) => (things[name] ? thingPiece(things[name], PIECES) : { print: printOf(PIECES[name]), prefab: PIECES[name] });
    /** Puts a piece whose footprint, turned by q, stands at `at` (its point on the floor): a prop, or furniture. */
    const put = (name, piece, at, q, own, print, list) => {
      list.push(print);
      used.set(name, (used.get(name) ?? 0) + 1);
      if (piece.model) {
        // the model stands at its origin, turned as the piece is: its footprint about that
        const [ox, oy] = turnedPoint(piece.origin, q);
        props.push({ model: piece.model, room: room.id, at: [at[0] + ox - mid[0], at[1] + oy - mid[1]], facing: (((90 * q + piece.turn) % 360) + 360) % 360, z: piece.z, lift: piece.lift, print: { min: [own.min[0] - ox, own.min[1] - oy], max: [own.max[0] - ox, own.max[1] - oy] }, dressed: true });
        // what it stands on: the kit's piece, put at the same place and turned with it
        if (piece.on) {
          prefabs[`dress_${piece.on}`] = PIECES[piece.on];
          furniture.push({ prefab: `dress_${piece.on}`, room: room.id, at: [at[0] - mid[0], at[1] - mid[1]], rotate: 90 * q, dressed: true, under: true });
        }
      } else {
        prefabs[`dress_${name}`] = piece.prefab;
        furniture.push({ prefab: `dress_${name}`, room: room.id, at: [at[0] - mid[0], at[1] - mid[1]], rotate: 90 * q, dressed: true });
      }
    };
    const inRoom = (print, margin = 0) => print.min[0] >= x0 + margin && print.max[0] <= x1 - margin && print.min[1] >= y0 + margin && print.max[1] <= y1 - margin;
    // a middle piece keeps the walk from the walls and from what stands at them, and clear of the ways
    const freeInMiddle = (print, gap) => inRoom(print, WALK) && !blocked.some((b) => overlaps(print, b, 16)) && !atWalls.some((p) => overlaps(print, p, WALK)) && !inMiddle.some((p) => overlaps(print, p, gap));
    /** The variants not yet used as often as a room takes them: a mod's model four times, the kit's twice (more when many are wanted). */
    const freeOf = (variants, want) => variants.filter((v) => (things[v] || PIECES[v]) && (used.get(v) ?? 0) < Math.max(things[v] ? MOST_THINGS : 2, Math.ceil(want / variants.length) + 1));
    // the wall and corner kinds first, then what stands in the middle, clear of them
    const atWall = (where) => where === "wall" || where === "corner";
    const order = [...rules.entries()].sort(([i, a], [j, b]) => (atWall(a[2]) ? 0 : 1) - (atWall(b[2]) ? 0 : 1) || i - j);
    for (const [k, [, variants, where, per, options = {}]] of order) {
      // the use's first kind at least once; the rest by the floor (a pit of 320 x 256 took one of each, four
      // pieces, and its map went over Valve's planes a floor), as dense as the room is
      const want = Math.max(k === 0 ? 1 : 0, Math.round((area / (256 * 256)) * per * dense));
      if (want <= 0) continue;
      let got = 0;
      if (where === "middle") {
        // a mod's thing in the middle of the room: one, along its long way
        const thing = things[variants[0]];
        if (!thing) continue;
        const piece = thingPiece(thing, PIECES);
        const own = turned({ min: [piece.print.min[0] - piece.origin[0], piece.print.min[1]], max: [piece.print.max[0] - piece.origin[0], piece.print.max[1]] }, long === 0 ? 0 : 1);
        const print = { min: [mid[0] + own.min[0], mid[1] + own.min[1]], max: [mid[0] + own.max[0], mid[1] + own.max[1]] };
        if (!blocked.some((b) => overlaps(print, b, 8)) && !atWalls.some((p) => overlaps(print, p, 6)) && !inMiddle.some((p) => overlaps(print, p, 6))) {
          inMiddle.push(print);
          used.set(variants[0], (used.get(variants[0]) ?? 0) + 1);
          props.push({ model: thing.model, room: room.id, at: [0, 0], facing: (long === 0 ? 0 : 90) + (thing.turn ?? 0), z: thing.lift ?? 0, lift: thing.lift ?? 0, print: own, dressed: true });
        }
        continue;
      }
      if (where === "rows") {
        // facing the short way: the piece's +x along +short
        const q = short === 0 ? 0 : 1;
        const gap = options.gap ?? 8;
        const aisle = options.aisle ?? 64;
        const names = variants.filter((v) => things[v] || PIECES[v]);
        if (!names.length) continue;
        const sample = turned(pieceOf(names[0]).print, q);
        const wide = sample.max[long] - sample.min[long];
        const deep = sample.max[short] - sample.min[short];
        const lo = [x0, y0];
        const hi = [x1, y1];
        for (let across = lo[short] + WALK; across + deep <= hi[short] - WALK && got < want; across += deep + aisle)
          for (let along = lo[long] + WALK; along + wide <= hi[long] - WALK && got < want; along += wide + gap) {
            const name = names[got % names.length];
            const piece = pieceOf(name);
            const own = turned(piece.print, q);
            const at = [0, 0];
            at[long] = along - own.min[long];
            at[short] = across - own.min[short];
            const print = { min: [at[0] + own.min[0], at[1] + own.min[1]], max: [at[0] + own.max[0], at[1] + own.max[1]] };
            if (!freeInMiddle(print, gap - 1)) continue;
            put(name, piece, at, q, own, print, inMiddle);
            got++;
          }
        continue;
      }
      if (where === "group") {
        // two of the variants facing each other across a piece in the middle, the room's short way
        const between = things[options.between];
        const seats = variants.filter((v) => things[v]);
        if (!between || !seats.length) continue;
        const middle = thingPiece(between, PIECES);
        const qMiddle = long === 0 ? 0 : 1;
        const ownMiddle = turned({ min: [middle.print.min[0] - middle.origin[0], middle.print.min[1]], max: [middle.print.max[0] - middle.origin[0], middle.print.max[1]] }, qMiddle);
        const gap = options.gap ?? 40;
        // the room's middle, then along its long way either side, a group's length and a walk apart
        for (const step of [0, 1, -1, 2, -2]) {
          if (got >= want) break;
          const seat = seats[Math.floor(random() * seats.length)];
          const piece = thingPiece(things[seat], PIECES);
          const centre = [...mid];
          const length = Math.max(ownMiddle.max[long] - ownMiddle.min[long], 2 * (things[seat].r ?? 16));
          centre[long] += step * (length + WALK + 16);
          const table = { min: [centre[0] + ownMiddle.min[0], centre[1] + ownMiddle.min[1]], max: [centre[0] + ownMiddle.max[0], centre[1] + ownMiddle.max[1]] };
          // each seat's front `gap` from the table's side, facing it: the piece's +x onto +short on the low side
          const sides = [-1, 1].map((sign) => {
            const q = short === 0 ? (sign < 0 ? 0 : 2) : sign < 0 ? 1 : 3;
            const own = turned(piece.print, q);
            const at = [...centre];
            const edge = sign < 0 ? table.min[short] - gap : table.max[short] + gap;
            at[short] = sign < 0 ? edge - own.max[short] : edge - own.min[short];
            at[long] = centre[long] - (own.min[long] + own.max[long]) / 2;
            return { q, own, at, print: { min: [at[0] + own.min[0], at[1] + own.min[1]], max: [at[0] + own.max[0], at[1] + own.max[1]] } };
          });
          if (![table, ...sides.map((p) => p.print)].every((print) => freeInMiddle(print, WALK))) continue;
          inMiddle.push(table);
          used.set(options.between, (used.get(options.between) ?? 0) + 1);
          props.push({ model: between.model, room: room.id, at: [centre[0] - mid[0], centre[1] - mid[1]], facing: (qMiddle * 90 + (between.turn ?? 0)) % 360, z: between.lift ?? 0, lift: between.lift ?? 0, print: ownMiddle, dressed: true });
          for (const side of sides) put(seat, piece, side.at, side.q, side.own, side.print, inMiddle);
          got++;
        }
        continue;
      }
      if (where === "cluster") {
        // a pile of `count` side by side along the room's long way, at a free place in the middle
        const count = options.count ?? 3;
        const gap = options.gap ?? CLUSTER_GAP;
        const places = [];
        for (let x = x0 + WALK; x <= x1 - WALK; x += 32) for (let y = y0 + WALK; y <= y1 - WALK; y += 32) places.push([x, y]);
        for (const place of shuffled(places)) {
          if (got >= want) break;
          const pile = [];
          let along = place[long];
          for (let n = 0; n < count; n++) {
            const free = freeOf(variants, want * count);
            if (!free.length) break;
            const name = free[Math.floor(random() * free.length)];
            const piece = pieceOf(name);
            const q = Math.floor(random() * 4);
            const own = turned(piece.print, q);
            const at = [0, 0];
            at[long] = along - own.min[long];
            at[short] = place[short] - (own.min[short] + own.max[short]) / 2;
            const print = { min: [at[0] + own.min[0], at[1] + own.min[1]], max: [at[0] + own.max[0], at[1] + own.max[1]] };
            if (!freeInMiddle(print, WALK) || pile.some((p) => overlaps(print, p.print, gap - 1))) break;
            pile.push({ name, piece, at, q, own, print });
            along = print.max[long] + gap;
          }
          if (pile.length < Math.min(2, count)) continue;
          for (const p of pile) put(p.name, p.piece, p.at, p.q, p.own, p.print, inMiddle);
          got++;
        }
        continue;
      }
      // at the walls: every 16 along each wall, and the four corners (each from both its walls). A corner kind takes
      // the corners first and then the spots nearest them, close (crates pile into a corner and along from it); a
      // wall kind spreads round the room, its spots taken a stride of 64 apart before those between
      const spots = [];
      for (const [wall, [axis, side]] of Object.entries(WALLS)) {
        const [from, to] = axis === 0 ? [y0, y1] : [x0, x1];
        for (let a = from + 16; a <= to - 16; a += 16) spots.push({ wall, axis, side, along: a, corner: null, near: Math.min(a - from, to - a) });
        spots.push({ wall, axis, side, along: from, corner: "low", near: -1 }, { wall, axis, side, along: to, corner: "high", near: -1 });
      }
      const corners = where === "corner";
      const gap = options.gap ?? (corners ? CLUSTER_GAP : WALL_GAP);
      const offset = Math.floor(random() * 4) * 16;
      const ordered = corners ? shuffled(spots).sort((a, b) => a.near - b.near) : shuffled(spots.filter((spot) => !spot.corner)).sort((a, b) => ((a.along + offset) % 64) - ((b.along + offset) % 64));
      for (const spot of ordered) {
        if (got >= want) break;
        const free = freeOf(variants, want);
        if (!free.length) break;
        const name = free[Math.floor(random() * free.length)];
        const piece = pieceOf(name);
        const q = QUARTERS[spot.wall];
        const own = turned(piece.print, q);
        // its back against the wall at the spot; at a corner, its side against the other wall
        const across = 1 - spot.axis;
        const at = [0, 0];
        at[spot.axis] = spot.side === room.min[spot.axis] ? spot.side + inset - own.min[spot.axis] : spot.side - inset - own.max[spot.axis];
        at[across] = spot.corner === "low" ? spot.along + inset - own.min[across] : spot.corner === "high" ? spot.along - inset - own.max[across] : spot.along;
        const print = { min: [at[0] + own.min[0], at[1] + own.min[1]], max: [at[0] + own.max[0], at[1] + own.max[1]] };
        if (!inRoom(print)) continue;
        if (blocked.some((b) => overlaps(print, b, 8)) || atWalls.some((p) => overlaps(print, p, gap)) || inMiddle.some((p) => overlaps(print, p, WALK))) continue;
        // a room keeps its middle free to walk through: what reaches past a third of the room's depth from its
        // wall is left out
        const depth = spot.axis === 0 ? x1 - x0 : y1 - y0;
        if (own.max[spot.axis] - own.min[spot.axis] > depth / 3) continue;
        put(name, piece, at, q, own, print, atWalls);
        got++;
      }
    }
    facts.push(`${room.id} (${use}): ${atWalls.length + inMiddle.length} pieces (${[...used].map(([n, k]) => `${k} ${n}`).join(", ")})${dense !== 1 ? `, density ${dense}` : ""}`);
  }
  return { prefabs, furniture, props, facts };
}

/** How many of one thing of a mod's a room takes at most. */
const MOST_THINGS = 4;
/** A point turned by quarter turns `q`, as `turned` turns a footprint. */
function turnedPoint([x, y], q) {
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) [x, y] = [-y, x];
  return [x, y];
}
