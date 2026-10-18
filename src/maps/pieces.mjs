// Pieces a mapper builds again and again, made to measure: a spiral stair, a bridge, a railing, a balcony, a
// broken wall, a face of rough rock; and a map a person added to by hand, kept when the kit builds it again.
//
// Each returns a list of brushes (world brushes, or put them in an entity: `brushEntity("func_detail", ...)`
// for what only decorates, so that it does not cut the world for hlvis). Lines and points are in plan,
// [x, y]; heights are z. Every piece is checked against a player's numbers where it is walked: a step of 18 at
// the most, a tread a player's width can stand on, a head's room under the turn above.
import { prism, solid, terrain, turned, moved, cylinder, STEP_HEIGHT, planesOf, readMap } from "./source.mjs";
import { path } from "./ground.mjs";

// ── constants ───────────────────────────────────────────────────────────────
/** A standing player's height, and the room a head wants over a step (units). */
const PLAYER_HEIGHT = 72;
/** The narrowest tread a player is sure to stand on at a stair's middle (units). */
const LEAST_TREAD = 16;
/** A brush's planes, as `pieceKey` compares them: normals to this, distances to this. */
const NORMAL_GRAIN = 1e3;
const DIST_GRAIN = 1e1;

// ── small arithmetic in plan ────────────────────────────────────────────────
const round = (value, grid = 1) => (grid ? Math.round(value / grid) * grid + 0 : value);
const lengthOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** The unit vector from a to b, and the one to its left. */
function frameOf(a, b, who) {
  const length = lengthOf(a, b);
  if (!(length > 0)) throw new Error(`${who}: its two ends are one point`);
  const along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  return { length, along, left: [-along[1], along[0]] };
}
const at = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
/** A seeded random number of 0 to 1 for whole numbers i, j (the same each run). */
function hashed(i, j, seed) {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Smooth noise of 0 to 1 over the plane, from whole-number corners (bilinear, eased). */
function smoothNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const ease = (t) => t * t * (3 - 2 * t);
  const fx = ease(x - xi);
  const fy = ease(y - yi);
  const a = hashed(xi, yi, seed);
  const b = hashed(xi + 1, yi, seed);
  const c = hashed(xi, yi + 1, seed);
  const d = hashed(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ── a spiral stair ──────────────────────────────────────────────────────────
/**
 * A spiral stair round `centre`: steps from `from` up to `to`, each a slab between `inner` and `outer`
 * radius, starting at `start` degrees (0 east, 90 north) and turning anticlockwise as it climbs (`turn: -1`:
 * clockwise). `rise` (16) is the most a step climbs; `tread` (32) is a step's depth at the middle of its
 * width. A column fills the middle when `inner` is over 0 (`column: false`: none). `thick` (24): each step's
 * slab. A stair whose turn above comes nearer than a player's height over a step is refused, as is a tread
 * under 16 at its middle or a step over 18.
 * It returns `{ brushes, top: [x, y, z] }`: where the last step's middle is, to go on from.
 */
export function spiralStairs({
  centre,
  inner = 32,
  outer,
  from,
  to,
  start = 0,
  turn = 1,
  rise = 16,
  tread = 32,
  thick = 24,
  column = true,
  texture,
  columnTexture = texture,
}) {
  const who = "spiralStairs";
  if (!(outer > inner && inner >= 0))
    throw new Error(`${who}: outer (${outer}) beyond inner (${inner}), neither under 0`);
  if (!(to > from)) throw new Error(`${who}: it climbs: to (${to}) over from (${from})`);
  const steps = Math.ceil((to - from) / rise);
  const climb = (to - from) / steps;
  if (climb > STEP_HEIGHT)
    throw new Error(`${who}: a step of ${climb} is more than a player walks up (${STEP_HEIGHT})`);
  if (!(tread >= LEAST_TREAD))
    throw new Error(
      `${who}: a tread of ${tread} at its middle is too narrow to stand on (${LEAST_TREAD} at least)`,
    );
  const middle = (inner + outer) / 2;
  const sweep = tread / middle;
  if (sweep >= Math.PI)
    throw new Error(
      `${who}: a tread of ${tread} turns more than half round at radius ${middle}: make it wider or the tread shorter`,
    );
  // a full turn climbs this much: the step above a player's head is that far over the step under them
  const perTurn = ((2 * Math.PI) / sweep) * climb;
  if (steps * sweep > 2 * Math.PI && perTurn - thick < PLAYER_HEIGHT)
    throw new Error(
      `${who}: one turn climbs ${Math.round(perTurn)}, which leaves ${Math.round(perTurn - thick)} under the step above, less than a player's ${PLAYER_HEIGHT}: a longer tread, or a wider stair`,
    );
  const point = (radius, angle) => [
    round(centre[0] + radius * Math.cos(angle), 0.001),
    round(centre[1] + radius * Math.sin(angle), 0.001),
  ];
  const first = (start * Math.PI) / 180;
  const brushes = [];
  for (let k = 0; k < steps; k++) {
    const a0 = first + turn * k * sweep;
    const a1 = a0 + turn * sweep;
    const ring =
      inner > 0
        ? [point(inner, a0), point(outer, a0), point(outer, a1), point(inner, a1)]
        : [[...centre], point(outer, a0), point(outer, a1)];
    const top = from + climb * (k + 1);
    brushes.push(prism("z", ring, Math.max(from, top - thick), top, texture));
  }
  if (column && inner > 0)
    brushes.push(cylinder("z", centre, inner, from, to + PLAYER_HEIGHT + 16, columnTexture, { sides: 12 }));
  const end = first + turn * (steps - 0.5) * sweep;
  return { brushes, top: [...point(middle, end), to] };
}

// ── a bridge, a railing, a balcony ──────────────────────────────────────────
/**
 * A railing along a line of points at floor height `z`: a bar `thick` wide and `height` high on each
 * stretch, a post at each corner. It returns a list of brushes.
 */
export function railing(points, { z, height = 40, thick = 8, texture }) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("railing: two points at least");
  const brushes = [];
  for (let i = 0; i + 1 < points.length; i++)
    for (const outline of path([points[i], points[i + 1]], thick, { snap: 0 }))
      brushes.push(prism("z", outline, z, z + height, texture));
  for (const corner of points.slice(1, -1)) {
    const half = thick * 0.75;
    brushes.push(prism("z", [[corner[0] - half, corner[1] - half], [corner[0] + half, corner[1] - half], [corner[0] + half, corner[1] + half], [corner[0] - half, corner[1] + half]], z, z + height + 4, texture)); // prettier-ignore
  }
  return brushes;
}

/**
 * A bridge from `from` to `to` (points in plan) at any angle: a deck `width` wide whose top is at `z`,
 * `thick` thick, with a railing `rails` high on both sides (0: none) and `piers` piers under it down to
 * `ground`. It returns a list of brushes.
 */
export function bridge({
  from,
  to,
  z,
  width = 128,
  thick = 16,
  rails = 40,
  rail = 8,
  piers = 0,
  ground,
  pier = 32,
  texture,
  railTexture = texture,
  pierTexture = texture,
}) {
  const { length, along, left } = frameOf(from, to, "bridge");
  const brushes = path([from, to], width, { snap: 0 }).map((outline) =>
    prism("z", outline, z - thick, z, texture),
  );
  if (rails > 0)
    for (const side of [1, -1]) {
      const edge = (width / 2 - rail / 2) * side;
      brushes.push(
        ...railing([at(from, left, edge), at(to, left, edge)], {
          z,
          height: rails,
          thick: rail,
          texture: railTexture,
        }),
      );
    }
  if (piers > 0) {
    if (!Number.isFinite(ground) || !(ground < z - thick))
      throw new Error("bridge: piers stand on the ground: give `ground` under the deck");
    for (let k = 1; k <= piers; k++) {
      const middle = at(from, along, (length * k) / (piers + 1));
      for (const outline of path(
        [at(middle, along, -pier / 2), at(middle, along, pier / 2)],
        width - 2 * rail,
        { snap: 0 },
      ))
        brushes.push(prism("z", outline, ground, z - thick, pierTexture));
    }
  }
  return brushes;
}

/**
 * A balcony on a wall: `wall` is the line [a, b] of the wall's face, and the balcony stands out `depth`
 * from it to the LEFT of a → b (walking from a to b, the open air is on the left). Its floor's top is at `z`,
 * `thick` thick, with a railing `rails` high round its three open sides. It returns a list of brushes.
 */
export function balcony({
  wall: [a, b],
  depth = 64,
  z,
  thick = 8,
  rails = 40,
  rail = 6,
  texture,
  railTexture = texture,
}) {
  const { left } = frameOf(a, b, "balcony");
  const outA = at(a, left, depth);
  const outB = at(b, left, depth);
  const brushes = [prism("z", [a, b, outB, outA], z - thick, z, texture)];
  if (rails > 0) {
    const inset = rail / 2;
    const { along } = frameOf(a, b, "balcony");
    const p = (point, k1, k2) => at(at(point, left, k1), along, k2);
    brushes.push(...railing([p(a, inset, inset), p(outA, -inset, inset), p(outB, -inset, -inset), p(b, inset, -inset)], { z, height: rails, thick: rail, texture: railTexture })); // prettier-ignore
  }
  return brushes;
}

// ── ruins and rock ──────────────────────────────────────────────────────────
/**
 * A broken wall from `from` to `to`, `thick` thick, standing on `bottom`: cut in `pieces` lengths whose tops
 * slope between heights from `low` to `top`, chosen by `seed`, so that its top is jagged; `gaps` (0 to 1)
 * is the share of the lengths fallen down to `bottom + rubble`. It returns a list of brushes.
 */
export function brokenWall({
  from,
  to,
  thick = 16,
  bottom,
  top,
  low,
  pieces = 6,
  gaps = 0,
  rubble = 8,
  seed = 1,
  texture,
}) {
  const { length, along, left } = frameOf(from, to, "brokenWall");
  if (!(top > bottom)) throw new Error("brokenWall: top over bottom");
  low ??= bottom + (top - bottom) * 0.35;
  const heights = Array.from({ length: pieces + 1 }, (_, i) => round(low + (top - low) * hashed(i, 0, seed)));
  const brushes = [];
  for (let i = 0; i < pieces; i++) {
    const fallen = hashed(i, 1, seed) < gaps;
    const h0 = fallen ? bottom + rubble : heights[i];
    const h1 = fallen ? bottom + rubble : heights[i + 1];
    const a = at(from, along, (length * i) / pieces);
    const b = at(from, along, (length * (i + 1)) / pieces);
    const corners = [
      at(a, left, -thick / 2),
      at(b, left, -thick / 2),
      at(b, left, thick / 2),
      at(a, left, thick / 2),
    ].map(([x, y]) => [round(x, 0.001), round(y, 0.001)]);
    const tops = [h0, h1, h1, h0];
    brushes.push(
      solid(
        [...corners.map(([x, y]) => [x, y, bottom]), ...corners.map(([x, y], k) => [x, y, tops[k]])],
        texture,
        {
          faces: [[0, 1, 2], [4, 5, 6], [0, 1, 4], [1, 2, 5], [2, 3, 6], [3, 0, 7]], // prettier-ignore
        },
      ),
    );
  }
  return brushes;
}

/**
 * A face of rough rock standing along the line `from` → `to`, from `bottom` to `top`: its back on the line,
 * its face standing out to the LEFT of the line by `depth` at most (a quarter of it at least), bumped by
 * noise of `cell` units (`seed`). Lined along a straight wall, the wall reads as a cave's or a cliff's. Its
 * ends come back to a quarter of the depth, so that faces along the sides of an outline meet at its corners.
 * It returns a list of brushes (put them in a func_detail: they only decorate).
 */
export function rockWall({ from, to, bottom, top, depth = 24, cell = 48, seed = 1, texture }) {
  const { length, along } = frameOf(from, to, "rockWall");
  if (!(top > bottom)) throw new Error("rockWall: top over bottom");
  if (!(depth >= 4)) throw new Error(`rockWall: a depth of 4 at least, not ${depth}`);
  const steps = [Math.max(1, Math.round(length / cell)), Math.max(1, Math.round((top - bottom) / cell))];
  const step = [length / steps[0], (top - bottom) / steps[1]];
  const least = depth / 4;
  const out = (u, v) => {
    const ends = Math.min(u, length - u) / Math.max(cell, 1);
    const fade = Math.min(1, ends);
    const bump =
      0.65 * smoothNoise(u / cell, v / cell, seed) +
      0.35 * smoothNoise((u * 2.3) / cell, (v * 2.3) / cell, seed + 7);
    return least + (depth - least) * bump * fade;
  };
  // the picture laid on each face, not stretched down its slant
  const worn =
    typeof texture === "string"
      ? { name: texture, align: "face" }
      : texture?.name
        ? { align: "face", ...texture }
        : texture;
  const rock = terrain({ min: [0, bottom], max: [length, top], step, base: 0, height: (u, v) => out(u, v), texture: worn, axis: "y", grid: 1 }); // prettier-ignore
  const angle = (Math.atan2(along[1], along[0]) * 180) / Math.PI;
  return moved(turned(rock, angle, [0, 0, 0]), [from[0], from[1], 0]);
}

// ── a map added to by hand ──────────────────────────────────────────────────
/** A brush as its planes, rounded: two brushes of one shape have one key, however their points were written. */
export function pieceKey(brush) {
  return planesOf(brush)
    .map((plane) =>
      plane
        ? [
            ...plane.normal.map((n) => Math.round(n * NORMAL_GRAIN) + 0),
            Math.round(plane.dist * DIST_GRAIN) + 0,
          ].join(",")
        : "-",
    )
    .sort()
    .join(";");
}
/** An entity's key for `additions`: its classname, its origin and its brushes. */
const entityKey = ({ brushes = [], ...keys }) =>
  [keys.classname, String(keys.origin ?? "").split(/\s+/).filter(Boolean).map((n) => Math.round(Number(n))).join(","), ...brushes.map(pieceKey).sort()].join("|"); // prettier-ignore

/**
 * What a person added to a map the kit made: the brushes and entities of `edited` (the map as they saved
 * it, from J.A.C.K. or any editor) that are not in `made` (the map as the kit wrote it). A brush is the same
 * when its planes are, however the editor wrote its points and numbers. What they took away of the kit's is
 * not told: the kit makes it again. It returns `{ brushes, entities }`.
 */
export function additions(edited, made) {
  const madeBrushes = new Set((made.brushes ?? []).map(pieceKey));
  const madeEntities = new Set((made.entities ?? []).map(entityKey));
  return {
    brushes: (edited.brushes ?? []).filter((brush) => !madeBrushes.has(pieceKey(brush))),
    entities: (edited.entities ?? []).filter((entity) => !madeEntities.has(entityKey(entity))),
  };
}

/**
 * Maps as one: the first one's worldspawn (with every map's `wad` list joined), and every map's brushes and
 * entities. For a map built by the kit with what a person made by hand added: `mergeMaps(made, hand)`.
 */
export function mergeMaps(...maps) {
  const list = maps.map((map) => (typeof map === "string" ? readMap(map) : map));
  const wads = [];
  for (const map of list) {
    const wad = map.worldspawn?.wad;
    for (const file of Array.isArray(wad) ? wad : String(wad ?? "").split(";"))
      if (file && !wads.includes(file)) wads.push(file);
  }
  return {
    worldspawn: { ...(list[0]?.worldspawn ?? {}), ...(wads.length ? { wad: wads } : {}) },
    brushes: list.flatMap((map) => map.brushes ?? []),
    entities: list.flatMap((map) => map.entities ?? []),
  };
}
