// The figure judges: does a figure (a humanoid model) belong to a game's manner, and where not? Three judges,
// each of measures that work for any GoldSrc game, held against a corpus of the game's own figures that is
// built on the person's machine from the installed game (library.mjs) and never shipped; what each game's
// manner is (its weights, the groups scored, which judges apply) is its profile's `figureStyle` (profile.mjs).
//
//   style     52 measures of the model: shape, proportions, texture as laid, colour, per part (style.mjs,
//             judge-style.mjs); a score 0 to 100, findings with the part or texture at fault and what to do
//   texture   the texture as painting: repetition, flat fills, ramps, speckle, slant, charts, occlusion,
//             value and colours (texture.mjs, texture-model.mjs, judge-texture.mjs); against a corpus and a
//             reference (a picture of an atlas at its pixels a texel, or a set of models)
//   shape     silhouettes and mesh: holes, notches, inner edges, symmetry, pieces, layers, mirror, likeness,
//             boxes (shape.mjs, silhouettes.mjs, judge-shape.mjs); against a corpus and a reference's masks,
//             a model drawn in the reference's own pose when one is given
//
// Exported from the kit as `figures` (import { figures } from "smak").
export * from "./facts.mjs";
export * from "./style.mjs";
export * from "./stats.mjs";
export * from "./judge-style.mjs";
export * from "./pictures.mjs";
export * from "./texture.mjs";
export * from "./texture-model.mjs";
export * from "./judge-texture.mjs";
export * from "./shape.mjs";
export * from "./silhouettes.mjs";
export * from "./judge-shape.mjs";
export * from "./compare.mjs";
export * from "./library.mjs";
export * from "./profile.mjs";
