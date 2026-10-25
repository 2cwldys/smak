// A compiled port held to what it was made from: what portToSource said the model has (`facts`) against what
// the compiled .mdl holds (readSourceMdl). The compiler may drop or rename without failing, and a port that lost a
// bone, an animation or a bodygroup on the way would still load: this is what tells.
//
//   comparePort(facts, compiled, triangles)   -> { passed, faults: [sentence], said: [sentence] }
//
// With `triangles` (sourceTriangles of the compiled files), every corner of the original is looked for among
// the compiled corners: one within NEAR units of where the original had it, with the same place in its picture.
// That holds what no table shows: a model turned, moved, or with its pictures laid on it another way.

/**
 * How near a compiled corner is to be to the original's, in units, and in its picture (u and v, 0 to 1). Source's
 * compiler turns each bone through a quaternion, and a bone a quarter turn about y (garg.mdl's toes, 1.570024)
 * comes out 0.01 off on a model 230 tall; a model turned or moved is off by far more.
 */
const NEAR = 0.05;
const NEAR_UV = 0.001;

/** The corners of `original` ([{ p, uv }]) that no corner of `compiled` stands on: their count and the first. */
function cornersOff(original, compiled) {
  const cell = (p) => p.map((v) => Math.floor(v / (NEAR * 10)));
  const grid = new Map();
  for (const c of compiled) {
    const key = cell(c.p).join();
    (grid.get(key) ?? grid.set(key, []).get(key)).push(c);
  }
  let off = 0;
  let first = null;
  for (const c of original) {
    const [x, y, z] = cell(c.p);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++)
      for (let dy = -1; dy <= 1 && !found; dy++)
        for (let dz = -1; dz <= 1 && !found; dz++)
          found = (grid.get([x + dx, y + dy, z + dz].join()) ?? []).some(
            (d) =>
              Math.hypot(d.p[0] - c.p[0], d.p[1] - c.p[1], d.p[2] - c.p[2]) <= NEAR &&
              Math.abs(d.uv[0] - c.uv[0]) <= NEAR_UV &&
              Math.abs(d.uv[1] - c.uv[1]) <= NEAR_UV,
          );
    if (!found) {
      off++;
      first ??= c;
    }
  }
  return { off, first };
}

/** The names of `want` missing from `have`, case aside (Source's names are not kept in their case everywhere). */
const missing = (want, have) => {
  const there = new Set(have.map((name) => name.toLowerCase()));
  return want.filter((name) => !there.has(name.toLowerCase()));
};
const listed = (names, most = 6) => (names.length > most ? `${names.slice(0, most).join(", ")} and ${names.length - most} more` : names.join(", ")); // prettier-ignore

/**
 * What the compiled model lost: bones, animations, materials, bodygroups and their submodels, skin families,
 * attachments, hit boxes, and (with `triangles`) corners. `faults`: one sentence each thing lost; `said`: what it
 * holds, in one line each.
 */
export function comparePort(facts, compiled, triangles) {
  const faults = [];
  if (triangles && facts.corners) {
    const { off, first } = cornersOff(facts.corners, triangles.flatMap((t) => t.corners));
    if (off)
      faults.push(`${off} of ${facts.corners.length} corners not where the original had them, or not on the same place of their picture (the first at ${first.p.map((v) => v.toFixed(2)).join(" ")}, u v ${first.uv.map((v) => v.toFixed(3)).join(" ")})`); // prettier-ignore
  }
  const lost = (what, names) => names.length && faults.push(`${names.length === 1 ? `a ${what}` : `${names.length} ${what}s`} lost: ${listed(names)}`); // prettier-ignore
  lost("bone", missing(facts.bones, compiled.bones.map((b) => b.name)));
  // two bones of one name in any case are one to Source: the names are all there, the bones are not
  if (compiled.bones.length < facts.bones.length && !missing(facts.bones, compiled.bones.map((b) => b.name)).length)
    faults.push(`${compiled.bones.length} bones, where it had ${facts.bones.length}: two of a name (in any case) made one`);
  lost("animation", missing(facts.sequences, compiled.sequences.map((s) => s.name)));
  lost("material", missing(facts.materials, compiled.materials.map((m) => m.replace(/^.*[\\/]/, ""))));
  for (const group of facts.bodygroups) {
    const found = compiled.bodyparts.find((part) => part.name.toLowerCase() === group.name.toLowerCase());
    if (!found) faults.push(`the bodygroup ${group.name} lost`);
    else if (found.models.length !== group.models)
      faults.push(`the bodygroup ${group.name} has ${found.models.length} submodels, where it had ${group.models}`);
  }
  if (compiled.skins.length !== facts.skins)
    faults.push(`${compiled.skins.length} skin families, where it had ${facts.skins}`);
  lost("attachment", missing(facts.attachments, compiled.attachments.map((a) => a.name)));
  // a model with no hit boxes (one the kit built) is given its own by Source's compiler, a box a bone with
  // vertices: more is no loss. With $hbox lines it makes those and no others
  if (compiled.hitboxes.length < facts.hitboxes)
    faults.push(`${compiled.hitboxes.length} hit boxes, where it had ${facts.hitboxes}`);
  const vertices = compiled.bodyparts.reduce((sum, part) => sum + part.models.reduce((s, m) => s + m.vertices, 0), 0);
  const said = [
    `Source model ${compiled.version}: ${compiled.bones.length} bones, ${compiled.sequences.length} animations, ${compiled.materials.length} materials, ${compiled.skins.length} skin families`,
    `bodygroups: ${compiled.bodyparts.map((part) => `${part.name} (${part.models.length})`).join(", ")}; ${vertices} vertices`,
    `attachments ${compiled.attachments.length}, hit boxes ${compiled.hitboxes.length}; materials looked for in ${compiled.cdmaterials.join(", ")}`,
  ];
  return { passed: !faults.length, faults, said };
}
