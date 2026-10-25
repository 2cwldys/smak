// Half-Life 2's own models, as GMod has them in its packs, measured for what a model made for Source is held to:
// the triangles of their first body, and the largest side of their textures, by the length of their box's
// diagonal (units), as src/spec/model.mjs's PROP_TRIANGLES and CHARACTER_TRIANGLES are for Half-Life.
//
//   node scripts/source-budgets.mjs [<GarrysMod folder>]
//
// It prints numbers only; nothing of the game's is written. Props: models/props_*, without gibs, chunks and
// debris. Characters: Half-Life 2's people and creatures.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { findGmod } from "../src/source/compile.mjs";
import { openVpk } from "../src/source/vpk.mjs";
import { sourceFiles, readSourceModel, sourceTris } from "../src/source/draw.mjs";

const gmod = process.argv[2] ?? findGmod();
if (!gmod) throw new Error("no Garry's Mod found: name its folder");
const packsIn = (folder) => readdirSync(folder).filter((name) => /_dir\.vpk$/i.test(name)).map((name) => join(folder, name));
const vpks = [...packsIn(join(gmod, "sourceengine")), ...packsIn(join(gmod, "garrysmod"))];
const files = sourceFiles({ vpks });
const all = [...new Set(vpks.flatMap((path) => openVpk(path).files))].filter((path) => path.endsWith(".mdl"));

const PROP = /^models\/props_[^/]+\/.+\.mdl$/;
const NOT_PROP = /gib|chunk|debris|shard|break|_p\d|piece|frag/i;
const CHARACTER = /^models\/(humans\/group0[1-3]\/[^/]+|alyx|barney|breen|eli|kleiner|monk|mossman|odessa|gman|police|combine_soldier|combine_super_soldier|combine_soldier_prisonguard|zombie\/(classic|fast|poison)|antlion|antlion_guard|headcrabclassic|headcrab|vortigaunt|stalker|manhack|scanner|hunter|crow|pigeon|seagull)\.mdl$/; // prettier-ignore

function measure(path) {
  const model = readSourceModel(path, files);
  const tris = sourceTris(model);
  if (!tris.length) return null;
  const points = tris.flatMap((t) => t.c.map((c) => c.p));
  const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
  const sides = tris.map((t) => (t.tex ? Math.max(t.tex.width, t.tex.height) : 0));
  return { path, triangles: tris.length, diagonal: Math.hypot(...hi.map((v, k) => v - lo[k])), texture: Math.max(...sides) };
}

const quartile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
function table(label, models, bands) {
  console.log(`\n${label}: ${models.length} models`);
  let from = 0;
  for (const under of bands) {
    const band = models.filter((m) => m.diagonal >= from && m.diagonal < under);
    from = under;
    if (!band.length) continue;
    const t = band.map((m) => m.triangles).sort((a, b) => a - b);
    const x = band.map((m) => m.texture).filter(Boolean).sort((a, b) => a - b);
    console.log(`  under ${under}: ${band.length} models; triangles median ${quartile(t, 0.5)}, q3 ${quartile(t, 0.75)}, most ${t.at(-1)}; texture side median ${quartile(x, 0.5)}, q3 ${quartile(x, 0.75)}, most ${x.at(-1)}`); // prettier-ignore
  }
}

const read = (paths) =>
  paths.flatMap((path) => {
    try {
      return [measure(path)].filter(Boolean);
    } catch {
      return [];
    }
  });
table("props", read(all.filter((p) => PROP.test(p) && !NOT_PROP.test(p))), [16, 32, 64, 128, Infinity]);
table("characters", read(all.filter((p) => CHARACTER.test(p))), [48, 96, Infinity]);
