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
//   smak build arena.json --mod smak/profiles/specialists.mjs --game <Half-Life>/ts --game <Half-Life>/valve   (SPEC)
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


// ── team play, compact arenas and the game's own dressing (smak map-teams, map-character --kind compact,
// map-dressing --mod) ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The same figures against the game's eight compact arenas, the maps a small team map is laid beside
 * (ts_trident, ts_hammertime, ts_lobbyduel, ts_wyndham, ts_supertimor, ts_metro, ts_rundown, ts_neobaroque):
 * `smak map-character <them> --mod specialists --learn`, 2026-10-21, with `lampFaces` (texture lights) counted.
 * `kind: "compact"` (`--kind compact`) holds a map against these.
 */
export const COMPACT = {
  from: "The Specialists' eight compact arenas",
  figures: {
    offGrid: [4.4, 4.5, 25.6],
    sloped: [5.5, 9.8, 26.3],
    levels: [6, 7, 9],
    heightSpread: [116, 159, 281],
    textures: [50, 79, 103],
    sounds: [0, 4, 17],
    shadow: [5, 9, 15],
    brightest: [247, 250, 255],
    lightMean: [62.4, 66.7, 101.6],
    props: [0, 3, 37],
    lights: [2, 19, 83],
    lampFaces: [25, 105, 292],
    music: [0, 0, 0],
    floorArea: [4973962, 7578194, 8138221],
    faces: [4095, 4712, 7559],
  },
};

/**
 * A map's dressing (`smak map-dressing --mod specialists`, dressing.mjs) against the game's own 29 maps, not
 * Valve's campaign: `learnDressing` over ts/maps (`smak map-dressing <ts/maps> --learn`), 2026-10-21, each band
 * the 5th to the 95th in 100 with its quartiles. The game's maps are lit brighter and flatter than Valve's: the
 * floor under 24 a median 10% (Valve's 21%), its contrast a median 3.9 (Valve's 12.9).
 */
// prettier-ignore
export const DRESSING = {
  name: "The Specialists'",
  of: "The Specialists' own 29 maps",
  maps: "the game's 29 maps (ts/maps, version 3.0), measured 2026-10-21",
  measures: {
    scaleOne: { least: 0.175, q1: 0.418, median: 0.723, q3: 0.816, most: 0.96 },
    shifted: { least: 0.488, q1: 0.647, median: 0.838, q3: 0.91, most: 0.975 },
    bandedWalls: { least: 0.042, q1: 0.153, median: 0.207, q3: 0.294, most: 0.467 },
    oneTextureWalls: { least: 0.295, q1: 0.392, median: 0.439, q3: 0.662, most: 0.78 },
    joinHeight: { least: 128, q1: 152, median: 176, q3: 224, most: 352 },
    lampFaces: { least: 0.563, q1: 1.62, median: 3.328, q3: 36.25, most: 289 },
    nonAxial: { least: 0.025, q1: 0.045, median: 0.09, q3: 0.159, most: 0.454 },
    detail: { least: 1.768, q1: 3.853, median: 5.242, q3: 7.214, most: 14.816 },
    darkFloor: { least: 0.011, q1: 0.056, median: 0.095, q3: 0.159, most: 0.555 },
    contrast: { least: 2.195, q1: 2.871, median: 3.872, q3: 6.313, most: 10.701 },
  },
};

/**
 * Team play as Havoc9's ts_matchmode plays it (`smak map-teams`, teams.mjs): The Specialists has no team spawns,
 * so the plugin reads a per-map file (`addons/amxmodx/configs/tsm_spawns_<map>.cfg`, lines `tsm_spawn <team>
 * <x> <y> <z> <pitch> <yaw>`) and, without one, splits the map's own spawns in two: its info_player_deathmatch
 * then its info_player_start, 64 at the most, the two farthest apart the anchors, each spawn with the nearer
 * (ts_matchmode.sma, collect_spawns and partition_spawns). Team 1 is "msr", team 2 "insurgents"; sides never
 * swap. What a team map is held to: the nearest spawns of the two teams `cross` apart (a FAIL under `fail`, a
 * WARN under `warn`: the game's own maps, split by the plugin, come to 300 to 700), no spawn seeing one of the
 * other team's, and the walks from each team's spawns to a goal within `balance` per cent of each other.
 */
export const TEAMS = {
  plugin: "ts_matchmode",
  classes: ["info_player_deathmatch", "info_player_start"],
  most: 64,
  names: ["msr", "insurgents"],
  cfg: "tsm_spawns_<map>.cfg",
  cross: { fail: 512, warn: 1400 },
  balance: { warn: 10, fail: 25 },
  sight: "fail",
};

/**
 * The figure judges' part of the profile (src/figures/; `smak figure-survey`, `figure-judge`, `figure-texture`,
 * `figure-shape` with `--mod specialists`): The Specialists' players (models/player/<name>/<name>.mdl) as a
 * manner. The corpus itself is never here: it is measured on the person's machine from the installed game, into
 * a library of theirs (`smak figure-survey <Half-Life> --mod specialists`). What is here is how far TS's figures
 * stand from each other game's on each measure (the distance of the medians over the middle half, averaged over
 * the other corpora): the weights each judge goes by, the measures that tell this manner most weighing most.
 */

// prettier-ignore
export const FIGURE_STYLE = {
  name: "ts",
  title: "The Specialists' players",
  corpus: { name: "ts", folders: ["ts"] },
  judges: ["style", "texture", "shape"],
  // scored: shape, texture and colour; proportions and the parts' figures told, not scored (they tell
  // characters apart, not manners)
  groups: ["shape", "texture", "colour"],
  least: 0.25,
  from: "297 figures of valve, valve_hd, cstrike, cstrike_hd, ts, msc and msr, measured 2026-10-19 (the figures research)",
  weights: {
    style: {
      tris: 0.44, edge: 0.96, edgeSpread: 1.09, pieces: 0.72, rigid: 0.3, open: 0.48, hard: 1.54, boxy: 0.35,
      sym: 1.63, heads: 0.97, shoulders: 0.09, bulk: 0.76, armLen: 1.2, legLen: 0.97, hand: 1.45, texels: 0.4,
      texelSpread: 0.4, textures: 0.46, texSize: 0.89, used: 0.75, reuse: 0.96, mirrored: 0.62, stretch: 1.01,
      chrome: 0.02, colours: 1.37, value: 1.38, contrast: 1.35, sat: 0.65, accent: 0.47, dark: 1.64, hues: 0,
      grain: 1.32, detail: 0.45, flat: 0.24, d_head: 0.37, t_head: 0.36, v_head: 0.36, d_torso: 0.52,
      t_torso: 0.58, v_torso: 0.46, d_arm: 0.15, t_arm: 0.46, v_arm: 0.3, d_hand: 0.29, t_hand: 0.45,
      v_hand: 0.29, d_leg: 0.29, t_leg: 0.34, v_leg: 0.35, d_foot: 0.22, t_foot: 1.26, v_foot: 0.97,
    },
    texture: {
      repeat: 1.89, repeatAny: 1.65, marks: 1.53, lightMarks: 1.4, flat: 1.57, ramp: 0.62, speckle: 0.58,
      grain: 1.32, cluster: 1.73, quiet: 1.74, diagonal: 0.91, chartRect: 0.63, charts: 1.18, chartDiag: 1.09,
      value: 1.39, contrast: 1.33, dark: 1.65, colours: 1.37, sat: 0.65, aoFollow: 0.32, aoFollowAll: 0.27,
    },
    shape: {
      holes: 0.3, fineHoles: 0.57, holeCount: 1.01, concave: 1.6, rough: 1.18, notchS: 0.31, notchM: 0.85,
      notchL: 0.74, edges: 0.99, cells: 0.73, cellGini: 0.16, asym: 1.97, pieceGini: 0.99, sizeRange: 0.44,
      small: 0.53, layers: 0.53, deep: 1.05, mirror: 2.39, alike: 0.51, boxes: 0.76,
    },
  },
  // how well each judge told this corpus' own figures from the others' (AUC: 1 perfect, 0.5 a coin)
  validated: {"style":"0.92 to 0.98","texture":"0.71 (against cstrike) to 0.98","shape":"0.89 to 1.00"},
  notes: [
    "a strong corpus (23 figures): own figures told from every other game's",
    "what tells it most: near-black, symmetry, hard edges, hand size, value, few colours, contrast; texture: repetition, quiet areas, flat fills, darks; shape: mirror, asymmetry of the silhouette, a concave outline",
  ],
};

/**
 * What a map spec of The Specialists is built with where the spec says nothing (src/spec/map.mjs, `smak build
 * --mod`; docs/SPEC.md, "A mod's map"): the game's textures, its props as its maps put them, and rooms furnished
 * by their `use` with the game's own models. Read off the 29 maps on 2026-10-21:
 *
 *   textures  The maps keep most of their textures inside themselves or in .wad files the game does not ship
 *             (2105 of the 2381 they wear); a map of one's own can name only the shipped ones: ts/specialists.wad
 *             (116) and valve/halflife.wad. Each word below is the one of those two the maps wear most for that
 *             part (by the area of floor, wall or ceiling, and the maps that wear it): wood4a the floor (4 maps,
 *             the most of any shipped texture), crete33 the walls (the most wall), fifties_ceil01 the ceiling
 *             (3 maps, the most ceiling), door006 a door (2), basetrim02 the trim (2), wall1 brick outside,
 *             masphalt4 a roof and a yard (2); a room's use wears cardbox1 crates (3), metal_rusty5ccc barrels
 *             (2), lab1_cab2 lockers, drkmtlt_bord11 consoles, +0drkmtl_scrn screens, trrm_wood2 desks, lab1_b4
 *             machines (2 each), lab1_brd10 pipes (4), lab1_trim3 struts (3). More named, for a room's
 *             `surfaces`: ts_tile, ts_brick, ts_concrete, ts_plaster, ts_parquet, ts_planks, ts_asphalt,
 *             ts_street, ts_metal, ts_hazard, ts_glass.
 *   props     a ts_model (627 in 14 maps; cycler_sprite 71 in 2, env_sprite 49 in 1): its `model`, `angles`.
 *   things    only models the maps name (so the game has them; a model it has not stops a map loading), each
 *             measured with this kit's reader posed in its first animation: `r` half its length along a wall,
 *             `wall` its origin off the wall, `deep` how far it reaches into the room, `lift` its origin over its
 *             foot (the game's potted plants stand on their middle), `turn` the yaw that faces it +x, its back
 *             to -x, read from where the maps stand it (the nearest wall behind it: a couch's back is +y, 33 of
 *             43 against a wall so) and from its pictures; a computer stands `on` a desk of the kit's (the maps
 *             stand theirs on brush desks). `high` its top over its foot, measured so. The counts: [placed, in
 *             maps].
 *   solid     the game's program makes a ts_model a point to a player: ts_i386.so's CTSModel::Spawn sets its size to
 *             nothing (UTIL_SetSize with two zero vectors), its solid to SOLID_SLIDEBOX and its movetype to none, so
 *             a player walks through a couch and stops only at its origin, and a shot passes it. The maps' makers
 *             put CLIP brushes round some (measured: the player's hull solid at a ts_model's origin where the
 *             point hull is open all round it): 118 of 886, the seating most (3dm_sofa_antro 18 of 18,
 *             lmd_dualbooth 16 of 18, Schmung/sg_couch 8 of 17, 3dm_chair 27 of 69), plants, boxes and benches
 *             none. The profile clips what a player would walk into and not through: couches, armchairs,
 *             tables, booths, boxes, a dumpster, a bench, a statue (`solid: true`); plants, pictures, office
 *             chairs and the street lamp are walked through, as in the game's maps.
 *   uses      office, lobby, cafe, warehouse, garage, server, stairwell, and in the open (`sky`) alley, plaza and
 *             rooftop; the game has no models for a bathroom or a kitchen's stove, and its crates are brushes
 *             (func_breakable, 1006 in 27 maps): a warehouse's crates are the kit's in cardbox1 beside the
 *             game's boxes.
 *   lamps     the game's light textures, lit as texture lights (an info_texlights in the map: hlrad's own list, no
 *             lights.rad needed). The game ships no lights.rad and specialists.wad has no light texture: its maps'
 *             lamps are halflife.wad's, +0~fifties_lgt2 the most (12 maps), then ~trn_lt1 (9), +0~generic86 and
 *             +0~light3a (6), ~light3b and +0~generic85 (4)... Each colour is the one the maps' makers lit it in:
 *             the median of the light on its own faces in those maps (an emitter's face is lit by its own value,
 *             99 to 100 in 100 of their luxels at full: fifties_lgt2 252 255 234, warm where Valve's list has it
 *             cool). +0~white (7 maps) is no emitter (6 in 100 at full) and is left out. Each brightness is the
 *             one this kit's Valve list was calibrated to (src/maps/texlights.mjs: a recompile of Valve's maps lit
 *             as the retail ones), for want of the makers' own: a lamp of the same texture and size. The fixture
 *             every room's lamp is built as (`fixture`) is +0~fifties_lgt2, a tube of 16 by 64 on the ceiling;
 *             ts_lamp, ts_lamp_warm, ts_lamp_cool, ts_sodium and ts_screen name the rest for a spec's own.
 *   breakable what breaks (func_breakable: 1006 in 27 of the 29 maps, read 2026-10-21 from their entities). Glass
 *             is the most: most leave `material` out (its default is 0, glass: 533) and draw it in render mode 2
 *             (522), `renderamt` 75 to 150 (100 the middle), `health` 1 (222 of the glass, 68 more at 3).
 *             Crates are wood (`material` 1, 242 of all): cardbox1, cardboxtop/bot, the maps' own boxes, 32 to 48
 *             a side, `health` 25, 15, 2 or 1 (15 the middle); seven of them stand on another. Metal (`material`
 *             2, 61) is vents and grates at `health` 1, doors and crates at 50 to 100; concrete (4, 129) 25 to 60.
 *             No map of the game's sets `respawntime` (0: the game's 30 seconds, per ts/mapping.txt; under 0:
 *             never); a round of the Havoc9 matchmode plugin resets nothing, so a map of its takes 45
 *             (maps/meridian/STUDY.md: 30 to 60, never under 0). The kit's crates are wood that breaks, each
 *             crate alone, as the game's do (`pieces`); a window's glass is the game's glass_bright, which its
 *             maps break most of the shipped glass (27).
 */
// prettier-ignore
export const SPEC = {
  wads: ["specialists.wad", "halflife.wad"],
  theme: { floor: "ts_floor", wall: "ts_wall", ceiling: "ts_ceiling", door: "ts_door", trim: "ts_trim", furniture: "ts_furniture", outside: "ts_outside", roof: "ts_roof" },
  textures: {
    ts_floor: { texture: "wood4a" },
    ts_wall: { texture: "crete33" },
    ts_ceiling: { texture: "fifties_ceil01" },
    ts_door: { texture: "door006" },
    ts_trim: { texture: "basetrim02" },
    ts_furniture: { texture: "wood21" },
    ts_outside: { texture: "wall1" },
    ts_roof: { texture: "masphalt4" },
    // what a room's use dresses it with (src/spec/dress.mjs's words)
    crate: { texture: "cardbox1" },
    barrel: { texture: "metal_rusty5ccc" },
    locker: { texture: "lab1_cab2" },
    console: { texture: "drkmtlt_bord11" },
    screen: { texture: "+0drkmtl_scrn" },
    desk: { texture: "trrm_wood2" },
    machine: { texture: "lab1_b4" },
    pipe: { texture: "lab1_brd10" },
    strut: { texture: "lab1_trim3" },
    // for a room's surfaces
    ts_tile: { texture: "tilez1" },
    ts_brick: { texture: "wall1" },
    ts_concrete: { texture: "bigcrete2" },
    ts_plaster: { texture: "plaster1" },
    ts_parquet: { texture: "floor004" },
    ts_planks: { texture: "wood4a" },
    ts_asphalt: { texture: "masphalt4" },
    ts_street: { texture: "masphalt5" },
    ts_metal: { texture: "metal_rusty5eee" },
    ts_hazard: { texture: "stripes2" },
    ts_glass: { texture: "glass_dark" },
    // a window's pane (links of kind window with glass), a glass screen's (a piece that breaks as glass)
    glass: { texture: "glass_bright" },
    // the lamps (lamps, below): every room's fixture, and words for a spec's own
    fixture: { texture: "+0~fifties_lgt2" },
    // a dimmed lamp's (composed light, below): halflife.wad's tube of the same size, lit low
    fixture_dim: { texture: "+0~fifts_lght3" },
    ts_lamp: { texture: "+0~fifties_lgt2" },
    ts_lamp_warm: { texture: "~trn_lt1" },
    ts_lamp_cool: { texture: "+0~light3a" },
    ts_sodium: { texture: "+0~tnnl_lgt4" },
    ts_screen: { texture: "+0drkmtl_scrn" },
  },
  // the game's light textures as texture lights: [r, g, b, brightness], the colour its maps' makers lit each in,
  // the brightness this kit's Valve list gives it; the maps that wear it, as a comment
  lamps: {
    "+0~fifties_lgt2": [252, 255, 234, 2600], // 12
    "~trn_lt1": [255, 249, 160, 3300], // 9
    "+0~generic86": [255, 242, 178, 16100], // 6
    "+0~light3a": [226, 220, 255, 27700], // 6
    "~light3b": [207, 207, 255, 4800], // 4
    "+0~generic85": [162, 187, 255, 20700], // 4
    "+0~light4a": [255, 249, 205, 8600], // 3
    "+0~generic65": [255, 255, 255, 5200], // 2
    "+0~fifts_lght01": [255, 255, 208, 2500], // 2
    "+0~tnnl_lgt4": [255, 185, 124, 3200], // 2
    "+0drkmtl_scrn": [124, 143, 255, 36200], // 2
    yellow: [255, 226, 160, 3000], // 2
    "~spotyellow": [255, 255, 181, 23100], // 2
    // the dim fixture: no map of the game's wears it; lit at a quarter of fifties_lgt2, a dimmed lamp
    "+0~fifts_lght3": [252, 255, 234, 650],
  },
  // how a map of the game's is lit where the spec says nothing (src/spec/map.mjs): a room's lamp is its fixture
  // alone (`lamp`: the brightness of a light entity under it; the game's maps light their rooms by texture lights:
  // ts_trident has one light entity and 58 lamp faces), and the light composed, a lamp in three dimmed (its fixture
  // the dim tube) so that the rooms are lit in pools. Measured on a spec of a lobby, an office and a warehouse: with
  // Valve's lamps of 250 under the fixtures their floors were lit at 218 of 255 (the game's compact maps: 62 to 102,
  // its arenas 52 to 90); the fixtures alone, 91; composed, as below, in the band
  lighting: { lamp: 0, composed: { rhythm: 3, dim: 0.3, goal: 1.6, spill: 0, fade: 2, bounce: 2 } },
  // what breaks (src/spec/map.mjs BREAKABLE_MATERIALS): the keys each material takes in the game's maps
  breakable: {
    keys: { respawntime: 45 },
    materials: {
      glass: { material: 0, rendermode: 2, renderamt: 100, health: 1 },
      wood: { material: 1, health: 15 },
      metal: { material: 2, health: 50 },
      concrete: { material: 4, health: 50 },
      computer: { material: 6, health: 25 },
    },
  },
  // the kit's dressing pieces as the game's: its crates break, each alone; and its plain crates of 40 and 48
  pieces: {
    crate_small: { breakable: "wood" },
    crate_large: { breakable: "wood" },
    crate_stack: { breakable: "wood" },
    crate40: { pieces: [{ box: [[0, -20, 0], [40, 20, 40]], texture: "crate" }], breakable: "wood" },
    crate48: { pieces: [{ box: [[0, -24, 0], [48, 24, 48]], texture: "crate" }], breakable: "wood" },
  },
  // a ts_model is a point to a player (CTSModel::Spawn gives it a box of no size, SOLID_SLIDEBOX): a thing that is
  // `solid` below is given a CLIP box of its footprint and `high`; the rest are walked through, as most are in the
  // game's maps
  prop: { class: "ts_model", solid: false },
  things: {
    couch: { model: "models/schmung/sg_couch.mdl", r: 72, wall: 27, deep: 19, turn: 90, high: 46, solid: true },                   // [43, 6]
    sofa: { model: "models/3dm_sofa.mdl", r: 60, wall: 24, deep: 24, turn: 90, high: 49, solid: true },                            // [14, 2]
    armchair: { model: "models/schmung/sg_chair.mdl", r: 34, wall: 27, deep: 19, turn: 90, high: 46, solid: true },                // [21, 4]
    officeChair: { model: "models/3dm_chair.mdl", r: 22, wall: 19, deep: 19, high: 48 },                              // [27, 1]
    chair: { model: "models/schmung/sg_bkchair.mdl", r: 19, wall: 15, deep: 13, turn: 180, high: 52 },                // [8, 1]
    coffeeTable: { model: "models/sg_3dmtab.mdl", r: 30, wall: 54, deep: 54, turn: 90, high: 25, solid: true },                                   // [6, 1]
    table: { model: "models/schmung/sg_table2.mdl", r: 37, high: 39, solid: true },                                                // [1, 1]
    workstation: { model: "models/3dm_pc4.mdl", r: 16, wall: 35, deep: 0, turn: 180, on: "bench", high: 27 },        // [6, 2]
    workstation2: { model: "models/3dm_pc3.mdl", r: 20, wall: 35, deep: 0, turn: 180, on: "bench", high: 27 },       // [1, 1]
    booth: { model: "models/teahouse/lmd_singlebooth.mdl", r: 36, wall: 4, deep: 25, turn: 180, high: 57, solid: true },          // [12, 1]
    plant: { model: "models/xen/plants/xen_plant6b.mdl", r: 25, lift: 70, high: 91 },                                // [45, 3]
    plant2: { model: "models/xen/plants/xen_plant2b.mdl", r: 33, lift: 47, high: 99 },                               // [25, 3]
    plant8: { model: "models/xen/plants/xen_plant8b.mdl", r: 27, lift: 68, high: 100 },                               // [24, 3]
    tallPlant: { model: "models/ts_theatre/xt_plant2.mdl", r: 49, lift: 14, high: 93 },                              // [6, 2]
    statue: { model: "models/sg_cstatue.mdl", r: 21, wall: 7, deep: 14, lift: 1, high: 110, solid: true },                         // [2, 2]
    painting1: { model: "models/schmung/sg_paintinga1.mdl", r: 53, wall: 2, deep: 3, lift: 64, high: 91 },           // [2, 1]
    painting2: { model: "models/schmung/sg_paintinga2.mdl", r: 53, wall: 2, deep: 3, lift: 64, high: 91 },           // [2, 1]
    painting3: { model: "models/schmung/sg_paintinga3.mdl", r: 53, wall: 2, deep: 3, lift: 64, high: 91 },           // [3, 1]
    painting4: { model: "models/schmung/sg_paintinga4.mdl", r: 53, wall: 2, deep: 3, lift: 64, high: 91 },           // [2, 1]
    photo: { model: "models/schmung/sg_photb.mdl", r: 42, wall: 2, deep: 4, lift: 64, high: 95 },                    // [2, 1]
    box: { model: "models/hammertime/cg_box01.mdl", r: 22, wall: 22, high: 40, solid: true },                                     // [2, 1]
    box2: { model: "models/hammertime/cg_box02.mdl", r: 22, wall: 22, high: 40, solid: true },                                    // [1, 1]
    boxStack: { model: "models/hammertime/cg_box03.mdl", r: 47, wall: 23, deep: 23, high: 80, solid: true },                      // [5, 1]
    dumpster: { model: "models/xen/xen_trashcanb.mdl", r: 52, wall: 16, deep: 25, high: 55, solid: true },                        // [4, 1]
    trash: { model: "models/rdm_unmulch1.mdl", r: 40, wall: 28, high: 15 },                                          // [2, 2]
    bench: { model: "models/schmung/bench3.mdl", r: 55, wall: 21, deep: 17, turn: 90, high: 55, solid: true },                    // [3, 1]
    streetlamp: { model: "models/schmung/sg_streetlamp.mdl", r: 10, wall: 10, deep: 62, high: 235 },                  // [8, 1]: its arm overhead
  },
  // each [what, the things or the kit's pieces it is one of, where, how many to a 256 x 256 of floor (the first at
  // least one), options], as src/spec/dress.mjs's uses are written: along the walls and piled into the corners, and
  // in the middle desks and tables in rows, couches facing over a table, crates in piles; as cluttered at the edges
  // as the game's compact maps (ts_trident: 47 props and 34 breakables over 4.4 million square units, about 1.2 a
  // 256 x 256 of floor)
  uses: {
    office: [["desk", ["workstation", "workstation2"], "wall", 0.6], ["desks", ["workstation", "workstation2"], "rows", 1, { aisle: 72, gap: 16 }], ["chair", ["officeChair"], "wall", 0.4], ["plant", ["plant", "plant2"], "corner", 0.6], ["picture", ["painting1", "painting3"], "wall", 0.4], ["cabinet", ["cabinet"], "corner", 0.3]],
    lobby: [["couch", ["couch", "sofa"], "wall", 0.7], ["lounge", ["couch", "sofa"], "group", 0.4, { between: "coffeeTable" }], ["plant", ["plant", "plant8", "tallPlant"], "corner", 1], ["armchair", ["armchair"], "wall", 0.5], ["picture", ["painting2", "painting4", "photo"], "wall", 0.5]],
    cafe: [["booth", ["booth"], "wall", 0.8], ["tables", ["table"], "rows", 0.6, { aisle: 64, gap: 56 }], ["chair", ["chair"], "wall", 0.5], ["plant", ["plant2"], "corner", 0.4]],
    warehouse: [["boxes", ["boxStack", "box", "box2", "crate_stack", "crate_large", "crate40", "crate48"], "corner", 2], ["shelf", ["shelf"], "wall", 0.6], ["pile", ["crate40", "crate48", "crate_large", "box"], "cluster", 0.4, { count: 3 }], ["barrel", ["barrels", "barrel"], "corner", 0.6]],
    garage: [["dumpster", ["dumpster"], "wall", 0.3], ["boxes", ["boxStack", "box", "crate40"], "corner", 0.8], ["barrel", ["barrels"], "corner", 0.4], ["trash", ["trash"], "corner", 0.3]],
    server: [["console", ["console_wide", "console"], "wall", 0.8], ["racks", ["cabinet", "locker"], "rows", 0.6, { aisle: 64, gap: 0 }], ["cabinet", ["cabinet", "locker"], "corner", 0.4], ["chair", ["officeChair"], "wall", 0.2]],
    stairwell: [["plant", ["plant", "plant8"], "corner", 0.3]],
    alley: [["dumpster", ["dumpster"], "wall", 0.4], ["trash", ["trash"], "corner", 0.6], ["lamp", ["streetlamp"], "wall", 0.3], ["boxes", ["box", "box2", "crate40"], "corner", 0.7]],
    plaza: [["bench", ["bench"], "wall", 0.4], ["lamp", ["streetlamp"], "wall", 0.3], ["plant", ["tallPlant"], "corner", 0.4], ["statue", ["statue"], "middle", 0.3]],
    rooftop: [["machine", ["machine", "tank"], "wall", 0.3], ["pipes", ["pipes_up"], "wall", 0.2], ["barrel", ["barrels"], "corner", 0.3], ["boxes", ["box", "crate40"], "corner", 0.3]],
  },
};

/**
 * The profile, from the installed game:
 *   game      the Half-Life folder (the one that holds ts/ and valve/)
 *   folders   the game's folders themselves, the mod's first: `[<Half-Life>/ts, <Half-Life>/valve]`
 *   kind      "arena" (the game's own maps, the default), "compact" (its eight compact arenas) or
 *             "roleplay" (the cities): what a map's character is held against
 *   cache     a file to keep what the maps teach in (unless told: one in the system's temp folder)
 */
export default function specialists({ game, folders, kind = "arena", cache } = {}) {
  const home = folders?.length ? folders : game ? [join(game, MOD_FOLDER), join(game, "valve")] : null;
  if (!home || !existsSync(home[0]))
    throw new Error(
      `The Specialists' profile is made from the installed game: give { game: <the Half-Life folder> } or { folders: [<Half-Life>/ts, <Half-Life>/valve] }${home ? ` (${home[0]} is not there)` : ""}`,
    );
  if (!["arena", "roleplay", "compact"].includes(kind))
    throw new Error(`The Specialists' profile: kind is "arena", "compact" or "roleplay", not ${JSON.stringify(kind)}`);
  const mod = home[0];
  const against = kind === "roleplay" ? CITIES : kind === "compact" ? COMPACT : ARENAS;
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

    // what a map spec of the game is built with where it says nothing (SPEC, above)
    spec: SPEC,

    // the figure judges' (FIGURE_STYLE, above)
    figureStyle: FIGURE_STYLE,

    // team play (TEAMS) and the game's own dressing (DRESSING), above
    teams: TEAMS,
    dressing: DRESSING,
  };
}
