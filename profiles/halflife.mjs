// HALF-LIFE ITSELF AS A PROFILE: the game folder `valve`, and its High Definition pack (`valve_hd`).
//
// For maps, Half-Life needs no profile of its own: the kit's own (`--mod goldsrc`, maps.GOLDSRC) is
// Half-Life's, and this one is that with the game's folders. It is here for the figure judges (src/figures/):
// what Half-Life's figures are as a manner, and its HD pack's, the same characters remade in another.
//
//   import halfLife from "./smak/profiles/halflife.mjs";
//   const mod = halfLife({ game: "C:/games/Half-Life" });                  // kind "hd": the HD pack's figures
//
//   smak figure-survey <Half-Life> --mod halflife                          the game's figures into the library
//   smak figure-survey <Half-Life> --mod halflife --kind hd                the HD pack's
//   smak figure-judge robot.mdl --mod halflife [--kind hd]
//
// Like the other profiles, it holds no game content: the figures are measured from the installed game.
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The figure judges' part of the profile (`smak figure-survey`, `figure-judge`, `figure-texture`, `figure-shape`
 * with `--mod halflife`): Half-Life's own figures as a manner. The corpus itself is never here: it is measured
 * on the person's machine from the installed game, into a library of theirs. What is here is how far
 * Half-Life's figures stand from each other game's on each measure (the distance of the medians over the middle
 * half, averaged over the other corpora): the weights each judge goes by, the measures that tell this manner
 * most weighing most.
 */

// prettier-ignore
export const FIGURE_STYLE = {
  name: "valve",
  title: "Half-Life's figures",
  corpus: { name: "valve", folders: ["valve"] },
  judges: ["style", "texture", "shape"],
  // scored: shape, texture and colour; proportions and the parts' figures told, not scored (they tell
  // characters apart, not manners)
  groups: ["shape", "texture", "colour"],
  least: 0.25,
  from: "297 figures of valve, valve_hd, cstrike, cstrike_hd, ts, msc and msr, measured 2026-10-19 (the figures research)",
  weights: {
    style: {
      tris: 1.62, edge: 0.88, edgeSpread: 0.63, pieces: 0.97, rigid: 1.01, open: 0.68, hard: 1.04, boxy: 0.45,
      sym: 0.83, heads: 0.2, shoulders: 0.23, bulk: 0.75, armLen: 1.21, legLen: 0.95, hand: 0.56, texels: 1.57,
      texelSpread: 0.46, textures: 1.11, texSize: 0.9, used: 0.97, reuse: 0.56, mirrored: 0.68, stretch: 0.68,
      chrome: 0.1, colours: 0.53, value: 0.51, contrast: 0.78, sat: 0.47, accent: 0.43, dark: 0.75, hues: 0,
      grain: 1.29, detail: 0.91, flat: 0.37, d_head: 0.37, t_head: 0.38, v_head: 0.71, d_torso: 0.26,
      t_torso: 0.73, v_torso: 0.61, d_arm: 0.3, t_arm: 0.67, v_arm: 0.21, d_hand: 0.26, t_hand: 0.51,
      v_hand: 0.37, d_leg: 0.57, t_leg: 0.49, v_leg: 0.21, d_foot: 0.23, t_foot: 0.43, v_foot: 0.35,
    },
    texture: {
      repeat: 1.53, repeatAny: 1.39, marks: 1.14, lightMarks: 0.95, flat: 0.57, ramp: 0.72, speckle: 0.31,
      grain: 1.29, cluster: 1.29, quiet: 1.29, diagonal: 0.56, chartRect: 0.56, charts: 2.08, chartDiag: 0.56,
      value: 0.51, contrast: 0.79, dark: 0.76, colours: 0.53, sat: 0.47, aoFollow: 0.43, aoFollowAll: 0.43,
    },
    shape: {
      holes: 0.3, fineHoles: 0.28, holeCount: 0.53, concave: 0.65, rough: 0.5, notchS: 0.33, notchM: 0.53,
      notchL: 0.49, edges: 0.77, cells: 0.68, cellGini: 0.32, asym: 1.43, pieceGini: 0.82, sizeRange: 0.51,
      small: 0.39, layers: 1.72, deep: 1.59, mirror: 1.77, alike: 0.23, boxes: 0.48,
    },
  },
  // how well each judge told this corpus' own figures from the others' (AUC: 1 perfect, 0.5 a coin)
  validated: {"style":"0.82 to 0.96","texture":"0.85 to 0.99","shape":"0.75 to 0.91"},
  notes: [
    "what tells it most: triangles, texel density, grain, arm length, textures used, hard edges, rigid pieces; texture: charts, repetition, detail spread; shape: mirror, layers",
    "against its own HD pack it is told fairly (style 0.85; texture 0.85 one way, 0.64 the other; shape poorly): a judge of manners between games, weak between a game and its remake",
  ],
};

/** The same for Half-Life's High Definition pack (`--kind hd`): seven figures, so a coarse judge. */

// prettier-ignore
export const FIGURE_STYLE_HD = {
  name: "valve_hd",
  title: "Half-Life's High Definition pack",
  corpus: { name: "valve_hd", folders: ["valve_hd"] },
  judges: ["style", "texture", "shape"],
  // scored: shape, texture and colour; proportions and the parts' figures told, not scored (they tell
  // characters apart, not manners)
  groups: ["shape", "texture", "colour"],
  least: 0.25,
  from: "297 figures of valve, valve_hd, cstrike, cstrike_hd, ts, msc and msr, measured 2026-10-19 (the figures research)",
  weights: {
    style: {
      tris: 1.42, edge: 0.55, edgeSpread: 0.64, pieces: 1.19, rigid: 0.78, open: 0.6, hard: 1.49, boxy: 0.26,
      sym: 0.52, heads: 0.17, shoulders: 0.13, bulk: 0.82, armLen: 0.17, legLen: 1.4, hand: 0.85, texels: 0.76,
      texelSpread: 0.45, textures: 0.79, texSize: 1.46, used: 1.35, reuse: 0.57, mirrored: 0.84, stretch: 0.77,
      chrome: 0.01, colours: 1.16, value: 0.45, contrast: 0.9, sat: 0.52, accent: 0.36, dark: 0.75, hues: 0,
      grain: 0.58, detail: 0.66, flat: 0.56, d_head: 0.27, t_head: 0.3, v_head: 0.24, d_torso: 0.59,
      t_torso: 1.03, v_torso: 0.5, d_arm: 0.15, t_arm: 0.38, v_arm: 0.15, d_hand: 0.57, t_hand: 0.39,
      v_hand: 0.25, d_leg: 0.48, t_leg: 0.6, v_leg: 0.29, d_foot: 0.34, t_foot: 1.11, v_foot: 0.32,
    },
    texture: {
      repeat: 0.81, repeatAny: 0.77, marks: 0.65, lightMarks: 0.63, flat: 0.59, ramp: 1.19, speckle: 0.4,
      grain: 0.57, cluster: 0.64, quiet: 0.58, diagonal: 0.49, chartRect: 1.62, charts: 1.18, chartDiag: 1.31,
      value: 0.45, contrast: 0.91, dark: 0.74, colours: 1.16, sat: 0.52, aoFollow: 0.66, aoFollowAll: 0.37,
    },
    shape: {
      holes: 0.43, fineHoles: 0.52, holeCount: 1.21, concave: 0.44, rough: 0.27, notchS: 0.55, notchM: 0.63,
      notchL: 0.28, edges: 0.53, cells: 0.76, cellGini: 0.51, asym: 0.92, pieceGini: 0.91, sizeRange: 0.64,
      small: 1.06, layers: 0.88, deep: 0.78, mirror: 1.64, alike: 0.29, boxes: 0.87,
    },
  },
  // how well each judge told this corpus' own figures from the others' (AUC: 1 perfect, 0.5 a coin)
  validated: {"style":"0.86 to 1.00","texture":"0.48 to 0.91","shape":"0.56 to 0.90"},
  notes: [
    "a small corpus (7 figures): its scores are coarse, and a small corpus is a wide net (texture and shape draw many foreign figures)",
    "what tells it most: hard edges, texture size, triangles, texels used, colours; texture: rectangular charts, slanted outlines, ramps; shape: mirror, holes",
  ],
};

/**
 * Half-Life's profile:
 *   game      the Half-Life folder (the one that holds valve/ and valve_hd/)
 *   folders   the game's folders themselves: `[<Half-Life>/valve]` (or `[<Half-Life>/valve_hd, <Half-Life>/valve]`)
 *   kind      "sd" (the game as it shipped, the default) or "hd" (its High Definition pack): whose figures the
 *             figure judges hold a model against
 * Neither is needed for the figure judges (the library holds the figures); a map's checks want the folders.
 */
export default function halfLife({ game, folders, kind = "sd" } = {}) {
  if (!["sd", "hd"].includes(kind))
    throw new Error(`Half-Life's profile: kind is "sd" or "hd", not ${JSON.stringify(kind)}`);
  const hd = kind === "hd";
  const home = folders?.length
    ? folders
    : game
      ? [join(game, hd ? "valve_hd" : "valve"), join(game, "valve")]
      : [];
  return {
    name: "halflife",
    title: hd ? "Half-Life, its High Definition pack" : "Half-Life",
    folders: [...new Set(home)].filter((folder) => existsSync(folder)),
    figureStyle: hd ? FIGURE_STYLE_HD : FIGURE_STYLE,
  };
}
