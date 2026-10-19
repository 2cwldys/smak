// Video: a camera path walked at an even speed, a shot list previewed and made into frames checked for
// smoothness, a GIF of our own that a reader takes back, and the tool that builds it all from a spec.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { walkPath, simplify, curveOf } from "../src/camera.mjs";
import { gif, gifFrame, framesOfShot } from "../src/video.mjs";
import { buildModelSpec } from "../src/spec/model.mjs";
import { buildMapSpec } from "../src/spec/map.mjs";
import { findCompilers } from "../src/maps/compile.mjs";
import * as smak from "../src/index.mjs";
import { test, testAsync, sure, tmp, runSmak, runRefused, SMAK_CLI } from "./helper.mjs";

test("a camera path through corners is walked at an even speed, and a zigzag route is kept where it turns", () => {
  const eyes = walkPath([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], { speed: 100, fps: 30, easing: "none" });
  const steps = eyes.slice(1).map((e, i) => Math.hypot(...e.map((v, j) => v - eyes[i][j])));
  sure(Math.max(...steps) / Math.min(...steps) < 1.01, `steps ${Math.min(...steps)} to ${Math.max(...steps)}`);
  sure(curveOf([[0, 0, 0], [10, 0, 0]]).length > 9.9, "a straight curve is its own length");
  sure(simplify([[0, 0, 0], [1, 0.1, 0], [2, 0, 0], [3, 5, 0], [4, 10, 0]], 0.5).length === 3, "the wobble taken out, the turn kept");
});

/** A small model of a spec's, written where a shot can find it. */
function aModel(folder) {
  const { mdl } = buildModelSpec({ spec: "smak.model/1", name: "post.mdl", kind: "prop", parts: [{ id: "post", kind: "cylinder", radius: 3, height: 20, sides: 8, material: "steel" }, { id: "cap", kind: "box", size: [8, 8, 2], material: { base: "paint", tone: [0.9, 0.2, 0.1] }, attach: { to: "post" } }] });
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "post.mdl"), mdl);
  return mdl;
}

test("a turntable's frames turn the model smoothly, and a GIF of them has a frame each", () => {
  const mdl = aModel(join(tmp, "video-model"));
  const plan = framesOfShot({ kind: "turntable", model: "post.mdl", seconds: 1 }, { fps: 12, width: 64, height: 48, model: () => mdl });
  const frames = [...plan.frames()].map((draw) => draw());
  sure(plan.count === 12 && frames.length === 12 && frames[0].width === 64, `${plan.count} frames`);
  const bytes = gif(frames.map(gifFrame), { width: 64, height: 48, fps: 12 });
  sure(bytes.subarray(0, 6).toString("latin1") === "GIF89a" && bytes.at(-1) === 0x3b, "a GIF from first byte to last");
  // one image block a frame
  let blocks = 0;
  for (let i = 0; i < bytes.length - 9; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) blocks++;
  sure(blocks === 12, `${blocks} frames in the GIF`);
});

test("smak build: a video spec previewed as its contact sheet, then made a GIF with no ffmpeg asked; a wrong one exits 1", () => {
  const folder = join(tmp, "video-cli");
  aModel(folder);
  const spec = { spec: "smak.video/1", name: "post", size: [96, 64], fps: 12, format: "gif", shots: [{ kind: "title", seconds: 0.5, text: "POST" }, { kind: "turntable", model: "post.mdl", seconds: 1 }] };
  writeFileSync(join(folder, "post.json"), JSON.stringify(spec));
  const preview = runSmak("build", join(folder, "post.json"), "--preview");
  sure(/a preview: four frames a shot/.test(preview) && existsSync(join(folder, "post-sheet.png")) && !existsSync(join(folder, "post.gif")), preview);
  const made = runSmak("build", join(folder, "post.json"));
  sure(/turntable: 12 frames .*change between frames median/.test(made) && /the video made, and every check passed/.test(made), made);
  sure(readFileSync(join(folder, "post.gif")).subarray(0, 6).toString("latin1") === "GIF89a", "the GIF written");
  writeFileSync(join(folder, "bad.json"), JSON.stringify({ ...spec, shots: [{ kind: "dolly" }] }));
  const refused = runRefused(SMAK_CLI, "build", join(folder, "bad.json"));
  sure(refused.code === 1 && /ERROR/.test(refused.out), refused.out + refused.err);
});

test("a map seen from outside, over its sky, is seen into: the sky's faces are not drawn from behind", () => {
  if (!findCompilers().found) return console.log("      (no compilers here: the yard is not compiled, and the view from over it is not drawn)");
  const out = join(tmp, "over-the-sky");
  const spec = { spec: "smak.map/1", name: "openyard", textures: { grass: { base: "grass", tone: [0.2, 0.6, 0.1] } }, theme: { floor: "grass" }, rooms: [{ id: "yard", size: [512, 512, 256], sky: true }], entities: [{ class: "info_player_start", room: "yard", at: "centre" }] };
  const { files } = buildMapSpec(spec, { out });
  const bsp = smak.maps.readBsp(readFileSync(files.bsp));
  // from high over the yard, looking down: its grass, not the sky's lid
  const view = smak.maps.drawMap(bsp, { from: [0, -200, 900], yaw: 90, pitch: -70, width: 64, height: 64, entities: "none", labels: false });
  // the middle of the view, a square of 16 dots, on the whole
  const sum = [0, 0, 0];
  for (let y = 24; y < 40; y++) for (let x = 24; x < 40; x++) for (let c = 0; c < 3; c++) sum[c] += view.rgba[(y * 64 + x) * 4 + c] / 256;
  const [r, g, b] = sum.map(Math.round);
  sure(g > r && g > b, `the middle of the view is ${r} ${g} ${b}: the yard's grass, not its sky`);
});
