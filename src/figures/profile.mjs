// Which game's manner a figure is judged in: a profile's `figureStyle` (profiles/*.mjs export it as
// FIGURE_STYLE). It names the corpus (the game's folder, whose figures the library holds once surveyed), which
// judges apply, the groups the style judge scores, and each judge's weights: how far that game's figures stand
// from the other games' on each measure, so the measures that tell ITS manner weigh most. What the measures
// are and how a judge works is the same for every game (the rest of src/figures/); only this differs.
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JUDGES } from "./library.mjs";

/** The kit's profiles folder. */
const PROFILES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "profiles");

/** The profiles the kit has, by the names a person gives them (and the games' folders): [file, export]. */
export const FIGURE_PROFILES = {
  mastersword: ["mastersword.mjs", "FIGURE_STYLE"],
  msc: ["mastersword.mjs", "FIGURE_STYLE"],
  specialists: ["specialists.mjs", "FIGURE_STYLE"],
  ts: ["specialists.mjs", "FIGURE_STYLE"],
  halflife: ["halflife.mjs", "FIGURE_STYLE"],
  hl: ["halflife.mjs", "FIGURE_STYLE"],
  valve: ["halflife.mjs", "FIGURE_STYLE"],
  valve_hd: ["halflife.mjs", "FIGURE_STYLE_HD"],
};

/**
 * The manner of a game with no profile: no weights of its own (the library's corpora tell what separates them),
 * every judge, the groups the research scored.
 */
export const PLAIN_STYLE = Object.freeze({
  name: null,
  title: "any game (no profile: weighed by the corpora the library holds)",
  corpus: null,
  judges: JUDGES,
  groups: ["shape", "texture", "colour"],
  least: 0.25,
  weights: null,
  notes: [],
});

/** A figure style made whole and checked: every field it leaves out PLAIN_STYLE's. */
export function figureStyleWhole(style, from = "the profile") {
  if (!style || typeof style !== "object")
    throw new Error(`${from} has no figureStyle (profiles/*.mjs export one as FIGURE_STYLE)`);
  const whole = { ...PLAIN_STYLE, ...style };
  if (whole.corpus && typeof whole.corpus.name !== "string")
    throw new Error(`${from}: figureStyle.corpus is { name, folders }`);
  for (const j of whole.judges)
    if (!JUDGES.includes(j))
      throw new Error(`${from}: figureStyle.judges are of ${JUDGES.join(", ")}, not ${j}`);
  if (whole.weights) for (const j of Object.keys(whole.weights)) if (!JUDGES.includes(j)) throw new Error(`${from}: figureStyle.weights are by judge (${JUDGES.join(", ")}), not ${j}`); // prettier-ignore
  return whole;
}

/**
 * The figure style a caller asks for:
 *   undefined          PLAIN_STYLE (no profile)
 *   a profile          its `figureStyle` (a profile as `maps.loadMod` gives it, or one made by a profile's function)
 *   a figure style     itself ({ corpus, weights, ... })
 *   a name             one of the kit's profiles (FIGURE_PROFILES: msc, mastersword, ts, specialists, halflife,
 *                      valve, valve_hd); `kind: "hd"` with halflife is the HD pack's
 *   a file             a profile's .mjs: its FIGURE_STYLE (FIGURE_STYLE_<KIND> with `kind`), else its default's
 *                      `figureStyle` (the default called with `{ kind }` when it is a function)
 * Whole (`figureStyleWhole`). Async: a profile's file is imported.
 */
export async function figureStyleOf(asked, { kind } = {}) {
  if (asked === undefined || asked === null) return PLAIN_STYLE;
  if (typeof asked === "object") return figureStyleWhole(asked.figureStyle ?? (asked.weights !== undefined || asked.corpus ? asked : null), asked.name ?? "the profile"); // prettier-ignore
  if (typeof asked !== "string") throw new Error("a figure style: a profile, its name or its file");
  const named = FIGURE_PROFILES[asked.toLowerCase()];
  if (named) {
    const [file, exported] = named;
    const module = await import(pathToFileURL(join(PROFILES, file)).href);
    const wanted = kind && kind !== "sd" ? `FIGURE_STYLE_${String(kind).toUpperCase()}` : exported;
    if (!module[wanted]) throw new Error(`the profile ${asked} has no figure style of kind ${kind}`);
    return figureStyleWhole(module[wanted], asked);
  }
  if (!/\.m?js$/i.test(asked) || !existsSync(asked))
    throw new Error(
      `no profile ${asked}: one of ${Object.keys(FIGURE_PROFILES).join(", ")}, or a profile's .mjs file`,
    );
  const module = await import(pathToFileURL(resolve(asked)).href);
  const wanted = kind && kind !== "sd" ? `FIGURE_STYLE_${String(kind).toUpperCase()}` : "FIGURE_STYLE";
  if (module[wanted]) return figureStyleWhole(module[wanted], asked);
  let made = module.default;
  if (typeof made === "function") made = await made({ kind });
  return figureStyleWhole(made?.figureStyle, asked);
}

/** One judge's weights in a style: the profile's, or "library" (worked out from the library's corpora). */
export const weightsFor = (style, judge) => style.weights?.[judge] ?? "library";
