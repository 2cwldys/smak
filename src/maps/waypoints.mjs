// Waypoints for a bot, from the walk test: where a bot may stand and which way it may go from each, laid over
// the floor a player walks, for RCBot's .rcw file (rcbot.mjs). A bot plays a map by its waypoints alone: it
// walks a straight line from one to the next along the paths, and where none is near it does not move.
//
// HOW. The map is walked as `reachOf` walks it (reach.mjs: a standing player, steps of 18, any drop, ladders,
// jumps up 45 and across gaps), on a grid of 8; floor that nothing is seen to make (the top of the sky, a clip
// over it) is left out. On that walked floor:
//   1. the places a waypoint has to be come first: each place to start; the foot and the top of each ladder
//      climbed (LADDER), as RCBot's own guide has them (rcbot/waypoints/waypointingladders.htm); for each
//      piece of floor only a jump reaches, where the jump is made from (JUMP) and where it lands; the two ends
//      of each flight of stairs or ramp; the middle of each opening (a doorway, a gate, a gap between crates)
//   2. then the rest of the floor, from the roomiest places down (the middle of a room before its walls), a
//      waypoint wherever no waypoint is within `spacing` units of walk (160): no point of the walked floor
//      is farther than that from one, and two are never nearer, but for those of step 1
//   3. each piece of floor is given to its nearest waypoint (by walk); two waypoints whose pieces touch are
//      joined both ways when a body walks the straight line between them on the level (a step at most up or
//      down at each place of the grid), one way when the line drops (250 at the most); when it is not walked
//      both ways (a corner between them), a waypoint is put at the place of the walk between them that
//      stands farthest off the line; where the walk got into a piece only by a drop no path takes, one at
//      the top of that drop and one where it lands; and the pieces are given out again, eight times at most
//   4. then any two within 1.5 x `spacing` whose straight line is walked or dropped down are joined, the
//      nearest first, up to `paths` paths (16) out of one waypoint
//   5. floor where only a crouching player fits and that is much the shorter way (or the only one) between
//      two places a standing one walks (a vent, a low passage; not the nook under a table or a stair) gets
//      waypoints of its own, CROUCH, 18 over the floor, joined along the crouching body's walk
//   6. where the paths still do not join what the walk does: a jump up out of a place a path gets into and
//      has no way back from, a drop into a place no path gets to; and the pieces given out again
//   7. only the waypoints a path from a place to start gets to, and that have a path back to one, are kept
// A waypoint's origin is a player's there: 36 over the floor standing, 18 crouching.
//
// WHAT IT IS WORTH. It is the walk test's geometry with the engine's numbers, not the game: a line a body fits
// along is no proof that the bot's steering keeps to it, a jump found is the arc of reach.mjs, and doors are
// taken as open. Teleports and lifts are not waypointed. Look at the plan it draws, and play the map with bots.
//
//   waypointsOf(map, options)   { waypoints: [{ origin, flags, paths, ways, kind }], facts, warnings, ... }
import { reachOf, JUMP_HEIGHT } from "./reach.mjs";
import { BODIES } from "./space.mjs";
import { RCW_FLAGS, RCBOT_MOST_WAYPOINTS } from "./rcbot.mjs";

// ── constants ───────────────────────────────────────────────────────────────
/** How far apart waypoints are on open floor, by walk (units), unless told. */
const SPACING = 160;
/** The grid the floor is walked on (units). */
const CELL = 8;
/** The most paths out of one waypoint, unless told (the bot keeps any number, in lists of 4). */
const MOST_PATHS = 16;
/**
 * The highest drop a path goes down (units). Half-Life hurts a fall faster than 580 units a second, a drop of
 * 210 (pm_shared.c, PLAYER_MAX_SAFE_FALL_SPEED; map-sweep); one of 250 lands at 632 and costs about 11 health
 * (the SDK's player.cpp, PLAYER_FALL_PUNCH_THRESHHOLD aside): a bot takes it as a player would.
 */
const MOST_DROP = 250;
/** A waypoint of step 1 is not put within this of one there already (units); its flags are given to that one. */
const SAME_PLACE = 40;
/** A piece of floor only a jump reaches is waypointed when it is this large at least (square units). */
const JUMP_AREA = 4096;
/** How far from a ladder's box the floor at its foot and top is looked for (units). */
const LADDER_NEAR = 48;
/** A jump is made from this far back along the walk (units), and lands this far onto its piece. */
const RUN_UP = 32;
const ONTO = 64;
/** How far under a body's floor the solid that makes it may be at its middle (a stair's tread; units). */
const UNSEEN_STEP = 24;
/** Floor a crouching body only fits is a passage when the standing floor at its ends is this far apart. */
const PASSAGE = 96;
/** Crouching waypoints are this far apart along a passage at the most (units). */
const CROUCH_SPACING = 96;
/** A flight of stairs or a ramp has its ends waypointed when it rises this much (units). */
const FLIGHT_RISE = 40;
/** How many times corners are mended (step 3) before the paths are made all the same. */
const MENDS = 8;
/** How many rounds of jumps and drops are added where the paths do not yet join what the walk does (step 6). */
const REPAIRS = 6;
/** A player's origin over his floor, standing and crouching. */
const STANDING_MIDDLE = 36;
const CROUCHING_MIDDLE = 18;
/** The four straight ways of the grid, as reach.mjs numbers them (its links are kept in this order). */
const STRAIGHT = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ── small tools ─────────────────────────────────────────────────────────────
/** A heap of numbers, each with its key: the least key comes out first. */
function heapOf() {
  const keys = [];
  const items = [];
  return {
    get size() {
      return keys.length;
    },
    push(key, item) {
      let at = keys.length;
      keys.push(key);
      items.push(item);
      while (at > 0) {
        const up = (at - 1) >> 1;
        if (keys[up] <= key) break;
        keys[at] = keys[up];
        items[at] = items[up];
        at = up;
      }
      keys[at] = key;
      items[at] = item;
    },
    pop() {
      const top = [keys[0], items[0]];
      const key = keys.pop();
      const item = items.pop();
      const count = keys.length;
      if (count) {
        let at = 0;
        for (;;) {
          let down = at * 2 + 1;
          if (down >= count) break;
          if (down + 1 < count && keys[down + 1] < keys[down]) down++;
          if (keys[down] >= key) break;
          keys[at] = keys[down];
          items[at] = items[down];
          at = down;
        }
        keys[at] = key;
        items[at] = item;
      }
      return top;
    },
  };
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const place = (point) => point.map((value) => Math.round(value)).join(" ");

/**
 * A walk's floor as a net of spots: `{ layer, links, ok(spot), passes(spot, other), grid }`, and what is
 * asked of it: the spots beside a spot on the level (`around`), a spot's point (`pointOf`), the straight line
 * between two spots walked (`march`).
 */
function netOf(grid, layer, flood, ok = (spot) => spot >= 0 && flood.far[spot] !== undefined) {
  const { links } = flood;
  const net = {
    grid,
    layer,
    links,
    ok,
    passes: flood.passes,
    /** Calls `visit(other, length)` for each spot beside `spot` on the level: four straight, four across corners. */
    around(spot, visit) {
      const straight = [-1, -1, -1, -1];
      for (let way = 0; way < 4; way++) {
        const other = links[spot * 4 + way];
        if (other >= 0 && ok(other)) {
          straight[way] = other;
          visit(other, grid.cell);
        }
      }
      for (const [wi, wj] of [
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 3],
      ]) {
        const viaI = straight[wi];
        const viaJ = straight[wj];
        if (viaI < 0 || viaJ < 0) continue;
        const other = links[viaI * 4 + wj];
        if (other >= 0 && ok(other) && links[viaJ * 4 + wi] === other) visit(other, grid.cell * Math.SQRT2);
      }
    },
    /** A spot's place and floor: `[x, y, floor]`. */
    pointOf: (spot) => [grid.x(layer.place[spot]), grid.y(layer.place[spot]), layer.floor[spot]],
    /**
     * Whether a body walks the straight line from spot `a` to spot `b`, place by place of the grid (each a
     * step to one straight beside the last, as a line crosses the grid). On the level a step is a link (no
     * more than a step up or down); with `drop`, a step may also go down as far as that. Returns null, or
     * `{ dropped }`: the deepest drop taken.
     */
    march(a, b, drop = 0) {
      const columns = grid.counts[0];
      const i0 = layer.place[a] % columns;
      const j0 = Math.floor(layer.place[a] / columns);
      const i1 = layer.place[b] % columns;
      const j1 = Math.floor(layer.place[b] / columns);
      const across = Math.abs(i1 - i0);
      const along = Math.abs(j1 - j0);
      const wayI = i1 > i0 ? 0 : 1;
      const wayJ = j1 > j0 ? 2 : 3;
      let spot = a;
      let i = 0;
      let j = 0;
      let dropped = 0;
      // how far a place of the grid stands off the line, in places: a step that takes the body more than
      // one place off it is not taken
      const length = Math.hypot(across, along) || 1;
      const off = (ni, nj) => Math.abs(ni * along - nj * across) / length;
      /** The spot a level step takes the body to along one axis (true: across), or -1. */
      const stepTo = (alongI) => {
        if (alongI ? i >= across : j >= along) return -1;
        if (off(alongI ? i + 1 : i, alongI ? j : j + 1) > 1) return -1;
        const next = links[spot * 4 + (alongI ? wayI : wayJ)];
        return next >= 0 && ok(next) ? next : -1;
      };
      while (i < across || j < along) {
        const ti = i < across ? (i + 0.5) / across : Infinity;
        const tj = j < along ? (j + 0.5) / along : Infinity;
        const first = ti <= tj;
        // the step the line asks for, or the other way round a corner of the grid it passes near
        let alongI = first;
        let next = stepTo(alongI);
        if (next < 0) {
          alongI = !first;
          next = stepTo(alongI);
        }
        if (next < 0) {
          if (!drop) return null;
          // down off an edge, the way the line asks for: the spot of the place beside nearest under this
          // floor that the body falls to
          alongI = first;
          const [di, dj] = STRAIGHT[alongI ? wayI : wayJ];
          const placeNumber = layer.place[spot] + di + dj * columns;
          const start = layer.spots(placeNumber);
          if (start >= 0)
            for (let other = start; other < start + layer.count[placeNumber]; other++) {
              const down = layer.floor[spot] - layer.floor[other];
              if (!ok(other) || down <= 0 || down > drop || !flood.passes(spot, other)) continue;
              if (next < 0 || layer.floor[other] > layer.floor[next]) next = other;
            }
          if (next < 0) return null;
          dropped = Math.max(dropped, layer.floor[spot] - layer.floor[next]);
        }
        if (alongI) i++;
        else j++;
        spot = next;
      }
      return spot === b ? { dropped } : null;
    },
  };
  return net;
}

/**
 * From the spots `seeds`, the walk over a net's level floor to every spot within `radius` (Infinity: all):
 * `{ far: Map(spot -> units), from: Map(spot -> spot), owner: Map(spot -> seed index) }`. `within(spot)`
 * keeps the walk to some spots.
 */
function spread(net, seeds, radius = Infinity, within = null) {
  const far = new Map();
  const from = new Map();
  const owner = new Map();
  const heap = heapOf();
  seeds.forEach((spot, index) => {
    if (spot < 0 || (far.has(spot) && far.get(spot) <= 0)) return;
    far.set(spot, 0);
    from.set(spot, -1);
    owner.set(spot, index);
    heap.push(0, spot);
  });
  const done = new Set();
  while (heap.size) {
    const [length, spot] = heap.pop();
    if (done.has(spot) || length > far.get(spot)) continue;
    done.add(spot);
    net.around(spot, (other, step) => {
      const next = length + step;
      if (next > radius || (within && !within(other))) return;
      if (far.has(other) && far.get(other) <= next) return;
      far.set(other, next);
      from.set(other, spot);
      owner.set(other, owner.get(spot));
      heap.push(next, other);
    });
  }
  return { far, from, owner };
}

/**
 * Each spot of a net's level floor given to its nearest seed by walk: `{ owner }`, which answers `get(spot)`
 * (the seed's index, or undefined) and is walked over as `[spot, index]` pairs. The whole floor at once, in
 * typed arrays: what `spread` does for a few hundred spots, this does for a million.
 */
function ownersOf(net, seeds) {
  const count = net.layer.floor.length;
  const far = new Float64Array(count).fill(Infinity);
  const owners = new Int32Array(count).fill(-1);
  const done = new Uint8Array(count);
  const heap = heapOf();
  seeds.forEach((spot, index) => {
    if (spot < 0 || far[spot] === 0) return;
    far[spot] = 0;
    owners[spot] = index;
    heap.push(0, spot);
  });
  while (heap.size) {
    const [length, spot] = heap.pop();
    if (done[spot] || length > far[spot]) continue;
    done[spot] = 1;
    net.around(spot, (other, step) => {
      const next = length + step;
      if (other >= count || next >= far[other]) return;
      far[other] = next;
      owners[other] = owners[spot];
      heap.push(next, other);
    });
  }
  return {
    owner: {
      get: (spot) => (spot >= 0 && spot < count && owners[spot] >= 0 ? owners[spot] : undefined),
      *[Symbol.iterator]() {
        for (let spot = 0; spot < count; spot++) if (owners[spot] >= 0) yield [spot, owners[spot]];
      },
    },
  };
}

/** How far each spot of a net is from the edge of its floor, in places of the grid (0: at the edge). */
function clearanceOf(net, spots) {
  const clear = new Map();
  let ring = [];
  for (const spot of spots) {
    let inner = 0;
    net.around(spot, () => inner++);
    if (inner < 8) {
      clear.set(spot, 0);
      ring.push(spot);
    }
  }
  for (let depth = 1; ring.length; depth++) {
    const next = [];
    for (const spot of ring)
      for (let way = 0; way < 4; way++) {
        const other = net.links[spot * 4 + way];
        if (other >= 0 && net.ok(other) && !clear.has(other)) {
          clear.set(other, depth);
          next.push(other);
        }
      }
    ring = next;
  }
  return clear;
}

/** The pieces of a set of spots that touch on the level: a Map(spot -> piece number), and the pieces' spots. */
function piecesOf(net, spots, inside) {
  const pieceOf = new Map();
  const pieces = [];
  for (const spot of spots) {
    if (pieceOf.has(spot)) continue;
    const piece = [spot];
    pieceOf.set(spot, pieces.length);
    for (let at = 0; at < piece.length; at++)
      net.around(piece[at], (other) => {
        if (!pieceOf.has(other) && inside(other)) {
          pieceOf.set(other, pieces.length);
          piece.push(other);
        }
      });
    pieces.push(piece);
  }
  return { pieceOf, pieces };
}

/**
 * Waypoints for a bot on a map's walked floor (the head of this file). `map`: brush source or a compiled
 * map, as `reachOf` takes it, with what it takes (`mod`, `doors`, `open`, `shut`, `walls`, `from`, `bodies`,
 * `exits`). And:
 *   spacing   how far apart waypoints are by walk on open floor (160 units)
 *   cell      the grid the floor is walked on (8)
 *   jump      false: no jumps (unless told, a jump up 45 and across a gap, as `reachOf` with `jump: true`)
 *   crouch    false: no crouching passages
 *   paths     the most paths out of one waypoint (16)
 *   drop      the highest drop a path goes down (250)
 *   most      the most waypoints (RCBot's 1024): over it, `spacing` is made wider until they fit, and said
 * It returns `{ waypoints: [{ origin, flags, paths, ways, kind }], facts, warnings, spacing, cell, reach }`:
 * `paths` are the numbers of the waypoints a bot goes on to, `ways` what each path is ("walk", "drop",
 * "ladder", "jump"), `kind` why the waypoint is there ("start", "ladder", "jump", "landing", "flight",
 * "opening", "floor", "corner", "ledge" and "drop" (the top of a drop and where it lands), "crouch");
 * `reach`, the walk test it was laid on.
 */
export function waypointsOf(map, options = {}) {
  const most = options.most ?? RCBOT_MOST_WAYPOINTS;
  let spacing = options.spacing ?? SPACING;
  if (!(spacing >= 16)) throw new Error(`spacing: units between waypoints, 16 at the least, not ${spacing}`);
  // the walk once: only the laying is done again at a wider spacing
  const reach = reachOf(map, {
    ...options,
    cell: options.cell ?? CELL,
    jump: options.jump === false ? false : JUMP_HEIGHT,
    parts: false,
    graph: true,
  });
  const tried = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const made = waypointsAt(reach, { ...options, spacing });
    if (made.waypoints.length <= most) {
      if (tried.length)
        made.warnings.push(
          `${tried.map((each) => `${each.waypoints} waypoints at a spacing of ${each.spacing}`).join(", ")}: over the ${most} the bot has room for, so the spacing was made ${Math.round(spacing)}`,
        );
      return made;
    }
    tried.push({ spacing: Math.round(spacing), waypoints: made.waypoints.length });
    spacing *= 1.25;
  }
  throw new Error(
    `${tried.at(-1).waypoints} waypoints at a spacing of ${tried.at(-1).spacing}: still over ${most}`,
  );
}

function waypointsAt(reach, options) {
  const { spacing, jump = true, crouch = true, paths: mostPaths = MOST_PATHS, drop = MOST_DROP } = options;
  const reachAt = options.reachAt ?? spacing * 1.5;
  const { grid, layer, flood, onFoot, step, starts, space } = reach.graph;
  const warnings = [];
  const facts = [];
  // The floor a bot uses. Not floor that nothing is seen to make: the clip hulls take a sky brush as solid,
  // and a map on an island in the sky (ts_dojo) has its sky's top walked, or a player clip laid over it; no
  // player is meant to be there. A floor is seen when the upright line at its place (or, where it finds
  // none, a few units about it: a line on the face between two brushes may pass through neither) meets the
  // top of something not sky at it or a stair's height under it (the body's box stands on the highest
  // tread under it); and the edge of a seen floor, a body's middle out over a drop, is seen with it
  const spotCount = layer.floor.length;
  const cuts = new Map();
  const madeBy = (x, y, floor, keep) => {
    let cut = keep ? cuts.get(keep) : undefined;
    if (!cut) {
      cut = space.cut(x, y);
      if (keep) cuts.set(keep, cut);
    }
    let found = 0;
    for (const [, top, kind] of cut)
      if (top <= floor + 2 && top >= floor - UNSEEN_STEP)
        found = kind === "sky" ? Math.min(found, -1) || -1 : 1;
    return found;
  };
  const seenMask = new Uint8Array(spotCount);
  for (let spot = 0; spot < spotCount; spot++) {
    if (flood.far[spot] === undefined) continue;
    const placeNumber = layer.place[spot];
    const x = grid.x(placeNumber);
    const y = grid.y(placeNumber);
    const floor = layer.floor[spot];
    const here = madeBy(x, y, floor, placeNumber + 1);
    if (here > 0) seenMask[spot] = 1;
    else if (here === 0)
      for (const [dx, dy] of [
        [3, 3],
        [-3, -3],
        [3, -3],
        [-3, 3],
      ])
        if (madeBy(x + dx, y + dy, floor) > 0) {
          seenMask[spot] = 1;
          break;
        }
  }
  const anyWalk = netOf(grid, layer, flood);
  const nearSeen = (spot) => {
    if (seenMask[spot]) return true;
    let found = false;
    anyWalk.around(spot, (other) => {
      if (found || seenMask[other]) return void (found = true);
      anyWalk.around(other, (further) => {
        if (seenMask[further]) found = true;
      });
    });
    return found;
  };
  const seen = new Uint8Array(spotCount);
  let unseen = 0;
  for (let spot = 0; spot < spotCount; spot++)
    if (flood.far[spot] !== undefined) {
      if (nearSeen(spot)) seen[spot] = 1;
      else unseen++;
    }
  if (unseen)
    facts.push(
      `${Math.round(unseen * grid.cell * grid.cell)} square units of floor walked are the top of the sky, or of a clip nothing is seen under: left out`,
    );
  // what is walked to on foot (ladders too), and each piece only a jump reaches that is large enough to be
  // waypointed (the tops of crates and walls are left out)
  const onFootSeen = (spot) => spot >= 0 && seen[spot] === 1 && onFoot.far[spot] !== undefined;
  const jumpOnly = (spot) => anyWalk.ok(spot) && seen[spot] === 1 && onFoot.far[spot] === undefined;
  const jumpSpots = [];
  if (jump) for (let spot = 0; spot < spotCount; spot++) if (jumpOnly(spot)) jumpSpots.push(spot);
  const jumped = piecesOf(anyWalk, jumpSpots, jumpOnly);
  const jumpsTaken = [];
  const takenPieces = new Set();
  for (const [number, piece] of jumped.pieces.entries()) {
    if (piece.length * grid.cell * grid.cell < JUMP_AREA) continue;
    let best = -1;
    for (const spot of piece) {
      if (!onFootSeen(flood.from[spot])) continue;
      if (best < 0 || flood.far[spot] < flood.far[best]) best = spot;
    }
    if (best < 0) continue;
    takenPieces.add(number);
    jumpsTaken.push({ from: flood.from[best], to: best, piece: number });
  }
  const usableMask = new Uint8Array(spotCount);
  for (let spot = 0; spot < spotCount; spot++)
    if (onFootSeen(spot) || takenPieces.has(jumped.pieceOf.get(spot))) usableMask[spot] = 1;
  const usable = (spot) => spot >= 0 && spot < spotCount && usableMask[spot] === 1;
  const stand = netOf(grid, layer, flood, usable);
  const walked = [];
  for (let spot = 0; spot < spotCount; spot++) if (usableMask[spot]) walked.push(spot);
  if (!walked.length) {
    warnings.push("no floor is walked (no place to start, or none with room): no waypoints");
    return { waypoints: [], facts, warnings, spacing, cell: grid.cell, reach };
  }
  const clear = clearanceOf(stand, walked);

  // ── the waypoints: each on a spot of the standing walk, or of the crouching one ──
  const points = [];
  /** A waypoint at a spot, unless one is there already (then that one takes the flags too). */
  const put = (spot, kind, flags = 0, net = stand, middle = STANDING_MIDDLE, alone = false) => {
    const [x, y, floor] = net.pointOf(spot);
    const origin = [x, y, floor + middle];
    const near =
      !alone &&
      points.find(
        (point) => point.net === net && !point.alone && distance(point.origin, origin) < SAME_PLACE,
      );
    if (near) {
      near.flags |= flags;
      return near;
    }
    const point = { origin, flags, kind, spot, net, alone, out: new Map() };
    points.push(point);
    return point;
  };
  /** A path from one waypoint to another: `why` ("walk", "drop", "ladder", "jump"), forced or not. */
  const join = (from, to, why, forced = false) => {
    if (from === to) return;
    if (!from.out.has(to)) from.out.set(to, { why, forced, length: distance(from.origin, to.origin) });
  };

  // 1. the places a waypoint has to be
  for (const start of starts) if (usable(start.spot)) put(start.spot, "start");
  const startCount = points.length;
  // ladders: the foot (the lowest floor beside it) and the top (the highest, no higher than a step over its
  // top), each the walked spot nearest the ladder
  let laddersWaypointed = 0;
  const lifts = (space.ladders ?? []).filter((ladder) => ladder.lift).length;
  for (const ladder of space.ladders ?? []) {
    if (ladder.lift) continue;
    const offOf = (spot) => {
      const [x, y] = stand.pointOf(spot);
      return Math.hypot(
        Math.max(ladder.min[0] - x, 0, x - ladder.max[0]),
        Math.max(ladder.min[1] - y, 0, y - ladder.max[1]),
      );
    };
    const about = [];
    for (
      let y = Math.floor((ladder.min[1] - LADDER_NEAR) / grid.cell) * grid.cell;
      y <= ladder.max[1] + LADDER_NEAR;
      y += grid.cell
    )
      for (
        let x = Math.floor((ladder.min[0] - LADDER_NEAR) / grid.cell) * grid.cell;
        x <= ladder.max[0] + LADDER_NEAR;
        x += grid.cell
      ) {
        const placeNumber = grid.at(x, y);
        const first = placeNumber < 0 ? -1 : layer.first[placeNumber];
        if (first < 0) continue;
        for (let spot = first; spot < first + layer.count[placeNumber]; spot++) {
          const floor = layer.floor[spot];
          if (
            usable(spot) &&
            offOf(spot) <= LADDER_NEAR &&
            floor >= ladder.min[2] - LADDER_NEAR &&
            floor <= ladder.max[2] + step
          )
            about.push(spot);
        }
      }
    if (about.length < 2) continue;
    const low = Math.min(...about.map((spot) => layer.floor[spot]));
    const high = Math.max(...about.map((spot) => layer.floor[spot]));
    if (high - low <= step * 2) continue;
    // the foot touching the ladder; the top on the ledge, half a body in from its edge if it can be
    const nearest = (floor, inward = 0) => {
      const level = about.filter((spot) => Math.abs(layer.floor[spot] - floor) <= step);
      const inside = level.filter((spot) => (clear.get(spot) ?? 0) * grid.cell >= inward);
      return (inside.length ? inside : level).sort((a, b) => offOf(a) - offOf(b))[0];
    };
    const foot = put(nearest(low), "ladder", RCW_FLAGS.LADDER);
    const top = put(nearest(high, BODIES.standing.half), "ladder", RCW_FLAGS.LADDER);
    join(foot, top, "ladder", true);
    join(top, foot, "ladder", true);
    laddersWaypointed++;
  }
  // jumps: for each piece of floor only a jump reaches, the jump to it that the walk found first
  const jumpPairs = [];
  for (const { from, to, piece } of jumpsTaken) {
    // the jump made from a few places back along the walk, onto the roomiest place a little way into the piece
    let runUp = from;
    for (let back = 0; back < RUN_UP / grid.cell; back++) {
      const before = flood.from[runUp];
      if (!usable(before) || onFoot.far[before] === undefined) break;
      runUp = before;
    }
    let onto = to;
    for (const [spot, far] of spread(stand, [to], ONTO, (spot) => jumped.pieceOf.get(spot) === piece).far)
      if (far >= ONTO / 2 && (onto === to || (clear.get(spot) ?? 0) > (clear.get(onto) ?? 0))) onto = spot;
    // the two are a jump's own: no other waypoint takes their place, and they take no other's
    const takeoff = put(runUp, "jump", RCW_FLAGS.JUMP, stand, STANDING_MIDDLE, true);
    const landing = put(onto, "landing", 0, stand, STANDING_MIDDLE, true);
    join(takeoff, landing, "jump", true);
    jumpPairs.push({ takeoff, landing, piece });
  }
  // flights of stairs and ramps: the floor that is not level with all about it, in pieces
  const sloped = (spot) => {
    if (layer.slant[spot] < 0.98) return true;
    let rises = false;
    for (let way = 0; way < 4 && !rises; way++) {
      const other = stand.links[spot * 4 + way];
      if (other >= 0 && stand.ok(other) && Math.abs(layer.floor[other] - layer.floor[spot]) >= 2)
        rises = true;
    }
    return rises;
  };
  const flights = piecesOf(stand, walked.filter(sloped), sloped);
  let flightCount = 0;
  for (const piece of flights.pieces) {
    const floors = piece.map((spot) => layer.floor[spot]);
    const low = Math.min(...floors);
    const high = Math.max(...floors);
    if (high - low < FLIGHT_RISE || piece.length > 4000) continue;
    // each end: the level floor beside the flight's lowest (highest) spot, the roomiest such
    for (const end of [low, high]) {
      const ends = piece.filter((spot) => Math.abs(layer.floor[spot] - end) < 1);
      let chosen = -1;
      for (const spot of ends)
        stand.around(spot, (other) => {
          if (sloped(other) || Math.abs(layer.floor[other] - end) > step) return;
          if (chosen < 0 || (clear.get(other) ?? 0) > (clear.get(chosen) ?? 0)) chosen = other;
        });
      if (chosen < 0) chosen = ends.sort((a, b) => (clear.get(b) ?? 0) - (clear.get(a) ?? 0))[0];
      put(chosen, "flight");
    }
    flightCount++;
  }
  // openings: the middle of each
  let openingCount = 0;
  for (const opening of reach.openings) {
    const spot = layer.spotAt(grid.at(opening.at[0], opening.at[1]), opening.at[2], step);
    if (!stand.ok(spot)) continue;
    put(spot, "opening");
    openingCount++;
  }

  // 2. the rest of the floor, the roomiest places first
  const covered = new Set();
  const cover = (point) => {
    if (point.net !== stand) return;
    for (const spot of spread(stand, [point.spot], spacing).far.keys()) covered.add(spot);
  };
  for (const point of points) cover(point);
  const byRoom = [...walked].sort((a, b) => (clear.get(b) ?? 0) - (clear.get(a) ?? 0) || a - b);
  for (const spot of byRoom) {
    if (covered.has(spot)) continue;
    cover(put(spot, "floor"));
  }

  // 3. each piece of floor given to its nearest waypoint; every two whose pieces touch joined
  // Two whose pieces touch are walked between both ways (the pieces meet on the level): joined both ways
  // when the straight line is walked, and otherwise mended with a waypoint at the corner between them. A
  // line that drops is joined one way meanwhile.
  const tryJoin = (a, b) => {
    if (a.out.has(b) && b.out.has(a)) return true;
    if (stand.march(a.spot, b.spot)) {
      join(a, b, "walk", true);
      join(b, a, "walk", true);
      return true;
    }
    if (!a.out.has(b) && stand.march(a.spot, b.spot, drop)) join(a, b, "drop", true);
    if (!b.out.has(a) && stand.march(b.spot, a.spot, drop)) join(b, a, "drop", true);
    return false;
  };
  // the drops the walk took (off a ledge, down a hole): a waypoint's piece may be got to by nothing else
  const drops = [];
  for (const spot of walked) {
    const from = flood.from[spot];
    if (!(from >= 0) || flood.leapt[spot] || flood.climbed[spot] || !usable(from)) continue;
    const down = layer.floor[from] - layer.floor[spot];
    if (down > step && down <= drop) drops.push(spot);
  }
  /** Whether the paths so far lead from one waypoint to another. */
  const leads = (a, b) => {
    const seen = new Set([a]);
    const list = [a];
    for (let at = 0; at < list.length; at++)
      for (const to of list[at].out.keys()) {
        if (to === b) return true;
        if (!seen.has(to)) seen.add(to), list.push(to);
      }
    return false;
  };
  let corners = 0;
  let dropsWaypointed = 0;
  const mendAll = () => {
    for (let mend = 0; mend <= MENDS; mend++) {
      const standing = points.filter((point) => point.net === stand);
      const given = ownersOf(
        stand,
        standing.map((point) => point.spot),
      );
      const touching = new Map();
      for (const [spot, index] of given.owner)
        stand.around(spot, (other) => {
          const otherIndex = given.owner.get(other);
          if (otherIndex === undefined || otherIndex === index) return;
          const key = index < otherIndex ? `${index} ${otherIndex}` : `${otherIndex} ${index}`;
          if (!touching.has(key)) touching.set(key, [index, otherIndex]);
        });
      const added = [];
      for (const [first, second] of touching.values()) {
        const a = standing[first];
        const b = standing[second];
        if (tryJoin(a, b) !== false) continue;
        if (mend === MENDS) continue;
        // the walk from one to the other through their two pieces, and its place farthest off their line
        let walk = spread(stand, [a.spot], Infinity, (spot) => {
          const owner = given.owner.get(spot);
          return owner === first || owner === second;
        });
        if (!walk.far.has(b.spot)) walk = spread(stand, [a.spot], spacing * 4);
        if (!walk.far.has(b.spot)) continue;
        const [ax, ay] = stand.pointOf(a.spot);
        const [bx, by] = stand.pointOf(b.spot);
        const length = Math.hypot(bx - ax, by - ay) || 1;
        // and the place half way along the walk, for when that one is a waypoint already
        let farthest = -1;
        let off = -1;
        let middle = -1;
        const half = walk.far.get(b.spot) / 2;
        for (let at = walk.from.get(b.spot); at >= 0 && at !== a.spot; at = walk.from.get(at)) {
          const [x, y] = stand.pointOf(at);
          const away = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length;
          if (away > off) (off = away), (farthest = at);
          if (middle < 0 || Math.abs(walk.far.get(at) - half) < Math.abs(walk.far.get(middle) - half))
            middle = at;
        }
        if (farthest >= 0) added.push({ farthest, middle, a, b });
      }
      // a drop from one waypoint's piece into another's that no path takes yet: down the line between them,
      // or from where the walk dropped, to where it landed
      const dropPairs = new Map();
      for (const spot of drops) {
        const above = given.owner.get(flood.from[spot]);
        const below = given.owner.get(spot);
        if (above === undefined || below === undefined || above === below) continue;
        const key = `${above} ${below}`;
        if (!dropPairs.has(key) || flood.far[spot] < flood.far[dropPairs.get(key)]) dropPairs.set(key, spot);
      }
      const ledges = [];
      for (const [key, spot] of dropPairs) {
        const [a, b] = key.split(" ").map((number) => standing[Number(number)]);
        if (a.out.has(b)) continue;
        if (stand.march(a.spot, b.spot, drop)) join(a, b, "drop", true);
        else if (mend < MENDS && !leads(a, b)) ledges.push(spot);
      }
      const before = points.length;
      for (const { farthest, middle, a, b } of added) {
        // the corner a waypoint of its own; or one there already, which helps when the line to it from each
        // of the two is walked; if not, the place half way along the walk is one of its own
        const count = points.length;
        const corner = put(farthest, "corner");
        if (points.length > count) continue;
        if (corner !== a && corner !== b && tryJoin(a, corner) === true && tryJoin(corner, b) === true)
          continue;
        const [x, y, floor] = stand.pointOf(middle);
        const at = [x, y, floor + STANDING_MIDDLE];
        if (!points.some((point) => point.net === stand && distance(point.origin, at) < SAME_PLACE / 2))
          put(middle, "corner", 0, stand, STANDING_MIDDLE, true);
      }
      corners += points.length - before;
      for (const spot of ledges) {
        const edge = put(flood.from[spot], "ledge");
        const landing = put(
          spot,
          "drop",
          0,
          stand,
          STANDING_MIDDLE,
          edge.spot === flood.from[spot] ? false : true,
        );
        if (edge === landing) continue;
        join(edge, landing, "drop", true);
        dropsWaypointed++;
      }
      if (points.length === before) break;
    }
  };
  mendAll();

  // 5. crouching passages
  let passages = 0;
  if (crouch) {
    const low = reach.graph.layerOf(BODIES.crouching);
    const crawl = reach.graph.floodOf(low, { step, up: step, links: true, slopes: true });
    const standsAt = (lowSpot) => {
      const placeNumber = low.place[lowSpot];
      const first = layer.first[placeNumber];
      if (first < 0) return -1;
      for (let spot = first; spot < first + layer.count[placeNumber]; spot++)
        if (Math.abs(layer.floor[spot] - low.floor[lowSpot]) <= 1) return spot;
      return -1;
    };
    for (const spot of walked) crawl.seed(low.spotAt(layer.place[spot], layer.floor[spot], step));
    crawl.run();
    const creep = netOf(grid, low, crawl);
    const crouchOnly = (lowSpot) => creep.ok(lowSpot) && standsAt(lowSpot) < 0;
    const lowSpots = [];
    for (let spot = 0; spot < low.floor.length; spot++) if (crouchOnly(spot)) lowSpots.push(spot);
    const { pieces } = piecesOf(creep, lowSpots, crouchOnly);
    for (const piece of pieces) {
      // where the passage meets the standing walk: its ends
      const mouths = [];
      for (const spot of piece)
        creep.around(spot, (other) => {
          if (crouchOnly(other)) return;
          const standing = standsAt(other);
          if (stand.ok(standing)) mouths.push({ inside: spot, outside: standing });
        });
      // its ends: the mouths a passage's width apart. It is a passage when crawling from one end to another
      // is much the shorter way, or the only one: not the nook under a table or a stair, open along its side
      const ends = [];
      for (const mouth of mouths)
        if (
          !ends.some((end) => distance(creep.pointOf(end.inside), creep.pointOf(mouth.inside)) < PASSAGE / 2)
        )
          ends.push(mouth);
      if (ends.length < 2) continue;
      const linked = new Set();
      for (const [number, end] of ends.entries()) {
        const crawled = spread(creep, [end.inside], Infinity, crouchOnly).far;
        const others = ends.slice(number + 1).filter((other) => crawled.has(other.inside));
        if (!others.length) continue;
        const longest = Math.max(...others.map((other) => crawled.get(other.inside)));
        const walked = spread(stand, [end.outside], longest * 2 + PASSAGE * 2).far;
        for (const other of others) {
          const crawl = crawled.get(other.inside);
          const walk = walked.get(other.outside);
          if (walk !== undefined && walk <= crawl * 2 + PASSAGE) continue;
          linked.add(end);
          linked.add(other);
        }
      }
      if (!linked.size) continue;
      passages++;
      // a crouching waypoint inside each of those ends, then along the passage
      const inPassage = [];
      for (const end of linked)
        inPassage.push(put(end.inside, "crouch", RCW_FLAGS.CROUCH, creep, CROUCHING_MIDDLE));
      const lowCovered = new Set();
      for (const point of inPassage)
        for (const spot of spread(creep, [point.spot], CROUCH_SPACING, crouchOnly).far.keys())
          lowCovered.add(spot);
      for (const spot of piece) {
        if (lowCovered.has(spot)) continue;
        const point = put(spot, "crouch", RCW_FLAGS.CROUCH, creep, CROUCHING_MIDDLE);
        inPassage.push(point);
        for (const near of spread(creep, [spot], CROUCH_SPACING, crouchOnly).far.keys()) lowCovered.add(near);
      }
      // joined along the crouching walk; and each end to the standing waypoints near its mouth
      const lowOf = (point) =>
        point.net === creep ? point.spot : low.spotAt(layer.place[point.spot], layer.floor[point.spot], 1);
      const others = points.filter(
        (point) =>
          point.net === stand &&
          [...linked].some((end) => distance(point.origin, creep.pointOf(end.inside)) < reachAt),
      );
      for (const a of inPassage)
        for (const b of [...inPassage, ...others]) {
          if (a === b || distance(a.origin, b.origin) > reachAt) continue;
          const from = lowOf(a);
          const to = lowOf(b);
          if (!creep.ok(from) || !creep.ok(to)) continue;
          if (creep.march(from, to)) {
            join(a, b, "walk", true);
            join(b, a, "walk", true);
          } else if (creep.march(from, to, drop)) join(a, b, "drop", true);
        }
    }
  }

  // 4. any two near enough whose line is walked, the nearest first
  const joinNear = () => {
    const standing = points.filter((point) => point.net === stand);
    for (const a of standing) {
      const near = standing
        .filter((b) => b !== a && !a.out.has(b) && distance(a.origin, b.origin) <= reachAt)
        .sort((p, q) => distance(a.origin, p.origin) - distance(a.origin, q.origin));
      for (const b of near) {
        if (a.out.size >= mostPaths) break;
        if (stand.march(a.spot, b.spot)) {
          join(a, b, "walk");
          if (b.out.size < mostPaths) join(b, a, "walk");
        } else if (stand.march(a.spot, b.spot, drop)) join(a, b, "drop");
      }
    }
    // a piece only a jump reaches has a way back down, where its line drops
    for (const { takeoff, landing, piece } of jumpPairs)
      if (![...landing.out.keys()].some((to) => to.net !== stand || jumped.pieceOf.get(to.spot) !== piece))
        if (stand.march(landing.spot, takeoff.spot, drop)) join(landing, takeoff, "drop", true);
  };
  joinNear();

  // 6. what the walk joins and the paths do not yet: out of a place a path gets into and finds no way back
  // from, a jump up (a ledge of 45 at most) to floor that leads back; into a place no path gets to, a drop.
  // One for each such place a round, the lowest jump or drop; then the pieces are given out again
  /** The waypoints the paths lead to from `from`, or (`backwards`) that lead to it. */
  const reachedFrom = (from, backwards = false) => {
    const into = new Map(points.map((point) => [point, []]));
    if (backwards) for (const point of points) for (const to of point.out.keys()) into.get(to).push(point);
    const seen = new Set(from);
    const list = [...from];
    for (let at = 0; at < list.length; at++)
      for (const to of backwards ? into.get(list[at]) : list[at].out.keys())
        if (!seen.has(to)) seen.add(to), list.push(to);
    return seen;
  };
  let mended = 0;
  for (let round = 0; round < REPAIRS; round++) {
    const begin = points.filter((point) => point.kind === "start");
    if (!begin.length) begin.push(points[0]);
    const forth = reachedFrom(begin);
    const back = reachedFrom(begin, true);
    const standing = points.filter((point) => point.net === stand);
    if (standing.every((point) => forth.has(point) && back.has(point))) break;
    const given = ownersOf(
      stand,
      standing.map((point) => point.spot),
    );
    const found = [];
    const columns = grid.counts[0];
    for (const [spot, index] of given.owner) {
      const here = standing[index];
      const stuck = forth.has(here) && !back.has(here);
      const good = forth.has(here) && back.has(here);
      if (!stuck && !good) continue;
      for (const [di, dj] of STRAIGHT) {
        const beside = layer.place[spot] + di + dj * columns;
        const first = layer.spots(beside);
        if (first < 0) continue;
        for (let other = first; other < first + layer.count[beside]; other++) {
          const thereIndex = given.owner.get(other);
          if (thereIndex === undefined || !usable(other)) continue;
          const there = standing[thereIndex];
          const rise = layer.floor[other] - layer.floor[spot];
          if (!flood.passes(spot, other)) continue;
          if (jump && stuck && back.has(there) && rise > step && rise <= JUMP_HEIGHT)
            found.push({ how: "jump", from: spot, to: other, place: here, height: rise });
          else if (good && !forth.has(there) && -rise > step && -rise <= drop)
            found.push({ how: "drop", from: spot, to: other, place: there, height: -rise });
        }
      }
    }
    found.sort((a, b) => a.height - b.height);
    // one for each place (the waypoints a path from the chosen one's place gets to are that place)
    const done = new Set();
    let added = 0;
    for (const way of found) {
      if (done.has(way.place)) continue;
      for (const point of reachedFrom([way.place])) done.add(point);
      if (way.how === "jump") {
        let onto = way.to;
        for (const [spot, far] of spread(stand, [way.to], ONTO).far)
          if (far >= ONTO / 2 && (onto === way.to || (clear.get(spot) ?? 0) > (clear.get(onto) ?? 0)))
            onto = spot;
        const takeoff = put(way.from, "jump", RCW_FLAGS.JUMP, stand, STANDING_MIDDLE, true);
        const landing = put(onto, "landing", 0, stand, STANDING_MIDDLE, true);
        join(takeoff, landing, "jump", true);
      } else {
        const edge = put(way.from, "ledge");
        const landing = put(way.to, "drop", 0, stand, STANDING_MIDDLE, true);
        if (edge === landing) continue;
        join(edge, landing, "drop", true);
        dropsWaypointed++;
      }
      added++;
    }
    if (!added) break;
    mended += added;
    mendAll();
    joinNear();
  }

  // the paths kept: the forced and those of step 3 first, then the nearest, up to `paths`
  const kept = new Map();
  for (const point of points)
    kept.set(
      point,
      [...point.out]
        .sort(([, p], [, q]) => Number(q.forced) - Number(p.forced) || p.length - q.length)
        .slice(0, Math.max(mostPaths, [...point.out.values()].filter((path) => path.forced).length)),
    );
  // only the waypoints got to from a place to start that have a way back to one: a bot sent anywhere else
  // would never arrive, or never leave
  const into = new Map(points.map((point) => [point, []]));
  for (const [point, out] of kept) for (const [to] of out) into.get(to).push(point);
  const begin = points.filter((point) => point.kind === "start");
  if (!begin.length && points.length) begin.push(points[0]);
  const reached = (next) => {
    const seen = new Set(begin);
    const list = [...begin];
    for (let at = 0; at < list.length; at++)
      for (const to of next(list[at])) if (!seen.has(to)) seen.add(to), list.push(to);
    return seen;
  };
  const forth = reached((point) => kept.get(point).map(([to]) => to));
  const back = reached((point) => into.get(point));
  const astray = points.filter((point) => !forth.has(point));
  const stuck = points.filter((point) => forth.has(point) && !back.has(point));
  const said = (list) =>
    `${list
      .slice(0, 6)
      .map((point) => `${point.kind} at ${place(point.origin)}`)
      .join("; ")}${list.length > 6 ? "; ..." : ""}`;
  if (astray.length)
    warnings.push(
      `${astray.length} waypoints were left out: no path from a place to start gets to them (${said(astray)})`,
    );
  if (stuck.length)
    warnings.push(
      `${stuck.length} waypoints were left out: no path from them gets back to a place to start, a pit or a one-way place (${said(stuck)})`,
    );
  const final = points.filter((point) => forth.has(point) && back.has(point));
  const index = new Map(final.map((point, number) => [point, number]));
  const waypoints = final.map((point) => {
    const out = kept.get(point).filter(([to]) => index.has(to));
    const ways = out.map(([, path]) => path.why);
    return {
      origin: point.origin,
      // a jump's flag only where a jump is still taken from it
      flags: ways.includes("jump") ? point.flags : point.flags & ~RCW_FLAGS.JUMP,
      kind: point.kind,
      paths: out.map(([to]) => index.get(to)),
      ways,
    };
  });

  // ── what was made ──
  const count = (kind) => waypoints.filter((waypoint) => waypoint.kind === kind).length;
  const pathCount = waypoints.reduce((sum, waypoint) => sum + waypoint.paths.length, 0);
  const oneWay = waypoints.reduce(
    (sum, waypoint, number) =>
      sum + waypoint.paths.filter((to) => !waypoints[to].paths.includes(number)).length,
    0,
  );
  const lengths = waypoints.flatMap((waypoint) =>
    waypoint.paths.map((to) => distance(waypoint.origin, waypoints[to].origin)),
  );
  const flagged = (flag) => waypoints.filter((waypoint) => waypoint.flags & flag).length;
  facts.push(
    `${waypoints.length} waypoints on ${Math.round(walked.length * grid.cell * grid.cell)} square units of walked floor, a spacing of ${Math.round(spacing)}: ${count("start")} at places to start, ${flagged(RCW_FLAGS.LADDER)} at ${laddersWaypointed} ladders, ${flagged(RCW_FLAGS.JUMP)} to jump from, ${count("flight")} at the ends of ${flightCount} flights and ramps, ${count("opening")} in ${openingCount} openings, ${count("floor")} on open floor, ${count("corner")} at corners, ${count("ledge")} at the top of ${dropsWaypointed} drops (${mended} jumps and drops added where the paths did not join what the walk does), ${flagged(RCW_FLAGS.CROUCH)} crouching in ${passages} passages`,
  );
  facts.push(
    `${pathCount} paths (${oneWay} one way), ${lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0} units long on the average, at most ${Math.max(0, ...waypoints.map((waypoint) => waypoint.paths.length))} out of one waypoint`,
  );
  const outside = waypoints.filter((waypoint) => waypoint.origin.some((value) => value > 4096));
  if (outside.length)
    warnings.push(
      `${outside.length} waypoints are over 4096 on an axis: RCBot takes them as deleted when it loads them`,
    );
  if (lifts)
    warnings.push(
      `${lifts} lifts (func_plat) carry the walk: they are not waypointed, and what only a lift reaches is left out`,
    );
  if (reach.graph.hops.length)
    warnings.push(`${reach.graph.hops.length} teleports are walked into: they are not waypointed`);
  const leftOut = [...astray, ...stuck].map((point) => ({
    origin: point.origin,
    kind: point.kind,
    why: forth.has(point) ? "no way back" : "not got to",
  }));
  return { waypoints, leftOut, facts, warnings, spacing, cell: grid.cell, reach };
}
