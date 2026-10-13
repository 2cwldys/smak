// A body whose stored normals are all nothing (0, 0, 0), as some of the game's own models have them: the page
// once drew such a body solid black. This opens that body in the editor's page in a real browser and, from
// three sides, compares the page's own picture with smak's render of the same body from the same camera.
//
//   node editor/test/zero.mjs            -> build/editor/zero/yaw30.png, yaw150.png, yaw270.png
//
// It starts the editor's server on port 8199 (or the one SMAK_TEST_PORT names) and stops it at the end. One
// line is printed for each check ("ok" or "FAIL"), then "all passed" or "<n> FAILED"; the exit code is 1
// when a check failed.
//
// It needs no model: unless told, it makes one with the kit (a short sword whose every corner stores a
// normal of nothing) and writes it to build/editor/zero/models/zero.mdl.
//
// From the environment:
//   SMAK_ZERO         a model of the game's to open instead of the one it makes
//   SMAK_ZERO_BODY    the number of that model's body that has such normals (2 unless told)
//   SMAK_TEST_PORT    the port of the server it starts (8199 unless told)
//   SMAK_PLAYWRIGHT   the package.json of a project that has playwright installed (unless told: the
//                     MasterSwordThreeJS checkout next to this one)
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../serve.mjs";
import * as smak from "../../src/index.mjs";
import { sword, taper } from "../../kits/swordkit.mjs";

// playwright is not a dependency of the kit: it is borrowed from another project's node_modules
const require = createRequire(
  process.env.SMAK_PLAYWRIGHT
    ? resolve(process.env.SMAK_PLAYWRIGHT)
    : new URL("../../../../MasterSwordThreeJS/package.json", import.meta.url),
);
const { chromium } = require("playwright");

// ROOT is the checkout the kit lies in (the folder above smak/); everything written goes under its build/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "build/editor/zero");
const PORT = Number(process.env.SMAK_TEST_PORT ?? 8199);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/**
 * A model made with the kit whose one body stores a normal of nothing for every corner: a short broad sword
 * on one bone, with one still animation. Its bytes.
 */
function zeroNormalsModel() {
  const piece = sword({
    seed: 3,
    pommel: {
      profile: [
        [0, 0.6],
        [1, 1.2],
        [2, 0.9],
      ],
    },
    grip: {
      profile: [
        [1.8, 0.9],
        [8, 1],
      ],
    },
    guard: {
      x: 8.4,
      sections: [
        [-3.5, 0.5, 0.4],
        [0, 0.7, 0.7],
        [3.5, 0.5, 0.4],
      ],
    },
    blade: { x0: 9, x1: 26, half: taper(2.6, 2.2), section: "single" },
  });
  const texture = smak.indexed(smak.shrink(piece.image, 4), "sword.bmp");
  const withNormals = smak.buildMdl({
    name: "zero.mdl",
    bones: [{ name: "root", parent: -1, pos: [0, 0, 0] }],
    bodyparts: [{ name: "body", models: [{ name: "sword", meshes: [{ tris: piece.tris, texture }] }] }],
    sequences: [{ name: "idle", fps: 10, loops: true, frames: [[[0, 0, 0, 0, 0, 0]]] }],
  });
  // the same mesh put back as such a model stores it: each place once, and 0, 0, 0 for every corner
  const model = smak.readMdl(withNormals).bodyparts[0].models[0];
  const vertices = [];
  const vertexNumberByPlace = new Map();
  const normals = [];
  const triangles = smak.readMesh(withNormals, model, model.meshes[0]).map((triangle) =>
    triangle.map((corner) => {
      const place = corner.p.join();
      if (!vertexNumberByPlace.has(place)) {
        vertexNumberByPlace.set(place, vertices.length);
        vertices.push(corner.p);
      }
      normals.push([0, 0, 0]);
      return [vertexNumberByPlace.get(place), normals.length - 1, corner.s, corner.t];
    }),
  );
  return smak.replaceMesh(
    withNormals,
    { bodypart: 0, model: 0, mesh: 0 },
    { bone: 0, verts: vertices, norms: normals, tris: triangles },
    texture,
  );
}

// the model: the game's own when one is named, else the one made here, in a folder of its own
let MODEL_FILE;
let BODY;
if (process.env.SMAK_ZERO) {
  MODEL_FILE = resolve(process.env.SMAK_ZERO);
  BODY = Number(process.env.SMAK_ZERO_BODY ?? 2);
  if (!existsSync(MODEL_FILE)) {
    console.error(
      `SMAK_ZERO names ${MODEL_FILE}, and there is no such file: unset it to use a model made here`,
    );
    process.exit(1);
  }
} else {
  MODEL_FILE = join(OUT, "models/zero.mdl");
  BODY = 0;
  mkdirSync(dirname(MODEL_FILE), { recursive: true });
  writeFileSync(MODEL_FILE, zeroNormalsModel());
}

// The one helper every check goes through: prints the line and counts the failures.
let failed = 0;
const check = (condition, text) => {
  console.log(`${condition ? "ok  " : "FAIL"}  ${text}`);
  if (!condition) failed++;
};

const server = await serve(MODEL_FILE, { port: PORT, work: OUT });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
// an error thrown by the page's own code is a failure of the test
page.on("pageerror", (error) => {
  console.log("page error:", error.message);
  failed++;
});
/** The end of the run: the browser and the server stopped, the count printed, the exit code set by it. */
const finish = async () => {
  await browser.close().catch(() => {});
  server.close();
  console.log(failed ? `${failed} FAILED` : "all passed");
  process.exit(failed ? 1 : 0);
};
// a wait that runs out, or any other error nobody caught, is a failed check and the last: the run ends there
// with its count, not with a stack trace
process.on("uncaughtException", (error) => {
  check(false, `the run stopped at an error: ${String(error?.message ?? error).split("\n")[0]}`);
  finish();
});

// The page opened on that body, seen from outside (orbit), with smak's picture beside it, no skeleton drawn
// and no smoothing of the picture, so that the two can be compared dot for dot.
await page.goto(
  `http://127.0.0.1:${PORT}/?model=${encodeURIComponent(basename(MODEL_FILE))}&body=${BODY}&cam=orbit&compare=1&bones=0&smooth=0`,
);
await page.waitForFunction(() => window.ed?.S.ready, null, { timeout: 60000 });

// Check 1: the body is what the test is about. Every corner the page holds for it (srcN: the normals as the
// file stores them, three numbers a corner) has to be (0, 0, 0).
const storedNormals = await page.evaluate(() => {
  let corners = 0;
  let zeroCorners = 0;
  for (const mesh of window.ed.view.meshes)
    for (let offset = 0; offset < mesh.srcN.length; offset += 3) {
      corners++;
      if (!mesh.srcN[offset] && !mesh.srcN[offset + 1] && !mesh.srcN[offset + 2]) zeroCorners++;
    }
  return { corners, zeroCorners };
});
check(
  storedNormals.corners > 0 && storedNormals.zeroCorners === storedNormals.corners,
  `body ${BODY} of ${basename(MODEL_FILE)}: ${storedNormals.zeroCorners} of its ${storedNormals.corners} corners have a normal of nothing`,
);

// Checks 2 to 4: the same comparison from three sides.
for (const yaw of [30, 150, 270]) {
  // turn the camera, and wait until smak's picture beside the view is the one asked for from that side
  await page.evaluate((wantedYaw) => {
    window.ed.view.cam.yaw = wantedYaw;
    window.ed.ACT.cam("orbit");
  }, yaw);
  await page.waitForTimeout(900);
  await page.waitForFunction(
    (wantedYaw) => {
      const smakImage = document.getElementById("cmpImg");
      return (
        smakImage.complete &&
        smakImage.naturalWidth > 0 &&
        new URL(smakImage.src).searchParams.get("yaw") === String(wantedYaw)
      );
    },
    yaw,
    { timeout: 60000 },
  );

  // In the browser: the page's canvas and smak's picture read dot by dot at the canvas's own size. A dot is
  // "of the model" when it is not the background's grey (58, 62, 70).
  const seen = await page.evaluate(async () => {
    const pageCanvas = document.getElementById("gl");
    const smakImage = document.getElementById("cmpImg");
    const width = pageCanvas.width;
    const height = pageCanvas.height;
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const pen = scratch.getContext("2d", { willReadFrequently: true });
    // ask the page for a fresh frame and wait until it has been drawn
    window.ed.S.dirty = true;
    await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)));
    pen.drawImage(pageCanvas, 0, 0);
    const pageDots = pen.getImageData(0, 0, width, height).data;
    pen.drawImage(smakImage, 0, 0, width, height);
    const smakDots = pen.getImageData(0, 0, width, height).data;
    const isBackground = (dots, offset) =>
      Math.abs(dots[offset] - 58) + Math.abs(dots[offset + 1] - 62) + Math.abs(dots[offset + 2] - 70) < 12;
    const lightOf = (dots, offset) => dots[offset] + dots[offset + 1] + dots[offset + 2];
    let inBoth = 0; // dots that are the model in both pictures
    let inOneOnly = 0; // dots that are the model in one and background in the other
    let colourSum = 0; // over the dots in both: how far apart the two colours are
    let pageModelDots = 0;
    let pageBlackDots = 0; // dots of the model the page drew (nearly) black
    let smakModelDots = 0;
    let pageLight = 0;
    let smakLight = 0;
    for (let offset = 0; offset < pageDots.length; offset += 4) {
      const onPage = !isBackground(pageDots, offset);
      const onSmak = !isBackground(smakDots, offset);
      if (onPage) {
        pageModelDots++;
        pageLight += lightOf(pageDots, offset);
        if (lightOf(pageDots, offset) < 24) pageBlackDots++;
      }
      if (onSmak) {
        smakModelDots++;
        smakLight += lightOf(smakDots, offset);
      }
      if (onPage && onSmak) {
        inBoth++;
        colourSum +=
          Math.abs(pageDots[offset] - smakDots[offset]) +
          Math.abs(pageDots[offset + 1] - smakDots[offset + 1]) +
          Math.abs(pageDots[offset + 2] - smakDots[offset + 2]);
      } else if (onPage !== onSmak) inOneOnly++;
    }
    return {
      inBoth,
      inOneOnly,
      pageModelDots,
      pageBlackDots,
      colourGap: colourSum / Math.max(1, inBoth) / 3, // of 255, on average
      pageBrightness: pageLight / Math.max(1, pageModelDots) / 3,
      smakBrightness: smakLight / Math.max(1, smakModelDots) / 3,
    };
  });
  await page.screenshot({ path: join(OUT, `yaw${yaw}.png`) });
  console.log(`      ${join(OUT, `yaw${yaw}.png`)}`);

  // The body is drawn at all, almost none of it is black, it is as bright as smak draws it, and the two
  // pictures have the same outline and nearly the same colours.
  check(
    seen.pageModelDots > 1000 &&
      seen.pageBlackDots < seen.pageModelDots * 0.02 &&
      Math.abs(seen.pageBrightness - seen.smakBrightness) < 6 &&
      seen.inOneOnly / (seen.inBoth + seen.inOneOnly) < 0.04 &&
      seen.colourGap < 8,
    `from yaw ${yaw}: the page draws it over ${seen.pageModelDots} dots, ${seen.pageBlackDots} of them black; its brightness is ${seen.pageBrightness.toFixed(1)} of 255 on average and smak's ${seen.smakBrightness.toFixed(1)}; ${((100 * seen.inOneOnly) / (seen.inBoth + seen.inOneOnly)).toFixed(2)}% of the outline apart, colours ${seen.colourGap.toFixed(1)} apart`,
  );
}

await finish();
