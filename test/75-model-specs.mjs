// Models and maps from specs, and the shape's soundness they are held to: what the tool `build` of the MCP
// server stands on (src/spec, src/sound.mjs). The faults each case builds on purpose are the ones the
// soundness check must name, and the crashes found while the prompts of examples/prompts were built are
// built again here, so that none comes back.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as smak from "../src/index.mjs";
import { buildModelSpec, validateModelSpec } from "../src/spec/model.mjs";
import { materialOf, surfacePicture, MATERIALS, UNWORN } from "../src/spec/paint.mjs";
import { lookOf, lookFaults, ALLOWED } from "../src/spec/look.mjs";
import { changesOf } from "../src/spec/changes.mjs";
import { paintProjections } from "../src/spec/project.mjs";
import { validateWadSpec } from "../src/spec/wad.mjs";
import { sword, taper } from "../kits/swordkit.mjs";
import { definitionsOf } from "../src/maps/fgd.mjs";
import { findCompilers, COMPILERS_VARIABLE } from "../src/maps/compile.mjs";
import { test, testAsync, sure, near, tmp } from "./helper.mjs";

const { workshop: W, buildMdl, indexed, soundness, shapeSoundness, seeThrough } = smak;
const folder = join(tmp, "specs");
mkdirSync(folder, { recursive: true });
const Z = { x: 0, y: 0, w: 64, h: 64 };
const upright = (s, a, b) => [a, b, s];

/** A model of one bone and one mesh from what `build` makes in a workshop shape. */
function modelOf(build) {
  const M = W.shape(64, 64);
  build(M);
  return buildMdl({
    name: "t.mdl",
    bones: [{ name: "root", parent: -1 }],
    bodyparts: [{ name: "body", models: [{ name: "t", meshes: [{ tris: M.tris.map((t) => t.map((c) => ({ ...c, bone: "root" }))), texture: indexed(W.sheet(64, 64).image(), "t.bmp") }] }] }],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0]]] }],
  });
}
const faultsOf = (mdl) => soundness(mdl).faults.join(" | ");

test("soundness: a whole shape passes; a hole, a face turned, an inside-out part and a floating one are named", () => {
  const barrel = modelOf((M) => M.turn([[0, 10], [12, 11], [24, 10]], Z, { sides: 16, caps: [true, true], at: upright }));
  sure(soundness(barrel).faults.length === 0 && seeThrough(barrel).faults.length === 0, `a closed barrel: ${faultsOf(barrel)}`);

  const cup = modelOf((M) => M.turn([[0, 6], [10, 7]], Z, { sides: 16, caps: [true, false], at: upright }));
  sure(/16 open edges/.test(faultsOf(cup)), `an open cup: ${faultsOf(cup)}`);
  sure(seeThrough(cup).share > 0.05, "an open cup is seen through from above");
  const lined = modelOf((M) => M.turn([[10, 7], [0, 6]], Z, { sides: 16, caps: [false, true], lining: { inset: 0.5, zone: Z, cap: true }, at: upright }));
  sure(soundness(lined).faults.length === 0, `a cup with its inside: ${faultsOf(lined)}`);

  const insideOut = modelOf((M) => M.turn([[0, 10], [24, 10]], Z, { sides: 12, caps: [true, true], face: "in", at: upright }));
  sure(/inside out/.test(faultsOf(insideOut)), `inside out: ${faultsOf(insideOut)}`);

  const knob = modelOf((M) => {
    M.turn([[0, 10], [24, 10]], Z, { sides: 12, caps: [true, true], at: upright });
    M.turn([[30, 2], [34, 2]], Z, { sides: 8, caps: [true, true], at: upright });
  });
  sure(/1 pieces float apart from the rest: t.bmp 6 units away/.test(faultsOf(knob)), `floating: ${faultsOf(knob)}`);

  const M = W.shape(64, 64);
  M.turn([[0, 10], [24, 10]], Z, { sides: 12, caps: [true, true], at: upright });
  const t = M.tris[5];
  M.tris[5] = [t[0], t[2], t[1]];
  const flipped = shapeSoundness(M.tris.map((tri) => ({ p: tri.map((c) => c.p), name: "barrel" })), { front: 1 });
  sure(flipped.edges.flipped === 3 && /turned the wrong way/.test(flipped.faults.join()), `one face flipped: ${flipped.faults}`);
});

test("soundness: what touches is no fault: stacked boxes, a band sunk in its barrel, a sheet, a part sunk or cutting through", () => {
  // the crate of example 1: a lid that sits on its body, face on face
  const shape = W.shape(64, 64);
  for (const [z0, z1] of [[0, 10], [10, 13]]) {
    const c = (i) => [(i & 1 ? 6 : -6), (i & 2 ? 6 : -6), i & 4 ? z1 : z0];
    for (const face of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]])
      shape.quad(...face.map((k) => shape.V(c(k), [0, 0])), [0, 0, (z0 + z1) / 2]);
  }
  const stacked = shapeSoundness(shape.tris.map((tri) => ({ p: tri.map((c) => c.p), name: "crate" })));
  sure(stacked.faults.length === 0 && stacked.edges.touching > 0, `stacked boxes: ${stacked.faults}`);

  const banded = modelOf((M) => M.band(M.turn([[0, 10], [24, 10]], Z, { sides: 16, caps: [true, true], at: upright }), 6, Z, { width: 1, height: 0.3 }));
  const band = soundness(banded);
  sure(band.faults.length === 0 && band.edges.buried === 32, `a band once round, its seam closed and its feet buried: ${band.faults} ${JSON.stringify(band.edges)}`);

  const leaf = soundness(modelOf((M) => M.leaf([[[0, 0, 0], [0, 4, 0], [0, 8, 0]], [[0, 0, 6], [0, 4, 6], [0, 8, 6]]], Z)));
  sure(leaf.faults.length === 0 && /thin sheets/.test(leaf.notes.join()), `a leaf: ${leaf.faults}`);

  // a stock that stops 0.4 short of its receiver, both on a grip that touches each: no part floats, and the
  // open joint is named to be looked at (the pipe shotgun of case 27)
  const boxAt = (name, [x0, y0, z0], [x1, y1, z1]) => {
    const s = W.shape(64, 64);
    const c = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    for (const face of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]])
      s.quad(...face.map((k) => s.V(c(k), [0, 0])), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
    return s.tris.map((tri) => ({ p: tri.map((c) => c.p), name }));
  };
  const joint = shapeSoundness([...boxAt("stock", [0, -1, 0], [8, 1, 2]), ...boxAt("receiver", [8.4, -1, 0], [14, 1, 2]), ...boxAt("grip", [6, -0.5, -4], [10, 0.5, 0.2])]);
  sure(joint.faults.length === 0, `nothing floats: ${joint.faults}`);
  sure(/1 pairs of parts nearly touch and do not: receiver and stock 0\.4 apart/.test(joint.notes.join()), `the open joint is named: ${joint.notes}`);
});

test("the sword kit's pieces are closed: its blade, its bar guard and its turned parts have no open end", () => {
  const piece = sword({
    seed: 3,
    pommel: { profile: [[0, 0.45], [0.8, 0.8], [1.6, 0.5]] },
    grip: { profile: [[1.4, 0.55], [6.5, 0.6]] },
    guard: { x: 6.8, sections: [[-2.6, 0.3, 0.25], [0, 0.45, 0.4], [2.6, 0.3, 0.25]] },
    blade: { x0: 7.2, x1: 34, half: taper(1.1, 0.95), section: "diamond" },
  });
  const sound = shapeSoundness(piece.tris.map((t) => ({ p: t.map((c) => c.p), name: "sword" })));
  sure(sound.edges.open === 0 && sound.faults.length === 0, `the sword: ${sound.faults} ${JSON.stringify(sound.edges)}`);
});

test("a ridge along an oval body, crossing a ring where its end narrows, stays whole (the hover car's stripe)", () => {
  const M = W.shape(256, 256);
  const body = M.turn([[-52, [12, 4.5]], [-50, [17, 6.5]], [-30, [19, 7.5]], [10, [19, 7.5]], [35, [16.5, 6]], [48, [11, 4]], [55, [4, 2]]], Z, { sides: 20, caps: [true, true] });
  const before = M.tris.length;
  M.ridge(body, [[-52 + 0.12 * 107, (9 * Math.PI) / 180], [-52 + 0.82 * 107, (9 * Math.PI) / 180]], Z, { width: 0.8, height: 0.2 });
  const stripe = shapeSoundness(M.tris.slice(before).map((t) => ({ p: t.map((c) => c.p), name: "stripe" })));
  sure(stripe.edges.flipped === 0 && stripe.edges.crowded === 0, `the stripe: ${JSON.stringify(stripe.edges)}`);
});

test("a model spec: its faults in words with their places, and a barrel built, stood on the floor and checked", () => {
  const wrong = validateModelSpec({
    spec: "smak.model/1",
    parts: [
      { id: "lid", kind: "cylindr", radius: 2, height: 1 },
      { id: "pot", kind: "cylinder", radius: 5, height: 8, attach: { to: "base" } },
    ],
  });
  sure(/parts\[0\] \(lid\)\.kind: no kind "cylindr".*Did you mean "cylinder"/.test(wrong.errors.join("\n")), wrong.errors.join("\n"));
  sure(/parts\[1\] \(pot\)\.attach\.to: "base" is no part given before this one/.test(wrong.errors.join("\n")), "a part attached to one not before it");

  // the fork's examples/prompts/01-model-barrel/spec.json
  const spec = {"spec": "smak.model/1", "name": "barrel.mdl", "kind": "prop", "size": {"height": 40}, "materials": {"oak": {"base": "wood"}, "hoop": {"base": "iron", "rust": 0.2}}, "parts": [{"id": "body", "kind": "turn", "material": "oak", "sides": 16, "rings": [[0, 10.5], [5, 11.8], [12, 12.8], [20, 13.2], [28, 12.8], [35, 11.8], [40, 10.5]], "caps": [true, true]}, {"id": "hoop_low", "kind": "band", "material": "hoop", "on": {"part": "body", "s": 0.14}, "width": 2.2, "height": 0.45}, {"id": "hoop_high", "kind": "band", "material": "hoop", "on": {"part": "body", "s": 0.86}, "width": 2.2, "height": 0.45}]};
  const { mdl, report } = buildModelSpec(spec);
  sure(report.ok && mdl, `the barrel: ${[...report.errors, ...report.faults]}`);
  sure(report.parts.body.from[2] === 0 && report.parts.body.to[2] === 40, `stands on the floor, 40 high: ${JSON.stringify(report.parts.body)}`);
  sure(report.edges.buried === 64 && report.edges.open === 0, `its hoops' feet buried: ${JSON.stringify(report.edges)}`);
  // a height off by more than a quarter is a fault
  const short = buildModelSpec({ ...spec, size: { height: 60 } }).report;
  sure(!short.ok && /height 40 where the spec asks 60/.test(short.faults.join()), short.faults.join());
});

test("a model spec: repeat turns the part itself to `start` and copies it round any axis; mirror; a prefab", () => {
  const spec = {
    spec: "smak.model/1",
    kind: "piece",
    parts: [
      { id: "hub", kind: "turn", axis: "y", rings: [[-2, 2], [2, 2]], at: [0, 0, 0] },
      { id: "spoke", kind: "cylinder", radius: 0.4, height: 10, at: [0, 0, 1], repeat: { count: 4, axis: "y", through: [0, 0, 0], start: 45 } },
      { id: "cap", kind: "prefab", spec: { spec: "smak.model/1", parts: [{ id: "knob", kind: "sphere", radius: 1 }] }, at: [0, 2.5, -1], mirror: "y" },
    ],
  };
  const { report } = buildModelSpec(spec);
  sure(report.ok, [...report.errors, ...report.faults].join("; "));
  const { from, to } = report.parts.spoke;
  // four spokes at 45, 135, 225 and 315 about y: as far out each way in x and in z, none along the axes
  near(to[0], -from[0], 0.05, "the spokes' reach either way in x");
  near(to[2], -from[2], 0.05, "the spokes' reach either way in z");
  near(to[0], to[2], 0.05, "turned to 45 degrees");
  sure(report.parts["cap.knob"] && report.parts["cap.knob"].from[1] < -2 && report.parts["cap.knob"].to[1] > 2, "the prefab mirrored to both sides");
});

test("layout regions: each part a picture from each side, laid flat, a mirrored copy on its left's picture", () => {
  // a body and a mirrored boot either side: each face projected flat from the side it faces, the right boot's faces
  // on the left boot's pixels, every texture coordinate on the sheet, the picture carried over
  const spec = { spec: "smak.model/1", kind: "prop", layout: "regions", parts: [{ id: "body", kind: "box", size: [6, 8, 10], material: "steel" }, { id: "boot", kind: "box", size: [3, 2, 2], at: [0, 6, 0], mirror: "y", material: "wood" }] };
  const { mdl, report } = buildModelSpec(spec);
  sure(mdl && !report.errors.length, report.errors.join(" | "));
  const laid = report.facts.find((f) => /^the picture laid by region: \d+ regions in \d+ charts, 12 faces of a right side on their left's picture/.test(f));
  sure(laid, report.facts.filter((f) => /laid/.test(f)).join(" | "));
  const posed = smak.posed(mdl, { seq: null }).tris;
  const at = (side) => posed.filter((t) => t.c.every((c) => (side > 0 ? c.p[1] > 4.5 : c.p[1] < -4.5))).map((t) => t.c.map((c) => `${c.u},${c.v}`).sort().join("|")).sort();
  sure(at(1).length === 12 && JSON.stringify(at(1)) === JSON.stringify(at(-1)), "the two boots wear the same pixels");
  for (const t of posed) for (const c of t.c) sure(c.u >= 0 && c.v >= 0 && c.u <= t.tex.width && c.v <= t.tex.height, `on the sheet: ${c.u},${c.v}`);
  // each face's texture coordinates a flat projection of its corners: along one axis they do not change
  const flat = posed.every((t) => [0, 1, 2].some((axis) => t.c.every((c) => Math.abs(c.p[axis] - t.c[0].p[axis]) < 1e-3)));
  sure(flat, "a box's faces each square to one axis, laid flat");
  sure(validateModelSpec({ ...spec, layout: "atlas" }).errors.some((e) => /layout: "regions"/.test(e)), "another layout refused in words");
  sure(!validateModelSpec({ ...spec, palette: "own" }).warnings.some((w) => /palette: not a field/.test(w)), "palette is a field of a model spec");
});

test("a projected view that names its parts is laid over their outline alone, not the gear beside them", () => {
  // a front picture red on its left half, blue on its right, of the body alone; the gear stands beside the body
  const W = 16;
  const rgb = new Uint8Array(W * W * 3);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) rgb.set(x < W / 2 ? [200, 30, 30] : [30, 30, 200], (y * W + x) * 3);
  const quad = (y0, y1) => {
    const P = (y, z, u, v) => ({ p: [1, y, z], uv: [u, v] });
    return [[P(y0, 0, 0, 1), P(y1, 0, 1, 1), P(y1, 2, 1, 0)], [P(y0, 0, 0, 1), P(y1, 2, 1, 0), P(y0, 2, 0, 0)]];
  };
  const sheet = () => ({ width: 8, height: 8, rgb: new Uint8Array(8 * 8 * 3) });
  const meshes = [{ tris: quad(-1, 1), partOf: ["body", "body"], image: sheet() }, { tris: quad(5, 7), partOf: ["gear", "gear"], image: sheet() }];
  paintProjections(meshes, [{ picture: { width: W, height: W, rgb }, yaw: 0, pitch: 0, rect: [0, 0, W, W], parts: ["body"] }]);
  const body = meshes[0].image.rgb;
  const at = (x) => [body[(4 * 8 + x) * 3], body[(4 * 8 + x) * 3 + 2]];
  // the front view's right is the model's +y: the body's low y takes the picture's left (red), its high y its right
  sure(at(0)[0] > at(0)[1] && at(7)[1] > at(7)[0], `red at one end, blue at the other: ${JSON.stringify([at(0), at(7)])}`);
});

test("a mirrored part that reaches across the middle runs into its copy, and is told (the seal's boots)", () => {
  const built = (width) => buildModelSpec({ spec: "smak.model/1", kind: "piece", parts: [{ id: "boot", kind: "box", size: [6, width, 4], at: [0, 4, 0], mirror: "y" }] }).report;
  const wide = built(24), narrow = built(6);
  sure(wide.warnings.some((w) => /boot: it reaches 8 across the middle \(y 0\), so it and its mirrored copy share 16 units/.test(w)), wide.warnings.join(" | "));
  sure(!narrow.warnings.some((w) => /across the middle/.test(w)), narrow.warnings.join(" | "));
});

test("a spec that takes a game model's place under its name reads the game's as its base, not its own last build", () => {
  const { buildMdl, indexed, workshop: W } = smak;
  const bodyOf = (sides) => {
    const M = W.shape(64, 64);
    M.lathe([[0, 1], [2, 1]], { x: 0, y: 0, w: 64, h: 64 }, { sides, caps: [true, true] });
    return buildMdl({
      name: "crab.mdl",
      bones: [{ name: "root", parent: -1 }, { name: "tip", parent: 0 }],
      bodyparts: [{ name: "body", models: [{ name: "t", meshes: [{ tris: M.tris.map((t) => t.map((c) => ({ ...c, bone: "root" }))), texture: indexed(W.sheet(64, 64).image(), "t.bmp") }] }] }],
      sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 0, 10, 0, 0, 0]]] }],
    });
  };
  const game = join(tmp, "own-base-game");
  const work = join(tmp, "own-base-work");
  mkdirSync(join(game, "models"), { recursive: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(game, "models", "crab.mdl"), bodyOf(6));
  writeFileSync(join(work, "crab.mdl"), bodyOf(20)); // the last build, written under the game's name
  const spec = { spec: "smak.model/1", name: "crab.mdl", kind: "character", base: { file: "crab.mdl" }, contract: { file: "crab.mdl" }, parts: [{ id: "shell", kind: "box", size: [2, 2, 2], bone: "root" }] };
  const own = (n) => smak.readMdl(n).bodyparts[0].models[0].meshes.reduce((sum, m) => sum + m.numtris, 0);
  const { report } = buildModelSpec(spec, { folder: work, games: [game] });
  const said = report.facts.find((f) => /the base's own body is \d+ triangles/.test(f)) ?? report.facts.join(" | ");
  sure(said.includes(`is ${own(bodyOf(6))} triangles`) && own(bodyOf(6)) !== own(bodyOf(20)), `the game's, not the last build's: ${said}`);
  // its triangles against Half-Life's creatures and people of its size: a fact, and over the most a warning
  sure(report.facts.some((f) => /Half-Life's creatures and people of this size \(\d+ units corner to corner\) have 58 triangles at the median/.test(f)), report.facts.join(" | "));
  const heavy = buildModelSpec({ ...spec, parts: Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, kind: "box", size: [0.5, 0.5, 0.5], at: [i % 9, Math.floor(i / 9), 2], bone: "root" })) }, { folder: work, games: [game] }).report;
  sure(heavy.warnings.some((w) => /^5\d\d triangles: Half-Life's creatures and people of this size .* 478 at the most: more than any of them/.test(w)), heavy.warnings.join(" | "));
});

test("a character spec: a place on a part laid along a limb is where the part went (the cowboy's shirt)", () => {
  // a base of two bones, the second 10 up the first: a limb along z from 0 to 10
  const M = W.shape(64, 64);
  M.lathe([[0, 1], [2, 1]], Z, { sides: 6, caps: [true, true], at: upright });
  const base = buildMdl({
    name: "limb.mdl",
    bones: [{ name: "root", parent: -1 }, { name: "tip", parent: 0 }],
    bodyparts: [{ name: "body", models: [{ name: "t", meshes: [{ tris: M.tris.map((t) => t.map((c) => ({ ...c, bone: "root" }))), texture: indexed(W.sheet(64, 64).image(), "t.bmp") }] }] }],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 0, 10, 0, 0, 0]]] }],
  });
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "limb.mdl"), base);
  const { report } = buildModelSpec(
    {
      spec: "smak.model/1",
      name: "sleeve.mdl",
      kind: "character",
      base: { file: "limb.mdl" },
      parts: [
        { id: "sleeve", kind: "turn", rings: [[0, 1], [1, 1]], sides: 8, span: { bones: ["root", "tip"] } },
        { id: "patch", kind: "box", size: [0.5, 0.5, 0.5], attach: { to: "sleeve", toAt: { s: 0.5, angle: 0 }, at: "back" } },
      ],
    },
    { folder },
  );
  const patch = report.parts.patch;
  sure(patch && Math.abs(patch.from[2] - 4.75) <= 0.1 && Math.abs(patch.from[0] - 1) <= 0.1, `the patch halfway up the sleeve, on its front: ${JSON.stringify(patch)}`);
  // a part laid along a limb is made at the limb's length, not stretched to it: a band on it keeps its own
  // width and stays closed, and a point `out` from it goes out along its true normal (the cat's belly and
  // stripes). The sleeve's rings are given from 0 to 1 and the cuff's from 0 to 1, as a spec may.
  const banded = buildModelSpec(
    {
      spec: "smak.model/1",
      name: "banded.mdl",
      kind: "character",
      base: { file: "limb.mjs".replace("mjs", "mdl") },
      parts: [
        { id: "sleeve", kind: "turn", rings: [[0, 2], [0.5, 2.5], [1, 2]], sides: 10, span: { bones: ["root", "tip"], over: 1 } },
        { id: "cuff", kind: "band", on: { part: "sleeve", s: 0.5 }, width: 1, height: 0.2 },
        { id: "pin", kind: "box", size: [0.5, 0.5, 0.5], attach: { to: "sleeve", toAt: { s: 0.5, angle: 0, out: -1 }, at: "centre" } },
      ],
    },
    { folder },
  ).report;
  sure(banded.ok, `a band on a spanned part: ${[...banded.errors, ...banded.faults]}`);
  const cuff = banded.parts.cuff;
  sure(cuff.to[2] - cuff.from[2] < 1.5, `the band 1 wide, not stretched with the sleeve: ${JSON.stringify(cuff)}`);
  const pin = banded.parts.pin;
  sure(pin.from[0] > 1 && pin.to[0] < 2, `the pin 1 in from the sleeve's front (2.5), not off along its length: ${JSON.stringify(pin)}`);
  // a turned part's start on a bone's joint, and the whole stood higher by `floor`
  const capped = buildModelSpec(
    {
      spec: "smak.model/1",
      name: "capped.mdl",
      kind: "character",
      base: { file: "limb.mdl" },
      floor: 10,
      parts: [{ id: "cap", kind: "turn", rings: [[0, 1], [2, 1]], sides: 8, attach: { bone: "tip", at: "start" } }],
    },
    { folder },
  );
  sure(capped.report.ok, `a part's start on a bone: ${[...capped.report.errors, ...capped.report.faults]}`);
  sure(capped.report.facts.some((f) => /floor: the base's feet are at 0; every animation lifted 10/.test(f)), capped.report.facts.join("; "));
  const low = Math.min(...smak.posed(capped.mdl, { seq: 0, frame: 0 }).pose.map((m) => m[2][3]));
  sure(Math.abs(low - 10) < 0.01, `the root at 10 after the lift: ${low}`);
  // a pose: the limb turned a quarter about y in the first animation, and a part on its tip placed where the tip
  // then is (along +x, not up z)
  const turned = buildModelSpec(
    {
      spec: "smak.model/1",
      name: "turned.mdl",
      kind: "character",
      base: { file: "limb.mdl" },
      pose: { keys: { root: { turn: { y: 90 } } } },
      parts: [{ id: "knob", kind: "box", size: [1, 1, 1], attach: { bone: "tip", at: "centre" } }],
    },
    { folder },
  );
  sure(turned.report.ok, [...turned.report.errors, ...turned.report.faults].join("; "));
  const knob = turned.report.parts.knob;
  const mid = knob.from.map((v, k) => (v + knob.to[k]) / 2);
  sure(Math.abs(Math.abs(mid[0]) - 10) < 0.6 && Math.abs(mid[2]) < 0.6, `the tip's knob along x after the turn: ${mid.map((v) => v.toFixed(1))}`);
  // a pose fitted to a picture: a Biped's thigh and calf, built upright, fitted to a side view of it with the
  // thigh swung forward: the fit finds a swing and the outlines come closer
  const leg = buildMdl({
    name: "leg.mdl",
    bones: [{ name: "Bip01", parent: -1 }, { name: "Bip01 L Thigh", parent: 0, pos: [0, 0, 40] }, { name: "Bip01 L Calf", parent: 1, pos: [0, 0, -20] }],
    bodyparts: [{ name: "body", models: [{ name: "b", meshes: [{ tris: [], texture: indexed(W.sheet(16, 16).image(), "b.bmp") }] }] }],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 0, 40, 0, 0, 0], [0, 0, -20, 0, 0, 0]]] }],
  });
  writeFileSync(join(folder, "leg.mdl"), leg);
  const legSpec = (pose) => ({
    spec: "smak.model/1",
    name: "fitted.mdl",
    kind: "character",
    base: { file: "leg.mdl" },
    pose,
    parts: [
      { id: "thigh", kind: "box", size: [4, 4, 20], material: "cloth", span: ["Bip01 L Thigh", "Bip01 L Calf"] },
      { id: "calf", kind: "box", size: [3, 3, 18], material: "cloth", attach: { bone: "Bip01 L Calf", at: "top" } },
      { id: "hips", kind: "box", size: [8, 10, 6], material: "cloth", at: [0, 0, 40] },
    ],
  });
  const swung = buildModelSpec(legSpec({ keys: { "Bip01 L Thigh": { turn: { y: -40 } } } }), { folder });
  sure(swung.report.ok, [...swung.report.errors, ...swung.report.faults].join("; "));
  const side = smak.render(swung.mdl, { seq: 0, frame: 0, view: "side", width: 256, height: 256 });
  writeFileSync(join(folder, "side.png"), smak.png(side.width, side.height, side.rgba));
  const fitted = buildModelSpec({ ...legSpec({ fit: [{ picture: "side.png", view: "left" }] }) }, { folder });
  const said = fitted.report.facts.find((f) => /pose fitted/.test(f)) ?? "";
  const [before, after] = (said.match(/overlap ([\d.]+) as built, ([\d.]+) fitted/) ?? []).slice(1).map(Number);
  sure(fitted.report.ok && after > before + 0.05, `the fitted outline closer: ${said.slice(0, 200)}`);
  // motion: a three-frame run of the same leg, fitted to a strip of the swung leg's run
  const runLeg = buildMdl({
    name: "runleg.mdl",
    bones: [{ name: "Bip01", parent: -1 }, { name: "Bip01 L Thigh", parent: 0, pos: [0, 0, 40] }, { name: "Bip01 L Calf", parent: 1, pos: [0, 0, -20] }],
    bodyparts: [{ name: "body", models: [{ name: "b", meshes: [{ tris: [], texture: indexed(W.sheet(16, 16).image(), "b.bmp") }] }] }],
    sequences: [{ name: "run", fps: 10, frames: [0, 1, 2].map(() => [[0, 0, 0, 0, 0, 0], [0, 0, 40, 0, 0, 0], [0, 0, -20, 0, 0, 0]]) }],
  });
  writeFileSync(join(folder, "runleg.mdl"), runLeg);
  const runSpec = (extra) => ({ ...legSpec(undefined), base: { file: "runleg.mdl" }, ...extra });
  const swungRun = buildModelSpec(runSpec({ pose: { keys: { "Bip01 L Thigh": { turn: { y: -40 } } } } }), { folder });
  const strip = smak.strip(swungRun.mdl, { seq: 0, count: 3, cols: 3, view: "side", ground: true, width: 192, height: 192 });
  writeFileSync(join(folder, "motion.png"), smak.png(strip.width, strip.height, strip.rgba));
  const moved = buildModelSpec(runSpec({ motion: [{ seq: "run", fit: { picture: "motion.png", count: 3, cols: 3 } }] }), { folder });
  const line = moved.report.facts.find((f) => /^motion\[0\]/.test(f)) ?? "";
  const [was, now] = (line.match(/overlap ([\d.]+) as it was, ([\d.]+) fitted/) ?? []).slice(1).map(Number);
  sure(moved.report.ok && now > was + 0.05 && smak.sequences(moved.mdl)[0].frames === 3, `the run fitted to its strip: ${line.slice(0, 200)} ${moved.report.errors}`);
  // pose.from: the first animation made of the base's walk, at the frame whose box fits the size asked (the
  // thigh, a body 2 x 2 x 20 on it, swung 0, 30 and 60 degrees: 60 makes it about 18 long)
  const leg20 = [[-1, -1, -20], [1, -1, -20], [1, 1, -20], [-1, 1, -20], [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const walker = buildMdl({
    name: "walker.mdl",
    bones: [{ name: "Bip01", parent: -1 }, { name: "Bip01 L Thigh", parent: 0, pos: [0, 0, 40] }, { name: "Bip01 L Calf", parent: 1, pos: [0, 0, -20] }],
    bodyparts: [{ name: "body", models: [{ name: "b", meshes: [{ tris: faces.map((f) => f.map((i) => ({ p: leg20[i].map((v, k) => v + (k === 2 ? 40 : 0)), uv: [0.5, 0.5], bone: 1 }))), texture: indexed(W.sheet(16, 16).image(), "b.bmp") }] }] }],
    sequences: [
      { name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 0, 40, 0, 0, 0], [0, 0, -20, 0, 0, 0]]] },
      { name: "walk", fps: 20, frames: [0, 30, 60].map((d) => [[0, 0, 0, 0, 0, 0], [0, 0, 40, 0, (-d * Math.PI) / 180, 0], [0, 0, -20, 0, 0, 0]]) },
    ],
  });
  writeFileSync(join(folder, "walker.mdl"), walker);
  const walked = buildModelSpec({ ...legSpec({ from: "walk" }), base: { file: "walker.mdl" }, size: { length: 18 } }, { folder });
  const took = walked.report.facts.find((f) => /^pose: the first animation is/.test(f)) ?? "";
  const first = smak.sequences(walked.mdl)[0];
  sure(!walked.report.errors.length && /walk from its frame 2/.test(took) && first.frames === 1 && first.fps === 20, `the walk's last frame taken: ${took} ${walked.report.errors} ${JSON.stringify(first)}`);
  const atFrame = buildModelSpec({ ...legSpec({ from: "walk", frame: 1 }), base: { file: "walker.mdl" } }, { folder });
  sure(atFrame.report.facts.some((f) => /walk from its frame 1$/.test(f)), atFrame.report.facts.join("; "));
  const wrong = buildModelSpec({ ...legSpec({ from: "jog" }), base: { file: "walker.mdl" } }, { folder });
  sure(wrong.report.errors.some((e) => /pose\.from: no animation jog in the base: its animations are idle, walk/.test(e)), wrong.report.errors.join("; "));
});

test("a superquadric: a rounded block and an egg at their sizes, a wrong round refused", () => {
  const { mdl, report } = buildModelSpec({ spec: "smak.model/1", name: "sq.mdl", kind: "prop", allow: { floating: ["egg"] }, parts: [
    { id: "boot", kind: "superquadric", size: [12, 5, 4], round: [0.3, 0.5], at: [0, 0, 0] },
    { id: "egg", kind: "superquadric", size: [6, 6, 8], round: [1, 1], at: [0, 12, 0] },
  ] });
  sure(report.ok, [...report.errors, ...report.faults].join("; "));
  const boot = report.parts.boot;
  const extent = boot.to.map((v, k) => v - boot.from[k]);
  sure(Math.abs(extent[0] - 12) < 0.3 && Math.abs(extent[1] - 5) < 0.3 && Math.abs(extent[2] - 4) < 0.05, `the boot ${JSON.stringify(boot)}`);
  sure(smak.check(mdl).errors.length === 0);
  const bad = validateModelSpec({ spec: "smak.model/1", name: "x.mdl", kind: "prop", parts: [{ id: "a", kind: "superquadric", size: [1, 1, 1], round: [0, 3] }] });
  sure(bad.errors.some((e) => /round/.test(e)), bad.errors.join("; "));
});

test("a part's texels: twice as finely painted as its twin, and the zones laid tallest first", () => {
  const { mdl, report } = buildModelSpec({ spec: "smak.model/1", name: "tx.mdl", kind: "prop", parts: [
    { id: "body", kind: "box", size: [4, 4, 4], at: [0, 0, 0] },
    { id: "face", kind: "box", size: [4, 4, 4], at: [0, 0, 4], texels: 2 },
  ] });
  sure(report.ok, [...report.errors, ...report.faults].join("; "));
  // the span of texture each part's triangles cover, in pixels across
  const spans = { low: [], high: [] };
  for (const t of smak.posed(mdl, {}).tris) {
    const z = t.c.reduce((sum, c) => sum + c.p[2], 0) / 3;
    // the faces at z 4 (the body's top, the face's foot) could be either's: left out
    if (Math.abs(z - 4) > 0.01) spans[z < 4 ? "low" : "high"].push(...t.c.map((c) => c.u));
  }
  const width = (us) => Math.max(...us) - Math.min(...us);
  const ratio = width(spans.high) / width(spans.low);
  sure(ratio > 1.7 && ratio < 2.3, `the face's zone ${ratio.toFixed(2)} times as wide`);
});

test("a model spec's leaf drops the points that lie on the line between their neighbours, and keeps a bend", () => {
  const row = (z) => [[0, 0, z], [2, 0.05, z], [4, 0.1, z], [6, 0, z], [8, 3, z], [10, 0, z]];
  const spec = { spec: "smak.model/1", name: "l.mdl", kind: "piece", parts: [{ id: "sheet", kind: "leaf", material: "cloth", rows: [row(0), row(4)] }] };
  const { report } = buildModelSpec(spec);
  // the three nearly straight ones from 0 to 6 go, the peak at 8 stays: 6 columns become 4, 3 quads a side
  sure(report.facts.some((f) => /sheet: 2 of its grid's 6 columns of points left out/.test(f)), report.facts.filter((f) => /sheet/.test(f)).join("; "));
  sure(report.facts.some((f) => /^12 triangles/.test(f)), report.facts.filter((f) => /triangles/.test(f)).join("; "));
});

test("a func_detail written by the kit says its detail level: SDHLT takes one without it as world", () => {
  const piece = smak.maps.brushEntity("func_detail", [smak.maps.box([0, 0, 0], [16, 16, 16], "X")]);
  sure(piece.zhlt_detaillevel === "1", JSON.stringify(Object.keys(piece)));
  sure(smak.maps.brushEntity("func_detail", [smak.maps.box([0, 0, 0], [16, 16, 16], "X")], { zhlt_detaillevel: 2 }).zhlt_detaillevel === "2", "a level given is kept");
  sure(smak.maps.brushEntity("func_wall", [smak.maps.box([0, 0, 0], [16, 16, 16], "X")]).zhlt_detaillevel === undefined, "only a func_detail");
});

test("a material's tone of null is its base's own colour, as left out (the winter tree of case 28)", () => {
  sure(JSON.stringify(materialOf({ base: "grass", tone: null }).tone) === JSON.stringify(materialOf({ base: "grass" }).tone), "null as left out");
});

test("a wall's texture stands on the floor of the room it faces, whatever that floor's height", () => {
  // Steven's play-test of the frenzy reproductions: "texture alignment is off"; a mapper lines a wall up with its floor
  const brushes = smak.maps.carve([{ min: [0, 0, 0], max: [256, 256, 128] }, { min: [272, 24, 40], max: [528, 280, 168] }], 16, { floor: "F", ceiling: "C", wall: "W" });
  // the wall faces that look into a room: a face of a piece of rock whose box ends at the room's side, beside it
  const facing = (room, x, sign) =>
    brushes.flatMap((b) => {
      const c = smak.maps.shapeOf(b).corners;
      const lo = [0, 1, 2].map((k) => Math.min(...c.map((p) => p[k])));
      const hi = [0, 1, 2].map((k) => Math.max(...c.map((p) => p[k])));
      if ((sign > 0 ? hi[0] : lo[0]) !== x || hi[2] <= room.min[2] || lo[2] >= room.max[2]) return [];
      return b.faces.filter((f) => f.texture === "W" && Math.abs(f.v[2] + 1) < 1e-9 && f.points.every((p) => Math.abs(p[0] - x) < 1e-6)).map((f) => f.v[3]);
    });
  // the first room's east wall faces it (floor 0); the second room's west wall faces it (floor 40)
  const first = facing({ min: [0, 0, 0], max: [256, 256, 128] }, 256, -1);
  const second = facing({ min: [272, 24, 40], max: [528, 280, 168] }, 272, 1);
  sure(first.length && first.every((o) => o === 0), `the first room's wall: ${first}`);
  sure(second.length && second.every((o) => o === 40), `the second room's wall: ${second}`);
  // and across, from the room's corner: the second room starts at y 24, the walls facing x run along y
  const across = brushes.flatMap((b) => b.faces.filter((f) => f.texture === "W" && Math.abs(f.u[1] - 1) < 1e-9 && f.points.every((p) => Math.abs(p[0] - 272) < 1e-6)).map((f) => f.u[3]));
  sure(across.includes(-24), `across: ${across}`);
});

test("a flat colour is its tone alone, as the game's own BLACK and YELLOW are, and takes no picture", () => {
  const p = surfacePicture({ base: "flat", tone: [0.8, 0.7, 0.1] }, 16, 16);
  const colours = new Set();
  for (let i = 0; i < p.rgb.length; i += 3) colours.add(`${p.rgb[i]},${p.rgb[i + 1]},${p.rgb[i + 2]}`);
  sure(colours.size === 1 && colours.has("204,179,26"), [...colours].slice(0, 4).join(" "));
  let refused = "";
  try {
    surfacePicture({ base: "flat", picture: "work:x.png" }, 16, 16, { readPicture: () => ({ width: 1, height: 1, rgb: new Uint8Array(3) }) });
  } catch (error) {
    refused = error.message;
  }
  sure(/a flat colour is its tone alone/.test(refused), refused);
});

test("fidelity high: a heavy prop is told its triangles as a fact, not warned, and painted larger; a wrong word refused", () => {
  const spec = (fidelity) => ({ spec: "smak.model/1", name: "post.mdl", kind: "prop", ...(fidelity ? { fidelity } : {}), parts: [{ id: "post", kind: "cylinder", radius: 10, height: 40, sides: 64, material: "wood" }] });
  const game = buildModelSpec(spec(), {});
  sure(game.report.warnings.some((w) => /triangles/.test(w)), game.report.warnings.join("; "));
  const high = buildModelSpec(spec("high"), {});
  sure(!high.report.warnings.some((w) => /triangles/.test(w)) && high.report.facts.some((f) => /fidelity high/.test(f)), [...high.report.warnings, ...high.report.facts].join("; "));
  sure(smak.readMdl(high.mdl).textures[0].width === 512, `texture ${smak.readMdl(high.mdl).textures[0].width}`);
  sure(buildModelSpec(spec("ultra"), {}).report.errors.some((e) => /fidelity: "game" or "high"/.test(e)), "a wrong word");
});

test("a weapon laid \"as drawn\" is fitted without a crash (case 26, the lunchbox mine, never built)", () => {
  // the as-drawn turn handed the box of its points bare points where corners were expected
  const M = W.shape(64, 64);
  M.lathe([[0, 1], [6, 1.5], [8, 1]], Z, { sides: 6, caps: [true, true] });
  const fit = smak.bestTurn(M.tris, M.tris, false, "as drawn");
  sure(fit && fit.name === "as drawn" && Number.isFinite(fit.k), JSON.stringify(fit && { name: fit.name, k: fit.k }));
});

test("a weapon spec: the piece in place of a game's weapon in its v_ and p_ files, the gloved hands kept", () => {
  // a stand-in for a game's files: a first-person model of a glove and a stick, and a world one of the stick
  const meshOn = (build, name) => {
    const M = W.shape(64, 64);
    build(M);
    return { tris: M.tris.map((t) => t.map((c) => ({ ...c, bone: "hand" }))), texture: indexed(W.sheet(64, 64).image(), name) };
  };
  const stick = () => meshOn((M) => M.lathe([[0, 0.5], [12, 0.5]], Z, { sides: 6, caps: [true, true] }), "stick.bmp");
  const glove = meshOn((M) => M.lathe([[-3, 1.5], [0, 1.5]], Z, { sides: 6, caps: [true, true] }), "rubbergloveCHROME.bmp");
  const fileOf = (meshes) =>
    buildMdl({
      name: "x.mdl",
      bones: [{ name: "hand", parent: -1 }, { name: "slide", parent: 0 }],
      bodyparts: [{ name: "studio", models: [{ name: "stick_reference", meshes }] }],
      sequences: [
        { name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]] },
        { name: "attack", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], [[0, 0, 0, 0, 0.5, 0], [-2, 0, 0, 0, 0, 0]]] },
      ],
    });
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "v_stick.mdl"), fileOf([glove, stick()]));
  writeFileSync(join(folder, "p_stick.mdl"), fileOf([stick()]));
  const spec = {
    spec: "smak.model/1",
    name: "rod.mdl",
    kind: "held",
    weapon: { like: "stick", views: ["v", "p"] },
    parts: [
      { id: "rod", kind: "box", material: "steel", size: [10, 1, 1] },
      { id: "knob", kind: "box", material: "steel", size: [1, 1.4, 1.4], at: [5, 0, 0.5], bone: "slide" },
    ],
  };
  const { report, files } = buildModelSpec(spec, { folder });
  sure(report.ok && files.length === 2, `two files: ${[...report.errors, ...report.faults]}`);
  const v = files.find((f) => f.name === "v_stick.mdl");
  const meshes = smak.readMdl(v.mdl).bodyparts[0].models[0].meshes;
  const gloveMesh = meshes.find((m) => /glove/i.test(m.texture.name));
  const rodMesh = meshes.find((m) => m.numtris && !/glove/i.test(m.texture.name));
  sure(gloveMesh?.numtris === glove.tris.length, `the glove is kept as it was: ${gloveMesh?.numtris} of ${glove.tris.length}`);
  sure(rodMesh?.numtris === 24 && rodMesh.texture.name === "rod_v.bmp", `the rod in the stick's place: ${rodMesh?.numtris} triangles on ${rodMesh?.texture.name}`);
  // the knob names the game's bone it moves with: its corners are on it, the rod's on the hand
  const onBone = new Set(smak.posed(v.mdl, {}).tris.filter((t) => t.tex?.name === "rod_v.bmp").flatMap((t) => t.c.map((c) => c.bone)));
  sure(onBone.has(0) && onBone.has(1), `the rod on the hand and the knob on the slide: bones ${[...onBone]}`);
  sure(smak.sequences(v.mdl).length === 2, "the game's animations kept");
  sure(/v_stick\.mdl \(first person\)/.test(report.facts.join("\n")), "the report says what each file became");
  // a part in some files only, and chrome in first person: the knob left out of p_, the v_ picture flagged
  const split = buildModelSpec({ ...spec, weapon: { ...spec.weapon, chrome: ["v"] }, parts: [spec.parts[0], { ...spec.parts[1], views: ["v"] }] }, { folder });
  sure(split.report.ok, [...split.report.errors, ...split.report.faults].join("; "));
  const trisIn = (name) => smak.readMdl(split.files.find((f) => f.name === name).mdl).bodyparts[0].models[0].meshes.filter((m) => /^rod_/.test(m.texture?.name ?? "")).reduce((n, m) => n + m.numtris, 0);
  sure(trisIn("v_stick.mdl") === 24 && trisIn("p_stick.mdl") === 12, `the knob in v_ only: ${trisIn("v_stick.mdl")} and ${trisIn("p_stick.mdl")}`);
  const flagOf = (name) => smak.readMdl(split.files.find((f) => f.name === name).mdl).textures.find((t) => /^rod_/.test(t.name)).flags;
  sure((flagOf("v_stick.mdl") & 2) === 2 && (flagOf("p_stick.mdl") & 2) === 0, `chrome in v_ only: ${flagOf("v_stick.mdl")}, ${flagOf("p_stick.mdl")}`);
  // the turn told, where the outline cannot choose
  const turned = buildModelSpec({ ...spec, weapon: { ...spec.weapon, turn: { v: "z" } } }, { folder }).report;
  sure(/v_stick\.mdl[^\n]*laid turned about z/.test(turned.facts.join("\n")), `the turn told is the turn taken: ${turned.facts.join(" | ")}`);
  // an animation of its own in place of the game's, by name: the same place in the list, made from keys
  const animated = buildModelSpec(
    { ...spec, weapon: { ...spec.weapon, animations: [{ replace: "attack", from: "idle", frames: 5, fps: 10, keys: [{ at: 0 }, { at: 2, turn: { hand: { z: 40 } } }, { at: 4 }] }] } },
    { folder },
  );
  sure(animated.report.ok, [...animated.report.errors, ...animated.report.faults].join("; "));
  const swung = animated.files.find((f) => f.name === "v_stick.mdl").mdl;
  const list = smak.sequences(swung);
  sure(list.map((s) => s.name).join() === "idle,attack" && list[1].frames === 5 && list[1].fps === 10, `attack replaced where it was: ${JSON.stringify(list)}`);
  const middle = smak.readSequence(swung, "attack").frames[2][0];
  sure(Math.abs(Math.abs(middle[5]) - (40 * Math.PI) / 180) < 0.02, `the hand turned 40 degrees in the middle: ${middle}`);
  // a key aimed: where on the first-person screen the weapon's far end is to be, the turns found for it
  const aimed = buildModelSpec(
    { ...spec, weapon: { ...spec.weapon, animations: [{ replace: "attack", from: "idle", frames: 3, keys: [{ at: 0 }, { at: 1, aim: [0, 0.3] }, { at: 2 }], bones: ["hand", "slide"] }] } },
    { folder },
  ).report;
  const said = aimed.facts.find((f) => /attack frame 1 aimed at 0 0.3/.test(f)) ?? "";
  const end = /the far end at (-?[\d.]+) (-?[\d.]+)/.exec(said);
  sure(aimed.ok && end && Math.abs(Number(end[1])) < 0.05 && Math.abs(Number(end[2]) - 0.3) < 0.05, `the rod's end raised to 0.3 of the screen: ${said} ${aimed.errors}`);
  const rig = smak.animate.rigOf(swung);
  const values = smak.readSequence(swung, "attack").frames[2];
  const back = smak.animate.valuesOf(rig, smak.animate.poseOfValues(rig, values));
  sure(back.every((bone, i) => bone.every((v, k) => Math.abs(v - values[i][k]) < 1e-3)), "a frame's numbers made a pose and back are the same");
  const missing = buildModelSpec({ ...spec, weapon: { like: "spear" } }, { folder }).report;
  sure(!missing.ok && /v_spear\.mdl is neither in the game folders given nor beside the spec/.test(missing.errors.join()), missing.errors.join());
});

test("a model spec's smooth: a thin tube of four sides shaded round shares its normals (the skeleton's ribs)", () => {
  const tube = (smooth) => ({ spec: "smak.model/1", name: "rib.mdl", kind: "prop", ...(smooth ? { smooth } : {}), parts: [{ id: "rib", kind: "tube", sides: 4, path: [[0, 0, 1, 0.5], [5, 0, 3, 0.5], [10, 0, 1, 0.5]] }] });
  const normals = (spec) => smak.readMdl(buildModelSpec(spec).mdl).bodyparts[0].models[0].numnorms;
  const flat = normals(tube());
  const round = normals(tube(100));
  sure(round < flat * 0.7, `fewer normals shaded round: ${round} against ${flat}`);
  sure(/smooth: the angle in degrees/.test(validateModelSpec({ ...tube(), smooth: 400 }).errors.join()), "an angle over 180 is refused");
});

test("a model spec's print: words on a box's face, in their ink, over its material, the right way round", () => {
  const spec = { spec: "smak.model/1", name: "sign.mdl", kind: "prop", finish: false, materials: { board: { base: "paint", tone: [0.9, 0.85, 0.6] } }, parts: [{ id: "sign", kind: "box", material: "board", size: [2, 40, 14], print: { text: "OPEN", face: "front", ink: [0.8, 0.05, 0.05] } }] };
  const { mdl, report } = buildModelSpec(spec);
  sure(report.ok, [...report.errors, ...report.faults].join("; "));
  // the front face drawn: red letters on the cream board, and no other colour (a channel written off its
  // pixel turned the board cyan before the sheet kept to whole pixels)
  const front = smak.render(mdl, { seq: 0, yaw: 0, pitch: 0, width: 200, height: 80, light: false });
  let red = 0;
  let cream = 0;
  let other = 0;
  for (let i = 0; i < front.rgba.length; i += 4) {
    const [r, g, b] = front.rgba.subarray(i, i + 3);
    if (r > 150 && g < 60 && b < 60) red++;
    else if (r > 180 && g > 170 && b > 100 && b < 190) cream++;
    else if (!(Math.abs(r - 58) < 6 && Math.abs(g - 62) < 6 && Math.abs(b - 70) < 6)) other++;
  }
  sure(red > 40 && cream > 1000 && other < cream * 0.15, `red letters on cream: ${red} red, ${cream} cream, ${other} other`);
});

test("a model spec's panels: drawers and pulls painted on a box's face, in relief that costs no triangle", () => {
  const box = (panels) => ({ spec: "smak.model/1", name: "cab.mdl", kind: "prop", finish: false, materials: { paint: { base: "paint", tone: [0.6, 0.6, 0.6] } }, parts: [{ id: "body", kind: "box", size: [20, 20, 40], material: "paint", panels }] });
  const plain = buildModelSpec(box([]));
  const drawer = buildModelSpec(box([{ face: "front", at: [10, 30], size: [16, 12], edge: 1 }, { face: "front", at: [10, 32], size: [4, 2], style: "raised", material: { base: "paint", tone: [0.95, 0.1, 0.1] } }]));
  sure(drawer.report.ok && Object.values(drawer.report.parts)[0].tris === 12, `still a box of 12 triangles: ${JSON.stringify(drawer.report.parts)}`);
  // the front: the red pull high up (the panel's y counts up from the face's bottom), nothing red on the back
  const red = (mdl, yaw) => {
    const front = smak.render(mdl, { seq: 0, yaw, pitch: 0, width: 100, height: 200, light: false });
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < front.rgba.length; i += 4)
      if (front.rgba[i] > 180 && front.rgba[i + 1] < 80) (i / 4 / 100 < 100 ? top++ : bottom++);
    return { top, bottom };
  };
  const f = red(drawer.mdl, 0);
  const b = red(drawer.mdl, 180);
  sure(f.top > 20 && f.bottom === 0 && b.top + b.bottom === 0, `the pull on the front's upper half: front ${JSON.stringify(f)}, back ${JSON.stringify(b)}`);
  // the drawer's bevel darkens part of the face against the plain box
  const grey = (mdl) => smak.render(mdl, { seq: 0, yaw: 0, pitch: 0, width: 100, height: 200, light: false }).rgba.reduce((s, v, i) => (i % 4 === 0 && v > 20 && v < 120 ? s + 1 : s), 0);
  sure(grey(drawer.mdl) > grey(plain.mdl) + 50, `a bevel's shadow: ${grey(drawer.mdl)} dark dots against ${grey(plain.mdl)}`);
  const bad = validateModelSpec(box([{ face: "side", at: [1], size: [0, 2] }]));
  sure(bad.errors.length >= 3, bad.errors.join("; "));
});

test("a model spec's project: a person's picture of the front laid onto the faces that look that way, the rest left", () => {
  // a picture of a box's front: grey background, the box's outline red on its left half and blue on its right
  const W = 200;
  const H = 300;
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = x >= 50 && x < 150 && y >= 50 && y < 250;
      rgb.set(!inside ? [58, 62, 70] : x < 100 ? [220, 30, 30] : [30, 30, 220], (y * W + x) * 3);
    }
  const folder = mkdtempSync(join(tmpdir(), "smak-project-"));
  writeFileSync(join(folder, "front.png"), smak.png(W, H, (() => { const rgba = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) rgba.set([...rgb.subarray(i * 3, i * 3 + 3), 255], i * 4); return rgba; })()));
  const spec = { spec: "smak.model/1", name: "p.mdl", kind: "prop", finish: false, parts: [{ id: "b", kind: "box", size: [10, 10, 20], material: { base: "paint", tone: [0.1, 0.8, 0.1] } }], project: [{ picture: "front.png", view: "front" }] };
  const { mdl, report } = buildModelSpec(spec, { folder });
  sure(report.ok && report.facts.some((f) => /projected over \d+ texels.*outline at 50 50 150 250/.test(f)), [...report.errors, ...report.facts.filter((f) => /projected/.test(f))].join("; "));
  // the box's own outline against the picture's: the same shape, so they share nearly every cell
  const fit = report.facts.find((f) => /outline against each picture's/.test(f));
  sure(fit && Number(/front ([\d.]+)/.exec(fit)[1]) > 0.95 && !report.warnings.some((w) => /outline is off/.test(w)), fit);
  // and its painted look against the picture, drawn from the picture's camera: the same colours where they were
  const look = report.facts.find((f) => /its look against each picture's/.test(f));
  sure(look && Number(/front ([\d.]+)/.exec(look)[1]) < 10 && !report.warnings.some((w) => /look parts/.test(w)), look);
  // from the front: red on the viewer's left, blue on the right; from the back: the box's own green
  const shot = (yaw) => smak.render(mdl, { seq: 0, yaw, pitch: 0, width: 100, height: 100, light: false });
  const at = (pic, x, y) => [...pic.rgba.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 3)];
  const front = shot(0);
  const back = shot(180);
  const [l, r, b] = [at(front, 40, 50), at(front, 60, 50), at(back, 50, 50)];
  sure(l[0] > 150 && l[2] < 80 && r[2] > 150 && r[0] < 80 && b[1] > 150 && b[0] < 80, `front left ${l}, front right ${r}, back ${b}`);
});

test("a model spec's project: a patch of the ground's colour inside the outline, and a speck of it on its edge, are the thing's", () => {
  // the box's front grey, a dark patch near the ground's colour in its middle and a speck of it at its foot: the
  // filing cabinet's blotches, which were masked out as ground and left to the material's paint
  const W = 200;
  const H = 300;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = x >= 50 && x < 150 && y >= 50 && y < 250;
      const patch = (x >= 60 && x < 140 && y >= 90 && y < 210) || (x >= 90 && x < 110 && y >= 240 && y < 250);
      rgba.set([...(!inside ? [58, 62, 70] : patch ? [66, 68, 72] : [120, 120, 120]), 255], (y * W + x) * 4);
    }
  const folder = mkdtempSync(join(tmpdir(), "smak-project-"));
  writeFileSync(join(folder, "front.png"), smak.png(W, H, rgba));
  const spec = { spec: "smak.model/1", name: "p.mdl", kind: "prop", finish: false, parts: [{ id: "b", kind: "box", size: [10, 10, 20], material: { base: "paint", tone: [0.1, 0.8, 0.1] } }], project: [{ picture: "front.png", view: "front" }] };
  const { mdl } = buildModelSpec(spec, { folder });
  const front = smak.render(mdl, { seq: 0, yaw: 0, pitch: 0, width: 100, height: 100, light: false });
  const green = [];
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const [r, g, b] = front.rgba.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 3);
      if (g > 150 && r < 80 && b < 80) green.push(`${x},${y}`);
    }
  sure(!green.length, `${green.length} dots of the material's green on the front: ${green.slice(0, 6).join(" ")}`);
});

await testAsync("a sprite file written is the file read: Half-Life's own, where the game is there, byte for byte", "spr: round trip", async () => {
  const { writeSpr } = await import("../src/sprite/spr.mjs");
  // a group and a single frame, written and read back
  const frame = (v) => ({ left: -4, up: 4, width: 8, height: 8, pixels: new Uint8Array(64).fill(v) });
  const bytes = writeSpr({ type: "oriented", format: "alpha test", palette: new Uint8Array(768).fill(7), frames: [frame(1), frame(2), frame(3)], groups: [{ first: 1, count: 2, ends: [0.1, 0.25] }] });
  const back = smak.maps.readSpr(bytes);
  sure(back.type === "oriented" && back.frames.length === 3 && back.groups[0].count === 2 && Math.abs(back.groups[0].ends[1] - 0.25) < 1e-6 && Buffer.compare(writeSpr(back), bytes) === 0, JSON.stringify(back.groups));
  const game = join(process.env.HOME ?? "", ".steam/steam/steamapps/common/Half-Life/valve/sprites");
  if (!existsSync(game)) return;
  const files = readdirSync(game).filter((f) => f.endsWith(".spr"));
  const differ = files.filter((f) => Buffer.compare(writeSpr(smak.maps.readSpr(readFileSync(join(game, f)))), readFileSync(join(game, f))) !== 0);
  sure(!differ.length, `${differ.length} of ${files.length} differ: ${differ.slice(0, 5)}`);
});

test("a model spec's paint: drawers and pulls built, then baked into the box under them: their colours, no triangles", () => {
  const spec = (paint) => ({ spec: "smak.model/1", name: "cab.mdl", kind: "prop", budget: 30, finish: false, parts: [
    { id: "body", kind: "box", size: [20, 20, 40], material: { base: "paint", tone: [0.5, 0.5, 0.5] } },
    { id: "pull", kind: "box", size: [0.8, 6, 2], material: { base: "paint", tone: [0.95, 0.1, 0.1] }, paint, attach: { to: "body", toAt: "front", at: "back", offset: [0, 0, 8] } },
  ] });
  const built = buildModelSpec(spec(false));
  const painted = buildModelSpec(spec(true));
  sure(painted.report.ok && painted.report.facts.some((f) => /painted, not built: pull \(12 triangles left out/.test(f)), [...painted.report.errors, ...painted.report.faults, ...painted.report.facts].join("; "));
  sure(built.report.faults.length === 0 && /24 triangles of a budget of 30/.test(built.report.facts.join(" ")), built.report.facts.join("; "));
  // the red pull on the front of the 12-triangle box
  const front = smak.render(painted.mdl, { seq: 0, yaw: 0, pitch: 0, width: 100, height: 200, light: false });
  let red = 0;
  for (let i = 0; i < front.rgba.length; i += 4) if (front.rgba[i] > 180 && front.rgba[i + 1] < 60) red++;
  sure(red > 15, `the pull painted on the front: ${red} red dots`);
  // over a budget is a fault
  const over = buildModelSpec({ ...spec(false), budget: 20 });
  sure(over.report.faults.some((f) => /^over budget: 24 triangles of a budget of 20/.test(f)), over.report.faults.join("; "));
});

test("a model spec's round parts are shaded round whatever their sides: an 8-sided post has a normal a corner", () => {
  const post = (smooth) => buildModelSpec({ spec: "smak.model/1", name: "post.mdl", kind: "prop", finish: false, parts: [{ id: "post", kind: "cylinder", radius: 4, height: 30, sides: 8, material: "paint", ...(smooth === undefined ? {} : { smooth }) }] });
  const normals = (mdl) => smak.readMdl(mdl).bodyparts[0].models[0].numnorms;
  const round = normals(post().mdl);
  const flat = normals(post(10).mdl);
  // round: one normal at each of its 16 corners and one a cap; flat: one a face (8 round it and the 2 caps)
  sure(round === 18 && flat === 10, `round ${round} normals (18 wanted), flat ${flat} (10)`);
});

test("a blind test's original may be refused: a character may not take its skeleton", () => {
  const folder = mkdtempSync(join(tmpdir(), "smak-refuse-"));
  const { mdl } = buildModelSpec({ spec: "smak.model/1", name: "target.mdl", kind: "prop", parts: [{ id: "a", kind: "box", size: [4, 4, 4] }] });
  writeFileSync(join(folder, "target.mdl"), mdl);
  const spec = { spec: "smak.model/1", name: "copy.mdl", kind: "character", base: { file: "target.mdl" }, parts: [{ id: "b", kind: "box", size: [2, 2, 2], at: [0, 0, 0] }] };
  const refused = buildModelSpec(spec, { folder, refuse: ["models/target.mdl"] });
  sure(refused.report.errors.some((e) => /may not be used here \(a blind test's original\)/.test(e)), refused.report.errors.join("; "));
});

test("a model's contract: a reference's bones, animations and bodyparts kept, or each lack a fault", async () => {
  const { contractOf, compareContract } = await import("../src/contract.mjs");
  const folder = mkdtempSync(join(tmpdir(), "smak-contract-"));
  const part = { id: "a", kind: "box", size: [4, 4, 4] };
  const { mdl } = buildModelSpec({ spec: "smak.model/1", name: "ref.mdl", kind: "prop", parts: [part] });
  writeFileSync(join(folder, "ref.mdl"), mdl);
  const kept = buildModelSpec({ spec: "smak.model/1", name: "copy.mdl", kind: "prop", parts: [part], contract: { file: "ref.mdl" } }, { folder });
  sure(kept.report.ok && kept.report.facts.some((f) => /contract of ref\.mdl is kept/.test(f)), [...kept.report.errors, ...kept.report.faults].join("; "));
  // a reference with an animation and a bone the model lacks
  const ref = contractOf(mdl);
  const broken = compareContract({ ...ref, bones: [...ref.bones, "Bip01 Dorso"], sequences: [{ name: "dive_f_akimbo", activity: 0 }, ...ref.sequences] }, contractOf(mdl));
  sure(broken.faults.some((f) => /bones of the reference are missing: Bip01 Dorso/.test(f)) && broken.faults.some((f) => /animations are missing: dive_f_akimbo/.test(f)) && broken.faults.some((f) => /another number/.test(f)), broken.faults.join("; "));
});

test("colours in words: the XKCD names with their modifiers, and a colour as it shows in a picture", async () => {
  const { colourFromWords } = await import("../src/spec/colours.mjs");
  const { toLab } = await import("../src/spec/colours.mjs");
  const grey = toLab(colourFromWords("grey").rgb);
  const dark = toLab(colourFromWords("dark grey").rgb);
  const warm = toLab(colourFromWords("warm grey").rgb);
  sure(dark[0] < grey[0] - 10 && warm[2] > grey[2] + 3, `dark grey L ${dark[0].toFixed(1)} under grey's ${grey[0].toFixed(1)}; warm grey b ${warm[2].toFixed(1)} over ${grey[2].toFixed(1)}`);
  sure(colourFromWords("nothing at all") === null, "no colour named: none made up");
  // a material's colour in words; and one given as seen in a picture, divided by the pictures' light
  sure(materialOf({ base: "paint", tone: "teal" }).tone[2] > 0.4 && materialOf({ base: "paint", seen: [0.4, 0.4, 0.4] }).tone[0] === 0.5, "words, and seen");
});

test("a model spec's marks: stripes painted on a turned part, on its side only, round it as a ring; none on a box", () => {
  const post = (marks) => ({ spec: "smak.model/1", name: "post.mdl", kind: "prop", finish: false, materials: { fur: { base: "paint", tone: [0.95, 0.55, 0.12] } }, parts: [{ id: "post", kind: "cylinder", radius: 6, height: 30, sides: 16, material: "fur", marks }] });
  const dark = (spec) => {
    const { mdl, report } = buildModelSpec(spec);
    sure(report.ok, [...report.errors, ...report.faults].join("; "));
    const front = smak.render(mdl, { seq: 0, yaw: 0, pitch: 0, width: 120, height: 160, light: false });
    let count = 0;
    for (let i = 0; i < front.rgba.length; i += 4) if (front.rgba[i] < 40 && front.rgba[i + 1] < 40 && front.rgba[i + 2] < 40) count++;
    return count;
  };
  const ring = dark(post([{ path: [[0.5, 0], [0.5, 360]], width: 4 }]));
  const behind = dark(post([{ path: [[0.2, 180], [0.8, 180]], width: 4 }]));
  const none = dark(post([]));
  sure(ring > 300 && behind === none, `a ring shows from the front (${ring} dark dots), a stripe behind does not (${behind} against ${none})`);
  const box = validateModelSpec({ spec: "smak.model/1", name: "b.mdl", parts: [{ id: "b", kind: "box", size: [4, 4, 4], marks: [{ path: [[0, 0], [1, 0]] }] }] });
  sure(box.errors.some((e) => /marks are painted on a turned part/.test(e)), box.errors.join("; "));
});

test("a model spec's finish: a box's edges worn lighter than its middle, its foot dirtier; none when told", () => {
  const spec = (finish, partFinish) => ({
    spec: "smak.model/1",
    name: "crate.mdl",
    kind: "prop",
    ...(finish === undefined ? {} : { finish }),
    materials: { flat: { base: "paint", tone: [0.5, 0.5, 0.5] } },
    parts: [{ id: "crate", kind: "box", material: "flat", size: [16, 16, 16], ...(partFinish === undefined ? {} : { finish: partFinish }) }],
  });
  // the picture of the box's front face (+x), sampled at its middle, near its top edge and near its foot
  const lightAt = (mdl) => {
    const P = smak.posed(mdl, {});
    const tex = smak.textureOf(mdl, smak.readMdl(mdl).textures[0].name);
    const front = P.tris.filter((t) => t.c.every((c) => c.p[0] > 7.99));
    const sample = (z) => {
      // the texel of the front face nearest (8, 0, z), by its corners' places and texture places
      const t = front.find((t) => { const zs = t.c.map((c) => c.p[2]); return z >= Math.min(...zs) && z <= Math.max(...zs); });
      const [a, b, c] = t.c;
      const solve = (q) => { const d = (b.p[1] - a.p[1]) * (c.p[2] - a.p[2]) - (c.p[1] - a.p[1]) * (b.p[2] - a.p[2]); const w1 = ((q[1] - a.p[1]) * (c.p[2] - a.p[2]) - (c.p[1] - a.p[1]) * (q[2] - a.p[2])) / d; const w2 = ((b.p[1] - a.p[1]) * (q[2] - a.p[2]) - (q[1] - a.p[1]) * (b.p[2] - a.p[2])) / d; return [1 - w1 - w2, w1, w2]; };
      const w = solve([8, 0, z]);
      const u = Math.round(a.u * w[0] + b.u * w[1] + c.u * w[2]);
      const v = Math.round(a.v * w[0] + b.v * w[1] + c.v * w[2]);
      const k = tex.pixels[v * tex.width + u] * 3;
      return (tex.palette[k] + tex.palette[k + 1] + tex.palette[k + 2]) / 3;
    };
    return { middle: sample(8), edge: sample(15.9), foot: sample(1.5) };
  };
  const finished = lightAt(buildModelSpec(spec()).mdl);
  sure(finished.edge > finished.middle + 8, `the top edge worn lighter than the middle: ${JSON.stringify(finished)}`);
  sure(finished.foot < finished.middle, `the foot dirtier than the middle: ${JSON.stringify(finished)}`);
  const plain = lightAt(buildModelSpec(spec(false)).mdl);
  const partPlain = lightAt(buildModelSpec(spec(undefined, false)).mdl);
  sure(Math.abs(plain.edge - plain.middle) < 6 && JSON.stringify(plain) === JSON.stringify(partPlain), `no finish, by the spec or by the part: ${JSON.stringify(plain)} ${JSON.stringify(partPlain)}`);
  const wrong = validateModelSpec({ ...spec({ wear: 2 }) });
  sure(/finish: false \(none\), or \{ light, wear, grime, vary \}/.test(wrong.errors.join()), wrong.errors.join());
});

test("a mesh material: a net is a masked texture with holes, seen through by design and not as a fault", () => {
  const { mdl, report } = buildModelSpec({
    spec: "smak.model/1",
    name: "net.mdl",
    kind: "prop",
    materials: { cord: { base: "mesh", tone: [0.1, 0.1, 0.1], cell: 2 } },
    parts: [
      { id: "post", kind: "cylinder", material: "steel", radius: 1, height: 40 },
      { id: "net", kind: "leaf", material: "cord", rows: [[[0, 0, 0], [0, 40, 0]], [[0, 0, 30], [0, 40, 30]]] },
      { id: "basket", kind: "turn", material: "cord", sides: 12, rings: [[0, 4], [8, 6]], caps: [false, false], open: true, at: [10, 20, 20] },
    ],
  });
  sure(report.ok, `a net and a basket of mesh: ${[...report.errors, ...report.faults]}`);
  const net = smak.readMdl(mdl).textures.find((tex) => tex.flags & 64);
  const pixels = smak.textureOf(mdl, net.name).pixels;
  const holes = pixels.filter((i) => i === 255).length / pixels.length;
  sure(holes > 0.3 && holes < 0.95, `the net's picture is masked, with holes: ${(holes * 100).toFixed(0)}% of it`);
});

test("a change request's report: added, taken away, moved, swapped where it stood, recoloured, and the rest left", () => {
  const thing = (key, room, at, what = "props") => [key, { key, what, room, at, turn: 0 }];
  const before = {
    kind: "map",
    materials: { lawn: { base: "grass" } },
    rooms: { yard: { min: [0, 0, 0], max: [512, 512, 256] } },
    things: Object.fromEntries([thing("props tree_summer #1", "yard", [100, 100, 0]), thing("props bench #1", "yard", [200, 50, 0]), thing("props bush #1", "yard", [300, 300, 0]), thing("props lamp #1", "yard", [400, 400, 0])]),
  };
  const after = {
    kind: "map",
    materials: { lawn: { base: "snow" } },
    rooms: before.rooms,
    things: Object.fromEntries([thing("props tree_winter #1", "yard", [100, 100, 0]), thing("props bench #1", "yard", [260, 50, 0]), thing("props lamp #1", "yard", [400, 400, 0]), thing("props swing #1", "yard", [50, 450, 0])]),
  };
  const { lines, changed, still } = changesOf(before, after);
  const text = lines.join("\n");
  sure(/things swapped where they stood: props tree_summer #1 for props tree_winter #1 in yard at 100 100 0/.test(text), text);
  sure(/things added: props swing #1/.test(text) && !/things added:[^\n]*tree_winter/.test(text), text);
  sure(/things taken away: props bush #1$/m.test(text), text);
  sure(/things moved or turned: props bench #1 from 200 50 0 to 260 50 0/.test(text), text);
  sure(/materials changed: lawn/.test(text), text);
  sure(changed === 5 && still === 2, `5 changes (swap, add, take away, move, recolour), the room and the lamp left: ${changed} ${still}`);
});

test("an FGD's choices and flags keep what they are called", () => {
  const file = join(folder, "small.fgd");
  writeFileSync(file, '@SolidClass = func_breakable : "Breakable" [ material(choices) : "Material" : 0 = [ 0 : "Glass" 1 : "Wood" ] spawnflags(flags) = [ 1 : "Only Trigger" : 0 ] ]\n');
  const keys = definitionsOf(file).classes.func_breakable.keys;
  sure(keys.material.labels["1"] === "Wood" && keys.spawnflags.labels["1"] === "Only Trigger", JSON.stringify(keys.material));
});

test("a body torn in motion is told where: a skirt of one surface over two legs that part in a run", () => {
  const folder = join(tmp, "torn");
  mkdirSync(folder, { recursive: true });
  const box = (lo, hi, bone) => {
    const c = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]];
    return [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]].map((f) => f.map((i) => ({ p: c[i], uv: [0.5, 0.5], bone })));
  };
  const legs = buildMdl({
    name: "legs.mdl",
    bones: [{ name: "Bip01", parent: -1 }, { name: "Bip01 L Thigh", parent: 0, pos: [0, 4, 40] }, { name: "Bip01 R Thigh", parent: 0, pos: [0, -4, 40] }],
    bodyparts: [{ name: "body", models: [{ name: "b", meshes: [{ tris: [...box([-2, 2, 20], [2, 6, 40], 1), ...box([-2, -6, 20], [2, -2, 40], 2)], texture: indexed(W.sheet(16, 16).image(), "b.bmp") }] }] }],
    sequences: [
      { name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 4, 40, 0, 0, 0], [0, -4, 40, 0, 0, 0]]] },
      { name: "run", fps: 20, frames: [-40, 0, 40].map((d) => [[0, 0, 0, 0, 0, 0], [0, 4, 40, 0, (d * Math.PI) / 180, 0], [0, -4, 40, 0, (-d * Math.PI) / 180, 0]]) },
    ],
  });
  writeFileSync(join(folder, "legs.mdl"), legs);
  const leg = (side) => ({ at: `Bip01 ${side} Thigh`, radius: [4, 6, 10], offset: [0, 0, -10] });
  const spec = (parts) => ({ spec: "smak.model/1", name: "skirt.mdl", kind: "character", base: { file: "legs.mdl" }, parts });
  // one surface over both legs: torn between them in the run
  const skirt = buildModelSpec(spec([{ id: "skirt", kind: "blob", material: "cloth", pieces: [leg("L"), leg("R")], blend: 6 }]), { folder });
  sure(skirt.report.warnings.some((w) => /\d+% of its triangles stretch past 3 times their length in motion \(run frame \d+.*L Thigh \+ R Thigh/.test(w)), skirt.report.warnings.join(" | "));
  // each leg its own part: nothing joins them, nothing tears
  const apart = buildModelSpec(spec([{ id: "left", kind: "blob", material: "cloth", pieces: [leg("L")] }, { id: "right", kind: "blob", material: "cloth", pieces: [leg("R")] }]), { folder });
  sure(!apart.report.warnings.some((w) => /stretch past/.test(w)), apart.report.warnings.join(" | "));
  // a carved garment kept above its hem: the height checked
  sure(validateModelSpec({ spec: "smak.model/1", name: "x.mdl", kind: "prop", parts: [{ id: "coat", kind: "carved", size: [10, 10, 40], clip: 50, sheet: "s.png" }] }).errors.some((e) => /clip: a height in its own space/.test(e)), "a clip over the top refused");
});

test("pose.aim: a limb pointed where a description says, whatever the base's own stance", () => {
  const folder = join(tmp, "aim");
  mkdirSync(folder, { recursive: true });
  // a leg of a thigh 20 and a calf 18, its first frame swung 50 degrees back: aimed 30 forward, its foot goes forward
  const base = buildMdl({
    name: "aimleg.mdl",
    bones: [{ name: "Bip01", parent: -1 }, { name: "Bip01 L Thigh", parent: 0, pos: [0, 4, 40] }, { name: "Bip01 L Calf", parent: 1, pos: [0, 0, -20] }, { name: "Bip01 L Foot", parent: 2, pos: [0, 0, -18] }],
    bodyparts: [{ name: "body", models: [{ name: "b", meshes: [{ tris: [], texture: indexed(W.sheet(16, 16).image(), "b.bmp") }] }] }],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0], [0, 4, 40, 0, (50 * Math.PI) / 180, 0], [0, 0, -20, 0, 0, 0], [0, 0, -18, 0, 0, 0]]] }],
  });
  writeFileSync(join(folder, "aimleg.mdl"), base);
  const spec = (pose) => ({ spec: "smak.model/1", name: "aimed.mdl", kind: "character", base: { file: "aimleg.mdl" }, pose, parts: [{ id: "thigh", kind: "box", size: [3, 3, 18], material: "cloth", span: ["Bip01 L Thigh", "Bip01 L Calf"] }] });
  const aimed = buildModelSpec(spec({ aim: { "L leg": { forward: 30 } } }), { folder });
  sure(!aimed.report.errors.length && aimed.report.facts.some((f) => /pose: L leg aimed as given/.test(f)), [...aimed.report.errors, ...aimed.report.facts].join(" | "));
  const foot = smak.posed(aimed.mdl, { seq: 0, frame: 0 }).pose[3];
  const want = [Math.sin(Math.PI / 6) * 38, 4, 40 - Math.cos(Math.PI / 6) * 38];
  sure([0, 2].every((k) => Math.abs(foot[k][3] - want[k]) < 1), `the foot at ${[foot[0][3], foot[1][3], foot[2][3]].map((v) => v.toFixed(1))}, aimed at ${want.map((v) => v.toFixed(1))}`);
  sure(buildModelSpec(spec({ aim: { "L tail": { forward: 10 } } }), { folder }).report.errors.some((e) => /pose\.aim\.L tail: a limb of L arm, R arm, L leg, R leg/.test(e)), "an unknown limb refused");
});

test("a lift may say the brightness its view was drawn at (a lamp's face, white at the place view's)", () => {
  const spec = (brightness) => ({ spec: "smak.wad/1", name: "x.wad", textures: [{ name: "lamp", size: [16, 16], lift: { map: "models:x.bsp", view: "work:pictures/lamp-dark.png", brightness } }] });
  sure(!validateWadSpec(spec(0.5)).errors.length, validateWadSpec(spec(0.5)).errors.join("; "));
  sure(validateWadSpec(spec(-1)).errors.some((e) => /lift\.brightness: the brightness its view was drawn at/.test(e)), validateWadSpec(spec(-1)).errors.join("; "));
});
