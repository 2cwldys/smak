// A map's faces whose look changes as GoldSrc's do (sbox/lightmap.mjs, sbox/map.mjs): an animated texture's frames
// played by the lightmapped shader, a conveyor's texture moving, an added brush on the same shader, and the slot by
// which a game hands a brush entity's frame, conveyor and render amount; and a model ported into a nested folder. The
// maps' own cases need The Specialists' maps (SMAK_TS_MAPS, or its clean install at C:/Juegos/TS30-clean).
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, sure } from "./helper.mjs";

const { sbox } = smak;

test("lightmapShader: frames, scroll and slot read; F_TRANSLUCENT 1 blended, 2 added and unlit", () => {
  const text = sbox.lightmapShader();
  sure(/Feature\( F_TRANSLUCENT, 0\.\.2/.test(text), "F_TRANSLUCENT 0..2");
  // s&box compiles neither a feature of more than two values without names, nor g_flOpacityScale outside a
  // translucent combo (sbox_pixel.fxc declares it only then)
  for (const shader of [text, sbox.studioShader()])
    sure(/F_TRANSLUCENT, 0\.\.2\(0="[^"]+", 1="[^"]+", 2="[^"]+"\)/.test(shader), "F_TRANSLUCENT's values named");
  const reads = text.split("\n").filter((l) => /g_flOpacityScale/.test(l) && !/^\s*\/\//.test(l));
  sure(reads.length > 0, "the amount read");
  for (const line of reads) {
    const before = text.slice(0, text.indexOf(line));
    sure(before.lastIndexOf("#if S_TRANSLUCENT") > before.lastIndexOf("#endif"), `read outside S_TRANSLUCENT: ${line.trim()}`); // prettier-ignore
  }
  sure(/S_TRANSLUCENT == 2[\s\S]*SrcBlend, ONE \)[\s\S]*DstBlend, ONE \)[\s\S]*DepthWriteEnable, false/.test(text), "added: ONE, ONE, no depth"); // prettier-ignore
  for (const name of ["g_flFrames", "g_flOtherFrames", "g_vFrameShare", "g_flScroll", "g_flSlot", '"SmakEntities"', '"SmakEntitiesSet"']) sure(text.includes(name), name); // prettier-ignore
  sure(
    text.includes(`floor( g_flTime * ${sbox.ANIMATION_RATE}.0 )`) && sbox.ANIMATION_RATE === 20,
    "20 frames a second",
  );
  // a slot read only once the game has handed the slots over: an unbound picture may read as white
  sure(/g_flSlot > 0\.0 && g_flEntitiesSet > 0\.5/.test(text), "the slots read only when handed over");
});

test("portToSbox: a nested folder kept as folders, each part named as the rest are", () => {
  const plain = { name: "plain.bmp", width: 4, height: 4, pixels: new Uint8Array(16).fill(1), palette: new Uint8Array(768).fill(90), flags: 0 }; // prettier-ignore
  const tri = [{ p: [0, 0, 0], uv: [0, 0], bone: "root" }, { p: [1, 0, 0], uv: [1, 0], bone: "root" }, { p: [0, 0, 1], uv: [0, 1], bone: "root" }]; // prettier-ignore
  const mdl = smak.buildMdl({
    name: "lamp.mdl",
    bones: [{ name: "root", parent: -1, pos: [0, 0, 0] }],
    bodyparts: [{ name: "body", models: [{ name: "body", meshes: [{ tris: [tri], texture: plain }] }] }],
    sequences: [{ name: "idle", fps: 10, frames: [[[0, 0, 0, 0, 0, 0]]] }],
  });
  const port = sbox.portToSbox(mdl, { name: "lamp", folder: "ts/Props Two" });
  sure(port.vmdl === "models/ts/props_two/lamp.vmdl", port.vmdl);
});

const TS = [process.env.SMAK_TS_MAPS, "C:/Juegos/TS30-clean"].find(
  (d) => d && existsSync(join(d, "maps", "ts_lobby.bsp")),
);
const VALVE = [process.env.SMAK_HALF_LIFE && join(process.env.SMAK_HALF_LIFE, "valve"), "C:/Juegos/Steam/steamapps/common/Half-Life/valve", "C:/Program Files (x86)/Steam/steamapps/common/Half-Life/valve"].find((d) => d && existsSync(d)); // prettier-ignore
const portOf = (map) =>
  sbox.portMapToSbox(join(TS, "maps", `${map}.bsp`), { folders: [TS, ...(VALVE ? [VALVE] : [])] });
const vmats = (port, pattern) => port.files.filter((f) => f.path.endsWith(".vmat") && pattern.test(f.path)).map((f) => ({ path: f.path, text: String(f.data) })); // prettier-ignore
const param = (text, name) => (new RegExp(`${name} "([^"]*)"`).exec(text) ?? [])[1];

if (TS) {
  test("portMapToSbox (ts_lobby): a screen's three frames in one picture; an elevator button's set and its other, with its slot", () => {
    const port = portOf("ts_lobby");
    const [screen] = vmats(port, /lit\/.*drkmtl_scrn/);
    sure(screen && param(screen.text, "g_flFrames") === "3.000" && param(screen.text, "g_flOtherFrames") === "0.000", screen?.text); // prettier-ignore
    sure(param(screen.text, "g_vFrameShare") === "[0.250000 1.000000]" && /drkmtl_scrn_frames\.png/.test(screen.text), screen.text); // prettier-ignore
    sure(!param(screen.text, "g_flSlot"), "the world's screen needs no slot");
    const buttons = vmats(port, /lit\/.*aelev_lobby_slot/);
    sure(buttons.length > 0, "the buttons' faces have slots");
    for (const b of buttons) sure(param(b.text, "g_flFrames") === "1.000" && param(b.text, "g_flOtherFrames") === "1.000" && Number(param(b.text, "g_flSlot")) > 0, b.text); // prettier-ignore
  });

  test("portMapToSbox (ts_dojo): a func_conveyor's scroll_code moves by -speed / its width, with its slot", () => {
    const port = portOf("ts_dojo");
    const belts = vmats(port, /lit\/.*scroll_code.*_scroll/);
    sure(belts.length > 0, "the conveyors' faces scroll");
    for (const b of belts) sure(Number(param(b.text, "g_flSlot")) > 0 && Number(param(b.text, "g_flScroll")) !== 0, b.text);
  });

  test("portMapToSbox (ts_neobaroque): a brush an env_render changes is drawn though it starts unseen, with its slot", () => {
    const port = portOf("ts_neobaroque");
    const changed = vmats(port, /lit\/.*_(see|add)0_slot\d+/);
    sure(changed.length > 0, "drawn at amount 0, its slot kept");
    for (const c of changed) sure(/F_TRANSLUCENT [12]/.test(c.text) && param(c.text, "g_flOpacityScale") === "0.000", c.text); // prettier-ignore
  });
} else console.log("skip  portMapToSbox on The Specialists' maps (animation, conveyor, env_render)\n      skipped: its maps are not found (SMAK_TS_MAPS)"); // prettier-ignore
