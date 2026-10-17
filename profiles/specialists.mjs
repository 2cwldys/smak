// A SECOND MOD'S PROFILE: The Specialists (the game folder `ts`), and its role-play cities.
//
// Like profiles/mastersword.mjs, no part of the kit's core: data and a little code, read from the installed
// game when the profile is made (its FGD, its program, its own maps), and holding no game content.
//
//   import specialists from "./smak/profiles/specialists.mjs";
//   const mod = specialists({ game: "C:/games/Half-Life" });                  // or { folders: [ts, valve] }
//   const city = specialists({ game, kind: "roleplay" });                     // held against RP cities
//
//   smak map-check city.bsp --mod smak/profiles/specialists.mjs --game <Half-Life>/ts --game <Half-Life>/valve
//   smak map-character city.bsp --mod smak/profiles/specialists-roleplay.mjs --game <Half-Life>/ts
//
// WHERE EACH FACT IS FROM. "The maps" are the 29 the game ships in ts/maps (version 3.0), read with this kit;
// "the cities" are three role-play maps of the Havoc9 community, played on The Specialists
// (paradisecity_revival_final, xenoncity_final, alexandria_msr_b5), read on 2026-10-17; the FGD is
// ts/ts_fgd.fgd; the program is ts/dlls/mp.dll, as the `gamedll` line of ts/liblist.gam names it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { definitionsOf } from "../src/maps/index.mjs";

const MOD_FOLDER = "ts";
const PROGRAM = "dlls/mp.dll";
const FGD = "ts_fgd.fgd";

/**
 * A map's character (character.mjs, `smak map-character`) against the game's own 29 maps: what a
 * deathmatch arena of The Specialists is. [lower quartile, median, upper quartile], measured with
 * `learnCharacter` on 2026-10-17, switched lights counted as the maps start.
 */
export const ARENAS = {
  from: "the game's 29 maps",
  figures: {
    offGrid: [2.1, 4.6, 10.4],
    sloped: [3.5, 5.7, 12],
    levels: [6, 8, 11],
    heightSpread: [158, 199, 281],
    textures: [41, 69, 89],
    sounds: [0, 4, 7],
    shadow: [5, 8, 16],
    brightest: [231, 247, 255],
    lightMean: [51.7, 64.1, 89.9],
    props: [0, 0, 37],
    lights: [1, 16, 50],
    music: [0, 0, 0],
    floorArea: [7970680, 11361857, 16562533],
    faces: [4714, 7945, 11192],
  },
};

/**
 * The same against the Havoc9 cities: what a role-play city is. A city is on the grid (a street of boxes
 * is no fault), dressed heavily (hundreds of textures, a hundred props, fifty sounds), dense (small rooms,
 * corridors under 176 wide), and lit in pools under a night sky. Three maps: the quartiles are the least,
 * the middle and the most of them.
 */
export const CITIES = {
  from: "Havoc9's three role-play cities",
  figures: {
    offGrid: [11.3, 13.7, 16.5],
    sloped: [4.8, 5.9, 7.3],
    levels: [11, 13, 13],
    heightSpread: [418, 650, 1064],
    textures: [64, 236, 444],
    sounds: [38, 47, 94],
    shadow: [13, 14, 21],
    brightest: [222, 255, 255],
    lightMean: [58.9, 62.1, 87.1],
    props: [70, 101, 214],
    lights: [53, 93, 104],
    music: [0, 0, 0],
    floorArea: [23344404, 25332408, 41219231],
    faces: [16285, 16659, 28448],
  },
};

/**
 * The profile, from the installed game:
 *   game      the Half-Life folder (the one that holds ts/ and valve/)
 *   folders   the game's folders themselves, the mod's first: `[<Half-Life>/ts, <Half-Life>/valve]`
 *   kind      "arena" (the game's own maps, the default) or "roleplay" (the cities): what a map's
 *             character is held against
 *   cache     a file to keep what the maps teach in (unless told: one in the system's temp folder)
 */
export default function specialists({ game, folders, kind = "arena", cache } = {}) {
  const home = folders?.length ? folders : game ? [join(game, MOD_FOLDER), join(game, "valve")] : null;
  if (!home || !existsSync(home[0]))
    throw new Error(
      `The Specialists' profile is made from the installed game: give { game: <the Half-Life folder> } or { folders: [<Half-Life>/ts, <Half-Life>/valve] }${home ? ` (${home[0]} is not there)` : ""}`,
    );
  if (!["arena", "roleplay"].includes(kind))
    throw new Error(`The Specialists' profile: kind is "arena" or "roleplay", not ${JSON.stringify(kind)}`);
  const mod = home[0];
  const against = kind === "roleplay" ? CITIES : ARENAS;
  const fgd = [join(mod, FGD)].filter((file) => existsSync(file));

  // the FGD's Door base class writes `delay(integer)`, and Half-Life reads a door's delay as a number of
  // seconds with a fraction (the SDK's dlls/subs.cpp, CBaseDelay::KeyValue: atof); the cities write "0.5".
  // Every class the FGD gives a whole-number delay is given its true kind
  const classes = {};
  if (fgd.length)
    for (const [name, defined] of Object.entries(definitionsOf(fgd).classes))
      if (defined.keys.delay?.type === "integer") classes[name] = { keys: { delay: { type: "float" } } };
  return {
    name: "specialists",
    title: kind === "roleplay" ? "The Specialists, role-play cities" : "The Specialists",
    folders: home,
    dlls: [join(mod, PROGRAM)].filter((file) => existsSync(file)),
    fgd,
    classes,
    learned: { maps: join(mod, "maps"), cache: cache ?? join(tmpdir(), "smak-specialists-entities.json") },

    // a player comes into a map at an info_player_deathmatch: the `mpentity` line of ts/liblist.gam, and in
    // every one of the 29 maps; info_player_start is Half-Life's, which the program also spawns at
    starts: ["info_player_deathmatch", "info_player_start"],

    // what a map is dressed with. A prop is a ts_model: the FGD's "model in the world" (a model, its
    // sequence and its render keys), 214 of them in one city; the game has no music entity of its own
    character: {
      from: against.from,
      props: ["ts_model"],
      sounds: ["ambient_generic", "env_sound"],
      music: [],
      figures: against.figures,
    },
  };
}
