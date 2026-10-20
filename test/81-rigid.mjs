// Rigid pieces in bodyparts of their own: a bodypart added after the others keeps every body number the model
// had (`addBodypart`), and pieces each on one bone are laid into as many new bodyparts as the engine's 2048
// points and normals a submodel need (`putRigid`), every one checked, read back and moved by the animations
// without stretching.
//
// The model is made up here: a hinge of two bones (`upper`, and `lower` turning on it through "bend"), a
// bodypart of two bodies and one of three, so that six body numbers say something.
import * as smak from "../src/index.mjs";
import { test, sure, near } from "./helper.mjs";

const plain = (name, grey = 150) =>
  smak.indexed({ width: 16, height: 16, rgb: new Uint8Array(16 * 16 * 3).fill(grey) }, name);
/** a box from `a` to `b`, twelve triangles facing out */
const boxTris = (a, b, bone) => {
  const P = (i, j, k) => [i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]];
  const faces = [
    [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)],
    [P(0, 1, 0), P(0, 0, 0), P(0, 0, 1), P(0, 1, 1)],
    [P(1, 1, 0), P(0, 1, 0), P(0, 1, 1), P(1, 1, 1)],
    [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)],
    [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)],
    [P(0, 1, 0), P(1, 1, 0), P(1, 0, 0), P(0, 0, 0)],
  ];
  const uv = [[0, 1], [1, 1], [1, 0], [0, 0]]; // prettier-ignore
  return faces.flatMap((face) => [[0, 1, 2], [0, 2, 3]].map((t) => t.map((i) => ({ p: face[i], uv: uv[i], bone })))); // prettier-ignore
};
const bones = [
  { name: "upper", parent: -1, pos: [0, 0, 0] },
  { name: "lower", parent: 0, pos: [10, 0, 0] },
];
const bend = Array.from({ length: 9 }, (_, f) => [
  [0, 0, 0, 0, 0, 0],
  [10, 0, 0, 0, 0, (f / 8) * 1.4],
]);
const model = (name, tris, grey) => ({ name, meshes: [{ tris, texture: plain(`${name}.bmp`, grey) }] });
const hinge = smak.buildMdl({
  name: "hinge.mdl",
  bones,
  bodyparts: [
    { name: "body", models: [model("a", boxTris([0, -1, -1], [9, 1, 1], "upper")), model("b", boxTris([0, -2, -2], [9, 2, 2], "upper"), 90)] }, // prettier-ignore
    { name: "end", models: [model("none", []), model("c", boxTris([10, -1, -1], [18, 1, 1], "lower"), 200), model("d", boxTris([10, -1, -1], [20, 1, 1], "lower"), 60)] }, // prettier-ignore
  ],
  sequences: [
    { name: "idle", frames: [bend[0]] },
    { name: "bend", fps: 10, frames: bend },
  ],
});
const shownBy = (mdl) => Array.from({ length: 6 }, (_, body) => smak.bodyOf(mdl, body));

test("addBodypart: a bodypart after the others, every body number showing what it showed", () => {
  const was = shownBy(hinge);
  const one = smak.addBodypart(hinge, "gear");
  const info = smak.readMdl(one);
  sure(info.bodyparts.length === 3 && info.bodyparts[2].name === "gear", "a third bodypart, called gear");
  sure(
    info.bodyparts[2].base === 6,
    `its base is the product of the counts before it: ${info.bodyparts[2].base}`,
  );
  sure(info.bodyparts[2].models.length === 1 && info.bodyparts[2].models[0].name === "gear", "one submodel");
  shownBy(one).forEach((now, body) =>
    sure(
      now.length === 3 && now[0] === was[body][0] && now[1] === was[body][1] && now[2] === 0,
      `body ${body}: ${now} against ${was[body]}`,
    ),
  );
  const report = smak.check(one);
  sure(!report.errors.length, report.errors.join("; "));
  sure(!report.warnings.some((w) => /base/.test(w)), report.warnings.join("; "));
  // two submodels: the second is shown by body numbers from 6 on, and the first six still show the first
  const two = smak.addBodypart(hinge, "choice", ["off", "on"]);
  sure(smak.bodyOf(two, 6)[2] === 1 && smak.bodyOf(two, 6)[0] === 0, `body 6: ${smak.bodyOf(two, 6)}`);
  sure(smak.bodyOf(two, 5)[2] === 0, "body 5 shows the first of the new bodypart");
  sure(!smak.check(two).errors.length, smak.check(two).errors.join("; "));
});

// 640 boxes of 8 points each, on both bones: past one submodel's 2048 points twice over (their normals, six a bone,
// are kept once)
const pieces = Array.from({ length: 640 }, (_, k) => {
  const bone = k % 2 ? "lower" : "upper";
  const x = (k % 2 ? 10 : 0) + (k % 40) * 0.2,
    y = Math.floor(k / 40) * 1.5;
  return { bone, name: `box ${k}`, tris: boxTris([x, y, 2], [x + 0.15, y + 1, 3]) };
});
const tex = plain("rigid.bmp", 120);
let rigid;
test("putRigid: pieces past one submodel's limits laid into three bodyparts, each within 2048", () => {
  const done = smak.putRigid(hinge, { pieces, texture: tex, space: "rest" });
  rigid = done.mdl;
  sure(
    done.bodyparts.length === 3,
    `three bodyparts: ${done.bodyparts.length} (${JSON.stringify(done.report)})`,
  );
  sure(done.bodyparts.join() === "2,3,4", `numbered after the model's own: ${done.bodyparts}`);
  const info = smak.readMdl(rigid);
  sure(info.bodyparts.length === 5, `five bodyparts read back: ${info.bodyparts.length}`);
  let tris = 0;
  for (const bp of info.bodyparts.slice(2)) {
    const m = bp.models[0];
    sure(m.numverts <= 2048 && m.numnorms <= 2048, `${bp.name}: ${m.numverts} points, ${m.numnorms} normals`);
    tris += m.meshes[0].numtris;
  }
  sure(tris === 640 * 12, `every triangle is in: ${tris}`);
  sure(
    info.bodyparts
      .slice(2)
      .map((bp) => bp.name)
      .join() === "rigid,rigid2,rigid3",
    "named rigid, rigid2, rigid3",
  );
  const report = smak.check(rigid);
  sure(!report.errors.length, report.errors.join("; "));
  sure(!report.warnings.some((w) => /base/.test(w)), report.warnings.join("; "));
  shownBy(rigid).forEach((now, body) =>
    sure(
      now.slice(0, 2).join() === smak.bodyOf(hinge, body).join() && now.slice(2).every((k) => k === 0),
      `body ${body}: ${now}`,
    ),
  );
});

test("putRigid: nothing stretches as the hinge bends, and each piece is on its own bone", () => {
  const still = smak.posed(rigid, { seq: 1, frame: 0 }).tris.filter((t) => t.where.bodypart >= 2);
  sure(still.length === 640 * 12, `all the pieces drawn: ${still.length}`);
  const edges = (tris) =>
    tris.map((t) => [0, 1, 2].map((k) => Math.hypot(...t.c[k].p.map((v, i) => v - t.c[(k + 1) % 3].p[i]))));
  const rest = edges(still);
  let worst = 0,
    moved = 0;
  for (let f = 1; f < 9; f++) {
    const now = smak.posed(rigid, { seq: 1, frame: f }).tris.filter((t) => t.where.bodypart >= 2);
    edges(now).forEach((t, i) => t.forEach((l, k) => (worst = Math.max(worst, Math.abs(l - rest[i][k])))));
    moved = Math.max(
      moved,
      ...now.map((t, i) => Math.hypot(...t.c[0].p.map((v, a) => v - still[i].c[0].p[a]))),
    );
  }
  near(worst, 0, 1e-3, "the largest change in an edge's length");
  sure(moved > 5, `the lower bone's pieces turn with it: ${moved.toFixed(2)}`);
});

test("putRigid: points given in a bone's space land where the same given at rest do", () => {
  const onLower = [{ bone: "lower", tris: boxTris([2, -1, -1], [4, 1, 1]) }];
  const atRest = [{ bone: "lower", tris: boxTris([12, -1, -1], [14, 1, 1]) }];
  const a = smak.posed(smak.putRigid(hinge, { pieces: onLower, texture: tex }).mdl, { seq: 1, frame: 8 });
  const b = smak.posed(smak.putRigid(hinge, { pieces: atRest, texture: tex, space: "rest" }).mdl, {
    seq: 1,
    frame: 8,
  });
  const pa = a.tris.filter((t) => t.where.bodypart === 2),
    pb = b.tris.filter((t) => t.where.bodypart === 2);
  sure(pa.length === 12 && pb.length === 12, "one box each");
  let gap = 0;
  pa.forEach((t, i) =>
    t.c.forEach((c, k) => (gap = Math.max(gap, Math.hypot(...c.p.map((v, j) => v - pb[i].c[k].p[j]))))),
  );
  near(gap, 0, 1e-3, "the two boxes apart");
});

test("putRigid refuses a piece past the budget alone, and a bone the model has not", () => {
  let said = "";
  try {
    smak.putRigid(hinge, { pieces: [pieces[0]], texture: tex, budget: 6 });
  } catch (e) {
    said = e.message;
  }
  sure(/past the budget of 6/.test(said), `it said: ${said}`);
  said = "";
  try {
    smak.putRigid(hinge, { pieces: [{ bone: "tail", tris: pieces[0].tris }], texture: tex });
  } catch (e) {
    said = e.message;
  }
  sure(/no bone tail/.test(said), `it said: ${said}`);
});
