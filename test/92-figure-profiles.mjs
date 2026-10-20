// The figure judges' profiles: each game's manner (a profile's `figureStyle`, exported as FIGURE_STYLE) found by
// name, by file and by object; Master Sword's, The Specialists' and Half-Life's (and its HD pack's) weighed apart,
// each by what tells ITS figures from other games'.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { testAsync, sure, tmp } from "./helper.mjs";

const F = smak.figures;

/** What a call refuses with, or "" when it does not. */
function refusal(call) {
  try {
    call();
  } catch (e) {
    return e.message;
  }
  return "";
}

await testAsync(
  "profiles: each game's figure style by name, by file and by object; MSC, TS and Half-Life weighed apart",
  "figure profiles",
  async () => {
    const msc = await F.figureStyleOf("msc");
    const ts = await F.figureStyleOf("specialists");
    const hl = await F.figureStyleOf("halflife");
    const hd = await F.figureStyleOf("halflife", { kind: "hd" });
    sure(msc.corpus.name === "msc" && ts.corpus.name === "ts" && hl.corpus.name === "valve" && hd.corpus.name === "valve_hd", "the corpora"); // prettier-ignore
    for (const s of [msc, ts, hl, hd]) {
      sure(Object.keys(s.weights.style).length === 52 && Object.keys(s.weights.texture).length === 21 && Object.keys(s.weights.shape).length === 20, `${s.name}'s weights`); // prettier-ignore
      sure(
        s.judges.join() === "style,texture,shape" && s.groups.join() === "shape,texture,colour",
        `${s.name}'s judges and groups`,
      );
    }
    // what tells each manner most is its own
    const top = (s, j) => Object.entries(s.weights[j]).sort((a, b) => b[1] - a[1])[0][0];
    sure(top(ts, "style") === "dark" && top(hl, "style") === "tris" && top(msc, "style") === "reuse", `${top(ts, "style")}, ${top(hl, "style")}, ${top(msc, "style")}`); // prettier-ignore
    sure(
      top(ts, "shape") === "mirror" && top(msc, "shape") === "deep" && top(hl, "texture") === "charts",
      "shape and texture",
    );
    // the same by the games' folders, by a profile's file, by what a profile's function makes, and none
    sure((await F.figureStyleOf("ts")).name === "ts", "ts");
    sure((await F.figureStyleOf("valve_hd")).name === "valve_hd", "valve_hd");
    const file = join(tmp, "figure-profile.mjs");
    writeFileSync(
      file,
      `export const FIGURE_STYLE = { name: "mine", corpus: { name: "mine", folders: ["mine"] }, weights: { style: { tris: 1 } } };\n`,
    );
    const mine = await F.figureStyleOf(file);
    sure(
      mine.name === "mine" && mine.judges.length === 3 && F.weightsFor(mine, "texture") === "library",
      "a file's, made whole",
    );
    const made = (await import("../profiles/halflife.mjs")).default({ kind: "hd" });
    sure(
      (await F.figureStyleOf(made)).name === "valve_hd" &&
        (await F.figureStyleOf(undefined)) === F.PLAIN_STYLE,
      "a profile object; none",
    );
    // the map profiles keep their character.figures beside it
    const sp = await import("../profiles/specialists.mjs");
    sure(sp.ARENAS.figures.offGrid && sp.FIGURE_STYLE.name === "ts", "beside character.figures");
    let refused = "";
    try {
      await F.figureStyleOf("quake");
    } catch (e) {
      refused = e.message;
    }
    sure(/no profile quake: one of mastersword, msc/.test(refused), refused);
    sure(
      /judges are of style, texture, shape/.test(refusal(() => F.figureStyleWhole({ judges: ["looks"] }))),
      "a wrong judge refused",
    );
  },
);
