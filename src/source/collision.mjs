// Where a player is blocked in a GoldSrc map and in its port to GMod, ported from stevenlafl's
// tools/map/check-collision.mjs: random spots inside the map, each asked of the GoldSrc map's hull 1 (the
// standing player's, its clip brushes in it; hull 3 ducked) and of the port loaded in the game (a player-sized
// TraceHull, MASK_PLAYERSOLID, the world only). They agree, or each spot that does not is listed.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readBsp, leafAt, contentsAt } from "../maps/bsp.mjs";
import { findGmod } from "./compile.mjs";
import { runProbe } from "./game.mjs";

const SOLID = -2;
const SKY = -6;

/** mulberry32: a seed gives the same spots every run. */
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` spots inside a GoldSrc map: in the world's box, open in hull 0 (the player's middle, as hull 1 is
 * centred on it), not in the sky. Each on a half unit: a map's planes are mostly on whole ones, and a spot on a
 * plane is open to GoldSrc where Source's box, its feet on the floor, starts solid.
 */
export function collisionSpots(bsp, { count = 5000, seed = 1 } = {}) {
  const world = bsp.models[0];
  const random = seeded(seed);
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 200; tries++) {
    const p = [0, 1, 2].map(
      (k) => Math.floor(world.mins[k] + (world.maxs[k] - world.mins[k]) * random()) + 0.5,
    );
    const leaf = leafAt(bsp, p);
    if (leaf !== 0 && bsp.leaves[leaf].contents !== SOLID && bsp.leaves[leaf].contents !== SKY) spots.push(p);
  }
  return spots;
}

/** The probe's Lua: each spot asked of the world with Source's player box, standing on its origin. */
function collisionLua(mapName, { ducked, noclip }) {
  const half = ducked ? 18 : 36;
  const mask = noclip
    ? "bit.band(MASK_PLAYERSOLID, bit.bnot(CONTENTS_PLAYERCLIP + CONTENTS_MONSTERCLIP))"
    : "MASK_PLAYERSOLID";
  return `if not check(game.GetMap():lower() == ${JSON.stringify(mapName.toLowerCase())}, "the map loaded is ${mapName} (" .. game.GetMap() .. ")") then return done() end
local o, onlyWorld = {}, function(e) return e:IsWorld() end
for x, y, z in string.gmatch(file.Read("smak_collision_spots.txt", "DATA"), "(-?[%d.]+),(-?[%d.]+),(-?[%d.]+)") do
  local v = Vector(tonumber(x), tonumber(y), tonumber(z) - ${half})
  local r = util.TraceHull({ start = v, endpos = v, mins = Vector(-16, -16, 0), maxs = Vector(16, 16, ${half * 2}), mask = ${mask}, filter = onlyWorld })
  o[#o + 1] = r.StartSolid and "1" or "0"
end
note("blocked " .. table.concat(o))
done()`;
}

/**
 * A GoldSrc map held against its port loaded in GMod (a dedicated server's install as `game`, else GMod's),
 * spot by spot. Resolves to `{ spots, both, free, onlyGoldSrc: [points], onlySource: [points], intoWorld,
 * unexplained, probe }` (`onlySource` split: the spots where the drawn world is inside the player's box, which
 * Source blocks rightly, and the rest), or throws when the game gave no answer (its probe's failed lines said).
 */
export async function checkCollision(
  file,
  { name, count = 5000, seed = 1, ducked = false, noclip = false, game, wait = 60000, ...link } = {},
) {
  const bsp = readBsp(readFileSync(file));
  const mapName = name ?? basename(file).replace(/\.bsp$/i, "");
  const spots = collisionSpots(bsp, { count, seed });
  const folder = game ?? findGmod();
  if (!folder)
    throw new Error("no GMod folder found in Steam's libraries: --game <the folder that holds garrysmod/>");
  mkdirSync(join(folder, "garrysmod", "data"), { recursive: true });
  // a console line cannot hold the spots: they go by the game's data folder
  writeFileSync(
    join(folder, "garrysmod", "data", "smak_collision_spots.txt"),
    spots.map((p) => p.join(",")).join(";"),
  );
  const probe = await runProbe(collisionLua(mapName, { ducked, noclip }), {
    name: "collision",
    game: folder,
    wait,
    ...link,
  });
  const line = probe.notes.find((n) => n.startsWith("blocked "));
  if (!line || probe.failed.length) throw new Error(`the game gave no answer: ${probe.failed.join("; ") || (probe.timedOut ? `no DONE in ${wait / 1000} s` : "no blocked line")}`); // prettier-ignore
  const blocked = line.slice("blocked ".length);
  if (blocked.length !== spots.length)
    throw new Error(`the game answered ${blocked.length} spots of ${spots.length}`);
  const hull = ducked ? 3 : 1;
  let both = 0;
  const onlyGoldSrc = [];
  const onlySource = [];
  spots.forEach((p, i) => {
    const gs = contentsAt(bsp, p, { hull }) === SOLID;
    const src = blocked[i] === "1";
    if (gs && src) both++;
    else if (gs) onlyGoldSrc.push(p);
    else if (src) onlySource.push(p);
  });
  const half = ducked ? 18 : 36;
  const intoWorld = onlySource.filter((p) => worldInBox(bsp, p, half));
  const unexplained = onlySource.filter((p) => !intoWorld.includes(p));
  return { spots: spots.length, both, free: spots.length - both - onlyGoldSrc.length - onlySource.length, onlyGoldSrc, onlySource, intoWorld, unexplained, probe }; // prettier-ignore
}

/**
 * Whether the drawn world (hull 0's solid or sky) is inside a player's box whose middle is `p`, sampled a unit
 * apart strictly inside it. GoldSrc's compiled hull 1 is looser than its own geometry at slanted beams and corners
 * (stalkyard: 25 of 35 spots blocked only in the port): there the box overlaps the world, and Source blocks it
 * rightly.
 */
export function worldInBox(bsp, p, half = 36) {
  for (let x = -15.5; x <= 15.5; x++)
    for (let y = -15.5; y <= 15.5; y++)
      for (let z = -half + 0.5; z <= half - 0.5; z++) {
        const c = bsp.leaves[leafAt(bsp, [p[0] + x, p[1] + y, p[2] + z])].contents;
        if (c === SOLID || c === SKY) return true;
      }
  return false;
}
