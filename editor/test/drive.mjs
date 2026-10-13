// The editor's page driven as a person would drive it, in a real browser, with a picture of each state and
// the facts checked from outside: the project file on disk, the pictures the server gives, the saved model
// read back by smak.
//
//   node editor/test/drive.mjs       -> build/editor/drive/*.png, and a project and a saved model beside them
//
// It starts the editor's server on port 8198 (or the one SMAK_TEST_PORT names) and stops it at the end. One
// line is printed for each check ("ok" or "FAIL"), with the path of each picture between them, then "all
// passed" or "<n> FAILED"; the exit code is 1 when a check failed. An error thrown by the page's own code
// counts as a failure too, and so does a wait that runs out: the run goes on, and still ends with its count.
//
// Uses the playwright of the MasterSwordThreeJS checkout next to this one, as lab/wardrobe/shots.mjs does,
// and the game's view models under run-msc/. Both can be somewhere else (a git worktree has neither beside
// it):
//   SMAK_MODELS       the folder that holds v_1hswords.mdl
//   SMAK_PLAYWRIGHT   the package.json of a project that has playwright installed
//   SMAK_TEST_PORT    the port of the server it starts (8198 unless told)
//
// What the test takes for granted of v_1hswords.mdl: animation 2 is "attack1" and has 56 frames, there are 25
// animations (so a duplicate becomes number 25), texture 55 is "sword_lab.bmp", body 1 is a sword, and the
// skeleton has "Bip01 R Forearm" and "Bip01 R Hand".
//
// The steps, in the order they run (each builds on the state the one before left):
//   1    open; first person beside smak's own picture of the same frame
//   2    orbit, the skeleton, a bone picked by a click on the model
//   2b   smak's picture follows the orbit camera
//   2c   both sides of every triangle (key F)
//   2d   a second body beside the first (key V)
//   2e   a double click sets the point the orbit camera turns about
//   3    the keys thinned
//   4    a bone turned with the mouse on a ring
//   5    undo and redo; 5b: play, a bone moved along an arrow, a pose copied and pasted
//   6    an event added on the timeline, and dragged; 6b: a key that cannot be moved
//   7    a texture replaced and adjusted; 7c to 7h: sliders by keyboard and by number, runs of key presses,
//        many pictures on one texture, adjustments on a replaced picture, chosen colours, bad hex digits
//   8    save, and the saved model read back by smak
//   9    the command line changes the project; the page takes it up
//   10   a duplicate animation, made slower
//
// Inside `inPage(...)` the code runs in the browser. `window.ed` is the hook the page exposes for tests: `S`
// its state, `view` and `view2` the two 3D views, `go(frame)`, `ACT` its actions, `core` the editor's
// arithmetic. Those names, the element ids and the data- attributes belong to the page.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../serve.mjs";
import * as smak from "../../src/index.mjs";

// playwright is not a dependency of the kit: it is borrowed from another project's node_modules
const require = createRequire(
  process.env.SMAK_PLAYWRIGHT
    ? resolve(process.env.SMAK_PLAYWRIGHT)
    : new URL("../../../../MasterSwordThreeJS/package.json", import.meta.url),
);
const { chromium } = require("playwright");

// ROOT is the checkout the kit lies in (the folder above smak/); everything written goes under its build/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "build/editor/drive");
const MODELS = resolve(process.env.SMAK_MODELS ?? join(ROOT, "run-msc/msc/models/viewmodels"));
const PORT = Number(process.env.SMAK_TEST_PORT ?? 8198);
const MODEL = "v_1hswords.mdl";
const BODY = 1;
const CLI = join(ROOT, "smak/editor/cli.mjs");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// the project file the page will make on the first edit, and the source model's bytes as they are before the
// test
const PROJECT_FILE = join(OUT, "v_1hswords.smakproj.json");
const SOURCE_BYTES = readFileSync(join(MODELS, MODEL));

// The one helper every check goes through: prints the line and counts the failures.
let failed = 0;
const check = (condition, text) => {
  console.log(`${condition ? "ok  " : "FAIL"}  ${text}`);
  if (!condition) failed++;
};

const server = await serve(MODELS, { port: PORT, work: OUT, engine: "xash" });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
/** The end of the run: the browser and the server stopped, the count printed, the exit code set by it. */
const finish = async () => {
  await browser.close().catch(() => {});
  server.close();
  console.log(failed ? `${failed} FAILED` : "all passed");
  process.exit(failed ? 1 : 0);
};
// An error nobody caught (a click on something that is not there, a step that needs what a failed wait did
// not bring) is a failed check, and the last: the run ends there with its count, not with a stack trace.
process.on("uncaughtException", (error) => {
  check(false, `the run stopped at an error: ${String(error?.message ?? error).split("\n")[0]}`);
  finish();
});
// how long a wait for the page lasts unless told, in milliseconds
const WAIT_MS = 30000;
/**
 * Waits until `condition` holds in the page (the browser). A wait that runs out is a failed check that says
 * what was waited for (`what`), and the run goes on.
 */
const waitInPage = async (what, condition, argument, timeout = WAIT_MS) => {
  try {
    await page.waitForFunction(condition, argument, { timeout });
  } catch {
    check(false, `waited ${timeout / 1000} s in vain for ${what}`);
  }
};
// an error thrown by the page's own code is a failure of the test; what it logs as an error is only printed
let pageErrors = 0;
page.on("pageerror", (error) => {
  console.log("page error:", error.message);
  pageErrors++;
  failed++;
});
page.on("console", (message) => {
  if (message.type() === "error") console.log("console:", message.text());
});

/** A picture of the whole page in build/editor/drive, after a moment for the view to come to rest. */
const picture = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`      ${join(OUT, `${name}.png`)}`);
};
/** Runs a function in the page (the browser), with one argument, and gives back what it returns. */
const inPage = (functionInPage, argument) => page.evaluate(functionInPage, argument);
/** Waits until the page has its model and is in the middle of nothing: no request out, no drag, no run of keys. */
const pageIdle = () =>
  waitInPage(
    "the page to be idle",
    () => window.ed.S.ready && !window.ed.S.busy && !window.ed.S.live && !window.ed.S.keying,
  );
/** The line at the top of the page that says what has just happened. */
const statusLine = () => inPage(() => document.getElementById("status").textContent);
/** The project file as it is on disk at this moment. */
const projectOnDisk = () => JSON.parse(readFileSync(PROJECT_FILE, "utf8"));
/** The editor's command line run on the test's project, as the agent would run it; gives what it printed. */
const runCli = (...args) =>
  execFileSync(process.execPath, [CLI, PROJECT_FILE, ...args], { encoding: "utf8" }).trim();
/** A slider of the Textures tab put at a value, as the browser tells it when a person drags and lets go. */
const setSlider = (name, value) =>
  inPage(
    ([sliderName, sliderValue]) => {
      const slider = document.querySelector(`[data-adj="${sliderName}"]`);
      slider.value = sliderValue;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [name, value],
  );

// 1. open and look: first person beside smak's own picture of the same frame
await page.goto(
  `http://127.0.0.1:${PORT}/?model=${MODEL}&anim=attack1&frame=12&body=${BODY}&compare=1&smooth=0`,
);
await waitInPage("the page to have its model", () => window.ed?.S.ready, null, 60000);
await waitInPage(
  "smak's picture beside the view",
  () => document.getElementById("cmpImg").complete && document.getElementById("cmpImg").naturalWidth > 0,
);
await picture("01_first_person_beside_smak");

/**
 * The two pictures compared dot for dot: the page's canvas against smak's render (the image beside it) at the
 * canvas's own size. A dot is "of the model" when it is not the background's grey (58, 62, 70).
 */
const comparePageWithSmak = () =>
  inPage(async () => {
    const pageCanvas = document.getElementById("gl");
    const smakImage = document.getElementById("cmpImg");
    const width = pageCanvas.width;
    const height = pageCanvas.height;
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const pen = scratch.getContext("2d");
    // ask the page for a fresh frame and wait until it has been drawn
    window.ed.S.dirty = true;
    await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)));
    pen.drawImage(pageCanvas, 0, 0);
    const pageDots = pen.getImageData(0, 0, width, height).data;
    pen.drawImage(smakImage, 0, 0, width, height);
    const smakDots = pen.getImageData(0, 0, width, height).data;
    const isBackground = (dots, offset) =>
      Math.abs(dots[offset] - 58) + Math.abs(dots[offset + 1] - 62) + Math.abs(dots[offset + 2] - 70) < 12;
    let inBoth = 0; // dots that are the model in both pictures
    let inOneOnly = 0; // dots that are the model in one and background in the other
    let colourSum = 0; // over the dots in both: how far apart the two colours are
    let pageModelDots = 0; // the dots of the page's own picture that are the model
    for (let offset = 0; offset < pageDots.length; offset += 4) {
      const onPage = !isBackground(pageDots, offset);
      const onSmak = !isBackground(smakDots, offset);
      if (onPage) pageModelDots++;
      if (onPage && onSmak) {
        inBoth++;
        colourSum +=
          Math.abs(pageDots[offset] - smakDots[offset]) +
          Math.abs(pageDots[offset + 1] - smakDots[offset + 1]) +
          Math.abs(pageDots[offset + 2] - smakDots[offset + 2]);
      } else if (onPage !== onSmak) inOneOnly++;
    }
    return {
      width,
      height,
      inBoth,
      inOneOnly,
      pageModelDots,
      colourGap: colourSum / Math.max(1, inBoth) / 3, // of 255, on average
      outlinePercent: (100 * inOneOnly) / Math.max(1, inBoth + inOneOnly),
    };
  });

// From the eye, as the game shows a view model, the page's picture and smak's have the same outline.
const firstPerson = await comparePageWithSmak();
check(
  firstPerson.inOneOnly / (firstPerson.inBoth + firstPerson.inOneOnly) < 0.03,
  `first person against smak's render at ${firstPerson.width}x${firstPerson.height}: the model covers ${firstPerson.inBoth} dots in both and ${firstPerson.inOneOnly} in one only (${((100 * firstPerson.inOneOnly) / (firstPerson.inBoth + firstPerson.inOneOnly)).toFixed(2)}% of its outline apart); where both draw it the colours differ by ${firstPerson.colourGap.toFixed(1)} of 255 on average`,
);

// 2. orbit, the skeleton, a bone picked by clicking the model
await page.uncheck("#showCompare");
await page.click("#camOrbit");
await inPage(() => {
  window.ed.view.cam.yaw = 250;
  window.ed.view.cam.pitch = 12;
  window.ed.S.dirty = true;
});
await page.waitForTimeout(300);
// #over is the layer over the 3D view that takes the mouse; the page's joints are in its coordinates
const viewBox = await page.locator("#over").boundingBox();
const forearmJoint = await inPage(() => {
  const state = window.ed.S;
  const forearm = state.ctx.bones.findIndex((bone) => bone.name === "Bip01 R Forearm");
  return state.joints[forearm];
});
// A click where the forearm's joint is drawn makes the forearm the bone being worked on.
await page.mouse.click(viewBox.x + forearmJoint[0], viewBox.y + forearmJoint[1]);
await page.waitForTimeout(200);
check(
  (await inPage(() => window.ed.S.ctx.bones[window.ed.S.bone]?.name)) === "Bip01 R Forearm",
  "a click on a joint picks its bone (Bip01 R Forearm)",
);
await picture("02_orbit_skeleton_bone_picked");

// 2b. smak's picture beside an orbit view: the camera stays the one in use, the picture is drawn from it and
// follows it when a drag ends or the wheel rests
const startCamera = await inPage(() => JSON.parse(JSON.stringify(window.ed.view.cam)));
/** How many times the page has asked for smak's picture (S.cmpN), and the query of the last one asked for. */
const smakPictureAsked = () =>
  inPage(() => ({
    count: window.ed.S.cmpN,
    query: Object.fromEntries(new URL(document.getElementById("cmpImg").src).searchParams),
  }));
/** Waits for the page to have asked for smak's picture after a change, and for the picture to have come. */
const smakPictureSettled = async () => {
  await page.waitForTimeout(900);
  await waitInPage(
    "smak's picture to have come",
    () => {
      const smakImage = document.getElementById("cmpImg");
      return smakImage.complete && smakImage.naturalWidth > 0;
    },
    null,
    60000,
  );
  return smakPictureAsked();
};
const cameraNow = () => inPage(() => window.ed.view.cam);
/** The words every comparison of the two pictures is reported in. */
const agreementText = (match) =>
  `${match.inBoth} dots in both and ${match.inOneOnly} in one only (${match.outlinePercent.toFixed(2)}% of its outline apart), colours ${match.colourGap.toFixed(1)} of 255 apart`;

// Ticking "smak's picture" in orbit does not switch the camera, and the picture is asked for from that
// camera.
await page.check("#showCompare");
let asked = await smakPictureSettled();
let orbitMatch = await comparePageWithSmak();
check(
  (await cameraNow()).mode === "orbit" &&
    asked.query.view === "orbit" &&
    Number(asked.query.yaw) === 250 &&
    Number(asked.query.dist) > 0,
  `smak's picture ticked in orbit: the camera is still ${(await cameraNow()).mode}, and the picture was asked for from it (yaw ${asked.query.yaw}, pitch ${asked.query.pitch}, about ${asked.query.target}, ${asked.query.dist} units away)`,
);
check(
  orbitMatch.outlinePercent < 4 && orbitMatch.inBoth > 2000,
  `orbit against smak's render from the same camera: ${agreementText(orbitMatch)}`,
);
await picture("02b_orbit_beside_smak");

// The camera turned by dragging with the left button: no picture is asked for while the button is down (the
// count read 0.7 s into the hold is unchanged), and exactly one once it is let go.
const dragBox = await page.locator("#over").boundingBox();
await page.mouse.move(dragBox.x + 40, dragBox.y + 40);
await page.mouse.down();
for (let step = 1; step <= 10; step++)
  await page.mouse.move(dragBox.x + 40 + step * 12, dragBox.y + 40 + step * 3);
await page.waitForTimeout(700);
const askedWhileHeld = await smakPictureAsked();
await page.mouse.up();
let askedAfter = await smakPictureSettled();
let camera = await cameraNow();
check(
  askedWhileHeld.count === asked.count &&
    askedAfter.count === asked.count + 1 &&
    Number(askedAfter.query.yaw) === camera.yaw &&
    Math.abs(camera.yaw - 250) > 20,
  `the camera turned by a drag (yaw 250 to ${camera.yaw.toFixed(1)}): smak's picture was not asked for while the button was down, and once when it was let go (yaw ${askedAfter.query.yaw})`,
);

// Four turns of the wheel in quick succession bring the camera nearer and ask for one picture, not four.
asked = askedAfter;
for (let turn = 0; turn < 4; turn++) {
  await page.mouse.wheel(0, -150);
  await page.waitForTimeout(40);
}
askedAfter = await smakPictureSettled();
camera = await cameraNow();
check(
  askedAfter.count === asked.count + 1 &&
    Math.abs(Number(askedAfter.query.dist) - camera.dist) < 1e-3 &&
    camera.dist < startCamera.dist * 0.7,
  `four turns of the wheel (${startCamera.dist.toFixed(1)} units away to ${camera.dist.toFixed(1)}): one picture more, from ${askedAfter.query.dist}`,
);

// A drag with the right button slides the camera's centre: one picture more, about the new centre.
asked = askedAfter;
await page.mouse.move(dragBox.x + 60, dragBox.y + 60);
await page.mouse.down({ button: "right" });
await page.mouse.move(dragBox.x + 100, dragBox.y + 90, { steps: 4 });
await page.mouse.up({ button: "right" });
askedAfter = await smakPictureSettled();
camera = await cameraNow();
check(
  askedAfter.count === asked.count + 1 &&
    askedAfter.query.target !== asked.query.target &&
    askedAfter.query.target
      .split(",")
      .every((value, axis) => Math.abs(Number(value) - camera.target[axis]) < 1e-3),
  `the camera slid with the right button: one picture more, about ${askedAfter.query.target}`,
);

// After all three the page's picture and smak's still show the same thing.
orbitMatch = await comparePageWithSmak();
check(
  orbitMatch.outlinePercent < 4 && orbitMatch.inBoth > 2000,
  `turned, nearer and slid, the two pictures still agree: ${agreementText(orbitMatch)}`,
);
await picture("02c_smak_follows_the_camera");

// 2c. both sides of every triangle: with the eye inside the forearm every face is seen from behind, so one
// side shows next to nothing and both show its inside; smak's picture follows The camera put one unit from a
// point 4 units along the forearm (a bone's place is entries 3, 7, 11 of its world matrix, its own x axis
// entries 0, 4, 8).
await inPage((startCam) => {
  const state = window.ed.S;
  const forearm = state.world[state.ctx.bones.findIndex((bone) => bone.name === "Bip01 R Forearm")];
  Object.assign(window.ed.view.cam, startCam, {
    target: [forearm[3] + forearm[0] * 4, forearm[7] + forearm[4] * 4, forearm[11] + forearm[8] * 4],
    dist: 1,
  });
  state.dirty = true;
}, startCamera);
// F on and off again, so that the one-sided picture is measured after the same round trip as the two-sided
await page.keyboard.press("f");
await smakPictureSettled();
await page.keyboard.press("f");
await smakPictureSettled();
const oneSided = await comparePageWithSmak();
await page.keyboard.press("f");
askedAfter = await smakPictureSettled();
const twoSided = await comparePageWithSmak();
// With F the box is ticked, the view draws both sides, much more of the model is seen from inside it, and
// smak's picture was asked for with both sides too and agrees.
check(
  (await page.isChecked("#showBoth")) &&
    (await inPage(() => window.ed.view.both)) &&
    askedAfter.query.both === "1" &&
    twoSided.pageModelDots > oneSided.pageModelDots * 1.5 + 5000 &&
    twoSided.outlinePercent < 6,
  `F shows both sides: from inside the forearm the model covers ${oneSided.pageModelDots} dots of the view with one side drawn and ${twoSided.pageModelDots} with both; smak's picture was asked for with both and agrees (${agreementText(twoSided)})`,
);
await picture("02d_both_sides");
await page.keyboard.press("f");
askedAfter = await smakPictureSettled();
check(
  !(await page.isChecked("#showBoth")) && askedAfter.query.both === undefined,
  "F again: one side, as the game",
);
await page.uncheck("#showCompare");

// 2d. a second body beside the first: its own selects, the same camera and frame; for looking only
await inPage((startCam) => {
  Object.assign(window.ed.view.cam, startCam);
  window.ed.S.dirty = true;
}, startCamera);
await page.keyboard.press("v");
await waitInPage(
  "the second view to open",
  () => window.ed.view2?.meshes.length > 0 && !document.getElementById("view2").hidden,
);
await pageIdle();
// Another body to show in the second view: in the first bodypart that has more than one model, the first
// model that is not the one the first view shows and that has triangles. The body's number the test reports
// and looks for in the second view's tag is the model's place in its bodypart times that bodypart's `base`
// (the whole number while every other bodypart is at its first model).
const otherBody = await inPage(() => {
  const state = window.ed.S;
  const bodypart = state.scene.bodyparts.findIndex((part) => part.models.length > 1);
  const model = state.scene.bodyparts[bodypart].models.findIndex(
    (candidate, index) => index !== state.picks[bodypart] && candidate.tris > 0,
  );
  return {
    bodypart,
    model,
    firstViewModel: state.picks[bodypart],
    base: state.scene.bodyparts[bodypart].base,
    name: state.scene.bodyparts[bodypart].models[model].name,
  };
});
await page.selectOption(`[data-set="pick2:${otherBody.bodypart}"]`, String(otherBody.model));
await page.waitForTimeout(900);
await pageIdle();

/**
 * The two canvases read dot by dot: how many dots of each are the model, a sum over the second view's that
 * changes when its picture does, and how many dots are unlike between the two. With them, what the page says
 * of the second view.
 */
const compareTwoViews = () =>
  inPage(async () => {
    window.ed.S.dirty = true;
    await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)));
    const firstCanvas = document.getElementById("gl");
    const secondCanvas = document.getElementById("gl2");
    const width = firstCanvas.width;
    const height = firstCanvas.height;
    const dotsOf = (canvas) => {
      const scratch = document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      const pen = scratch.getContext("2d");
      pen.drawImage(canvas, 0, 0, width, height);
      return pen.getImageData(0, 0, width, height).data;
    };
    const firstDots = dotsOf(firstCanvas);
    const secondDots = dotsOf(secondCanvas);
    const isBackground = (dots, offset) =>
      Math.abs(dots[offset] - 58) + Math.abs(dots[offset + 1] - 62) + Math.abs(dots[offset + 2] - 70) < 12;
    let firstModelDots = 0;
    let secondModelDots = 0;
    let dotsUnlike = 0;
    let fingerprint = 0; // of the second view's picture: colours weighted by where they are
    for (let offset = 0; offset < firstDots.length; offset += 4) {
      if (!isBackground(firstDots, offset)) firstModelDots++;
      if (!isBackground(secondDots, offset)) {
        secondModelDots++;
        fingerprint +=
          secondDots[offset] + secondDots[offset + 1] * 3 + secondDots[offset + 2] * 7 + (offset % 1013);
      }
      if (
        Math.abs(firstDots[offset] - secondDots[offset]) +
          Math.abs(firstDots[offset + 1] - secondDots[offset + 1]) +
          Math.abs(firstDots[offset + 2] - secondDots[offset + 2]) >
        24
      )
        dotsUnlike++;
    }
    return {
      firstModelDots,
      secondModelDots,
      dotsUnlike,
      fingerprint,
      sameCamera: window.ed.view2.cam === window.ed.view.cam, // one camera object for the two views
      tag: document.getElementById("tag2").textContent, // the line under the second view
      selectCount: document.querySelectorAll("#bodies2 select").length, // the second view's own body selects
      sameSize: firstCanvas.width === secondCanvas.width && firstCanvas.height === secondCanvas.height,
    };
  });

// The second view is open and draws the other body: a picture unlike the first's, from the very same camera,
// with its own selects and a tag that names the body's number and nothing else. The first view still draws
// its own body beside it.
const secondViewOpen = await compareTwoViews();
check(
  secondViewOpen.firstModelDots > 2000 &&
    secondViewOpen.secondModelDots > 2000 &&
    secondViewOpen.dotsUnlike > 500 &&
    secondViewOpen.sameCamera &&
    secondViewOpen.selectCount >= 1 &&
    secondViewOpen.tag === `second body: ${otherBody.model * otherBody.base}` &&
    (await inPage(() => window.ed.S.picks2.join() !== window.ed.S.picks.join())),
  `V opens a second view: body ${otherBody.model * otherBody.base} (${otherBody.name}) beside body ${BODY} (${secondViewOpen.firstModelDots} dots), ${secondViewOpen.secondModelDots} dots of it drawn, ${secondViewOpen.dotsUnlike} dots unlike the first view's, one camera for the two ("${secondViewOpen.tag}")`,
);
await picture("02e_second_body_beside_the_first");

// Another frame changes the second view's picture, and so does turning the camera.
await inPage(() => window.ed.go(30));
await page.waitForTimeout(300);
const secondViewAtFrame30 = await compareTwoViews();
check(
  secondViewAtFrame30.fingerprint !== secondViewOpen.fingerprint,
  `the second view follows the frame (frame 12 to 30: its picture changed)`,
);
await inPage(() => {
  window.ed.view.cam.yaw += 70;
  window.ed.S.dirty = true;
});
const secondViewTurned = await compareTwoViews();
check(secondViewTurned.fingerprint !== secondViewAtFrame30.fingerprint, "and the camera");
await inPage(() => {
  window.ed.view.cam.yaw -= 70;
  window.ed.go(12);
});

// the first view switched to that body shows what the second does
await page.selectOption(`#bodies [data-set="pick:${otherBody.bodypart}"]`, String(otherBody.model));
await page.waitForTimeout(900);
await pageIdle();
const bothViewsSameBody = await compareTwoViews();
check(
  bothViewsSameBody.sameSize &&
    bothViewsSameBody.dotsUnlike < bothViewsSameBody.secondModelDots * 0.01 &&
    /the same as the first/.test(bothViewsSameBody.tag),
  `the first view switched to body ${otherBody.model * otherBody.base}: the two views differ in ${bothViewsSameBody.dotsUnlike} of ${bothViewsSameBody.secondModelDots} dots`,
);
// the first view back on its own body, and the second view closed with the key that opened it
await page.selectOption(`#bodies [data-set="pick:${otherBody.bodypart}"]`, String(otherBody.firstViewModel));
await page.waitForTimeout(600);
await pageIdle();
await page.keyboard.press("v");
await page.waitForTimeout(300);
check(
  await inPage(() => document.getElementById("view2").hidden && window.ed.view2.meshes.length === 0),
  "V again closes it",
);

// 2e. a double click on the model: the orbit camera turns and zooms about that point
// The hand's joint: where it is drawn in the view, and where it is in the model's space.
const hand = await inPage(() => {
  const state = window.ed.S;
  const handBone = state.ctx.bones.findIndex((bone) => bone.name === "Bip01 R Hand");
  const handMatrix = state.world[handBone];
  return { onScreen: state.joints[handBone], inWorld: [handMatrix[3], handMatrix[7], handMatrix[11]] };
});
await page.mouse.dblclick(viewBox.x + hand.onScreen[0], viewBox.y + hand.onScreen[1]);
await page.waitForTimeout(300);
camera = await cameraNow();
// The camera's centre is now on the model's surface near the hand, away from where it was, and the status
// line says what happened.
const centreFromHand = Math.hypot(...camera.target.map((value, axis) => value - hand.inWorld[axis]));
const centreFromMiddle = Math.hypot(...camera.target.map((value, axis) => value - startCamera.target[axis]));
check(
  centreFromHand < 8 &&
    centreFromMiddle > 1 &&
    /turns about the point under the mouse/.test(await statusLine()),
  `a double click on the hand: the camera turns about a point ${centreFromHand.toFixed(1)} units from the hand's joint, ${centreFromMiddle.toFixed(1)} from the model's middle (${await statusLine()})`,
);
// Zooming in keeps that point in the middle of the view (its place on screen as a share of the view's size).
for (let turn = 0; turn < 6; turn++) await page.mouse.wheel(0, -150);
await page.waitForTimeout(300);
const centreOnScreen = await inPage(() => {
  const view = window.ed.view;
  const onScreen = view.project(view.cam.target);
  return { x: onScreen[0] / view.cssW, y: onScreen[1] / view.cssH, dist: view.cam.dist };
});
check(
  Math.abs(centreOnScreen.x - 0.5) < 0.01 &&
    Math.abs(centreOnScreen.y - 0.5) < 0.01 &&
    centreOnScreen.dist < startCamera.dist * 0.5,
  `zoomed in to ${centreOnScreen.dist.toFixed(1)} units, that point is still in the middle of the view`,
);
await picture("02f_orbit_about_the_hand");
// A double click where there is no model (the first corner of the view under which the page picks nothing)
// puts the centre and the distance back where they were.
const emptyCorner = await inPage(() => {
  const view = window.ed.view;
  for (const [x, y] of [
    [8, 8],
    [view.cssW - 8, 8],
    [8, view.cssH - 8],
    [view.cssW - 8, view.cssH - 8],
  ])
    if (view.pick(x, y) < 0) return [x, y];
  return null;
});
await page.mouse.dblclick(viewBox.x + emptyCorner[0], viewBox.y + emptyCorner[1]);
await page.waitForTimeout(300);
camera = await cameraNow();
check(
  Math.hypot(...camera.target.map((value, axis) => value - startCamera.target[axis])) < 1e-6 &&
    Math.abs(camera.dist - startCamera.dist) < 1e-6,
  `a double click beside the model: about its middle again (${await statusLine()})`,
);
// the camera as it was at the start of 2b, and the forearm chosen again, for the steps that follow
await inPage((startCam) => {
  Object.assign(window.ed.view.cam, startCam);
  window.ed.ACT.bone(window.ed.S.ctx.bones.findIndex((bone) => bone.name === "Bip01 R Forearm"));
}, startCamera);
await page.waitForTimeout(300);

// 3. thin the keys
// The Animation tab's thinning, within half a degree and 0.02 units. This is the page's first edit: it makes
// the project file. The keys it leaves are kept, to compare with after the undo in step 5.
await page.click('[data-act="tab:anim"]');
await page.fill("#thinRot", "0.5");
await page.fill("#thinPos", "0.02");
await page.click('[data-act="thin"]');
await pageIdle();
const thinNote = await inPage(() => window.ed.S.thinNote);
check(/keys to/.test(thinNote), `thinned in the page: ${thinNote}`);
await picture("03_keys_thinned");
const thinnedKeys = JSON.stringify(projectOnDisk().anims[2].keys);

// 4. a bone turned at a frame with the mouse on a ring
await page.click('[data-act="tab:pose"]');
await inPage(() => window.ed.go(12));
await page.waitForTimeout(300);
// The gizmo as the page drew it: its centre on screen, and a point (the seventh) of its third part, the blue
// ring, to take hold of.
const ring = await inPage(() => {
  const gizmo = window.ed.S.giz;
  return { centre: gizmo.sc, handle: gizmo.parts[2][6] };
});
const startAngle = Math.atan2(ring.handle[1] - ring.centre[1], ring.handle[0] - ring.centre[0]);
const ringRadius = Math.hypot(ring.handle[0] - ring.centre[0], ring.handle[1] - ring.centre[1]);
// the mouse taken along the ring in twelve steps of 0.05 radians, with a picture while the button is down
await page.mouse.move(viewBox.x + ring.handle[0], viewBox.y + ring.handle[1]);
await page.mouse.down();
for (let step = 1; step <= 12; step++) {
  const angle = startAngle + step * 0.05;
  await page.mouse.move(
    viewBox.x + ring.centre[0] + Math.cos(angle) * ringRadius,
    viewBox.y + ring.centre[1] + Math.sin(angle) * ringRadius,
  );
}
await page.waitForTimeout(150);
await picture("04a_ring_being_dragged");
await page.mouse.up();
await pageIdle();
// Letting go wrote a key for the forearm at frame 12 into the project file.
const posedProject = projectOnDisk();
const forearmKey = posedProject.anims[2].keys["Bip01 R Forearm"]["12"];
check(
  Boolean(forearmKey) && JSON.stringify(posedProject.anims[2].keys) !== thinnedKeys,
  `the drag set a key in the project file: Bip01 R Forearm at 12 = ${forearmKey?.map((value) => +value.toFixed(3)).join(" ")}; ${await statusLine()}`,
);
await page.check("#showOnion");
await picture("04b_bone_posed_with_onion");
await page.uncheck("#showOnion");

// 5. undo and redo
await page.keyboard.press("Control+z");
await pageIdle();
check(
  JSON.stringify(projectOnDisk().anims[2].keys) === thinnedKeys,
  `undo put the project's keys back exactly (${await statusLine()})`,
);
await picture("05_undone");
await page.keyboard.press("Control+y");
await pageIdle();
check(
  JSON.stringify(projectOnDisk().anims[2].keys["Bip01 R Forearm"]["12"]) === JSON.stringify(forearmKey),
  "redo set the key again",
);

// 5b. play; the bone moved along an arrow; a pose copied and pasted at another frame
// Space starts playing and Space stops: 0.4 s in, the frame has gone on from 12.
await page.keyboard.press("Space");
await page.waitForTimeout(400);
const frameWhilePlaying = await inPage(() => window.ed.S.frame);
await page.keyboard.press("Space");
check(frameWhilePlaying > 12.5, `Space plays: after 0.4 s the frame is ${frameWhilePlaying.toFixed(1)}`);
// G turns the gizmo into arrows. The third part is now the blue arrow (z): its first two points are its tail
// and its tip. The tip is dragged a quarter of the arrow's length further out.
await inPage(() => window.ed.go(12));
await page.keyboard.press("g");
await page.waitForTimeout(200);
const blueArrow = await inPage(() => {
  const gizmo = window.ed.S.giz;
  return { tail: gizmo.parts[2][0], tip: gizmo.parts[2][1] };
});
await page.mouse.move(viewBox.x + blueArrow.tip[0], viewBox.y + blueArrow.tip[1]);
await page.mouse.down();
await page.mouse.move(
  viewBox.x + blueArrow.tip[0] + (blueArrow.tip[0] - blueArrow.tail[0]) * 0.25,
  viewBox.y + blueArrow.tip[1] + (blueArrow.tip[1] - blueArrow.tail[1]) * 0.25,
  { steps: 5 },
);
await page.mouse.up();
await pageIdle();
// A key's six numbers are x, y, z and three angles: z has changed and x has not.
const slidKey = projectOnDisk().anims[2].keys["Bip01 R Forearm"]["12"];
check(
  Math.abs(slidKey[2] - forearmKey[2]) > 0.2 && Math.abs(slidKey[0] - forearmKey[0]) < 1e-6,
  `the blue arrow moved the bone along z alone: ${forearmKey[2]} to ${+slidKey[2].toFixed(3)} (${await statusLine()})`,
);
// The move undone, the gizmo back to rings (R), then the whole pose of frame 12 copied and pasted at frame
// 40: every bone of the page's baked frame 40 then has the matrix it has at frame 12.
await page.keyboard.press("Control+z");
await pageIdle();
await page.keyboard.press("r");
await page.keyboard.press("Control+c");
await inPage(() => window.ed.go(40));
await page.keyboard.press("Control+v");
await pageIdle();
const pasteDifference = await inPage(() =>
  Math.max(
    ...window.ed.S.frames[40].flatMap((boneValues, bone) => {
      const pastedMatrix = window.ed.core.matOf(boneValues);
      const copiedMatrix = window.ed.core.matOf(window.ed.S.frames[12][bone]);
      return pastedMatrix.map((value, index) => Math.abs(value - copiedMatrix[index]));
    }),
  ),
);
check(
  pasteDifference < 1e-5,
  `the pose of frame 12 pasted at frame 40: the two differ by ${pasteDifference.toExponential(1)} at most (${await statusLine()})`,
);
await page.keyboard.press("Control+z");
await pageIdle();
await inPage(() => window.ed.go(12));

// 6. an event added on the timeline, its text changed, moved by dragging
// Where a frame is on the timeline's track: the track has 10 dots of margin either side and attack1's 56
// frames share the rest. The events' row is 30 dots down.
const trackBox = await page.locator("#track").boundingBox();
const frameX = (frame) => trackBox.x + 10 + ((frame + 0.5) * (trackBox.width - 20)) / 56;
// a double click at frame 9 adds an event; its text typed in the list; then dragged to frame 14 in two moves
await page.mouse.dblclick(frameX(9), trackBox.y + 30);
await pageIdle();
await page.fill('[data-ev="0:options"]', "weapons/swingsmall.wav");
await page.keyboard.press("Tab");
await pageIdle();
await page.mouse.move(frameX(9), trackBox.y + 30);
await page.mouse.down();
await page.mouse.move(frameX(12), trackBox.y + 30, { steps: 4 });
await page.mouse.move(frameX(14), trackBox.y + 30, { steps: 4 });
await page.mouse.up();
await pageIdle();
check(
  JSON.stringify(projectOnDisk().anims[2].events) ===
    JSON.stringify([{ frame: 14, event: 5004, type: 0, options: "weapons/swingsmall.wav" }]),
  `the event in the project: ${JSON.stringify(projectOnDisk().anims[2].events)}`,
);
await picture("06_event_added_and_moved");

// 6b. a key that cannot be moved: the drag ends, the line at the top says why, and the page's code does not
// throw. No drag of the mouse ends so (the track only takes hold of a key that is there), so the drag is put
// into the page's state as the track would have left it, from a frame the animation has not, and let go.
const pageErrorsBefore = pageErrors;
await inPage(() => {
  window.ed.S.trackDrag = { kind: "key", from: 9999, to: 3 };
  document.getElementById("track").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.waitForTimeout(300);
await pageIdle();
check(
  pageErrors === pageErrorsBefore &&
    /has frames 0 to 55, not 9999/.test(await statusLine()) &&
    (await inPage(() => document.getElementById("status").className)) === "bad",
  `a key that cannot be moved is said in the line at the top, and nothing is thrown: ${await statusLine()}`,
);

// 7. a texture replaced from a file, then adjusted
// The picture to drop: the sword's own texture with a chequer of 16-dot squares painted reddish over it.
// The dot at (8, 8) is in a painted square and the dot at (24, 8) in an unpainted one: 7g relies on that.
const swordTexture = smak.textureOf(SOURCE_BYTES, "sword_lab.bmp");
const paintedRgba = smak.rgbaOf(swordTexture);
for (let y = 0; y < swordTexture.height; y++)
  for (let x = 0; x < swordTexture.width; x++) {
    const offset = (y * swordTexture.width + x) * 4;
    if ((x >> 4) % 2 === (y >> 4) % 2) {
      paintedRgba[offset] = Math.min(255, paintedRgba[offset] * 0.5 + 120);
      paintedRgba[offset + 1] *= 0.55;
      paintedRgba[offset + 2] *= 0.5;
    }
  }
const PAINTED_PNG = join(OUT, "painted.png");
writeFileSync(PAINTED_PNG, smak.png(swordTexture.width, swordTexture.height, paintedRgba));
// in the Textures tab, the sword's texture chosen and the picture given to the file input
await page.click("#camFirst");
await inPage(() => window.ed.go(12));
await page.click('[data-act="tab:textures"]');
await page.selectOption(
  '[data-set="tex"]',
  String(smak.readMdl(SOURCE_BYTES).textures.findIndex((texture) => texture.name === "sword_lab.bmp")),
);
await page.setInputFiles("#texFile", PAINTED_PNG);
await pageIdle();
await page.waitForTimeout(600);
check(
  /sword_lab/.test(projectOnDisk().textures["55"]?.file ?? ""),
  `the texture's replacement in the project: ${projectOnDisk().textures["55"]?.file}`,
);
await picture("07a_texture_replaced");
// the hue slider put at 150, and the picture taken with the UV lines shown over the texture
await setSlider("hue", 150);
await pageIdle();
await page.check('[data-set="uv"]');
await page.waitForTimeout(900);
await picture("07b_texture_adjusted_with_uv");
check(
  projectOnDisk().textures["55"].adjust?.hue === 150,
  `the adjustment in the project: ${JSON.stringify(projectOnDisk().textures["55"].adjust)}`,
);

// 7c. a slider from the keyboard, a value typed beside it, the tint by its hex digits; one change is one line
// of the log Each adjustment has a slider ([data-adj]) and a number box beside it ([data-num]); the tint has
// a colour box ([data-adj="tint"]) and a box for its hex digits ([data-hex]).
/** The texture's adjustments as the project file has them now. */
const adjustments = () => projectOnDisk().textures["55"].adjust ?? {};
/** What a control of the page holds now. */
const valueIn = (selector) => page.locator(selector).inputValue();
/** Which control has the keyboard: the name of the adjustment it is for, or its tag. */
const focusedControl = () =>
  inPage(() => document.activeElement?.dataset.adj ?? document.activeElement?.tagName);
await page.uncheck('[data-set="uv"]');
await inPage(() => window.ed.go(12));
const frameBefore = await inPage(() => window.ed.S.frame);
// Right three times with the brightness slider focused: the slider, the number beside it and the project all
// say 3. The arrow keys did not move the timeline, and the slider still has the keyboard after the page
// redrew.
await page.focus('[data-adj="brightness"]');
for (let press = 0; press < 3; press++) {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(80);
}
await pageIdle();
await page.waitForTimeout(200);
check(
  (await valueIn('[data-adj="brightness"]')) === "3" &&
    (await valueIn('[data-num="brightness"]')) === "3" &&
    adjustments().brightness === 3,
  `Right three times on the brightness slider: it stands at ${await valueIn('[data-adj="brightness"]')}, the number beside it says ${await valueIn('[data-num="brightness"]')}, the project ${adjustments().brightness}`,
);
check(
  (await inPage(() => window.ed.S.frame)) === frameBefore && (await focusedControl()) === "brightness",
  `the timeline stayed at frame ${await inPage(() => window.ed.S.frame)} and the slider kept the keyboard (${await focusedControl()})`,
);
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowDown");
await pageIdle();
await page.waitForTimeout(200);
check(
  (await valueIn('[data-adj="brightness"]')) === "1" &&
    adjustments().brightness === 1 &&
    (await inPage(() => window.ed.S.frame)) === frameBefore,
  `Left and Down take it back to ${await valueIn('[data-adj="brightness"]')} (the project: ${adjustments().brightness}); the frame is still ${await inPage(() => window.ed.S.frame)}`,
);
// With nothing focused the same key steps the timeline.
await inPage(() => document.activeElement.blur());
await page.keyboard.press("ArrowRight");
check(
  (await inPage(() => window.ed.S.frame)) === frameBefore + 1,
  `with no slider held, Right is the timeline's again: frame ${await inPage(() => window.ed.S.frame)}`,
);
// A number typed in the box beside a slider: the slider follows as it is typed (read before Enter), and Enter
// writes it to the project.
await inPage(() => window.ed.go(12));
await page.fill('[data-num="contrast"]', "-25");
const sliderWhileTyping = await valueIn('[data-adj="contrast"]');
await page.keyboard.press("Enter");
await pageIdle();
await page.waitForTimeout(200);
check(
  sliderWhileTyping === "-25" &&
    (await valueIn('[data-adj="contrast"]')) === "-25" &&
    adjustments().contrast === -25,
  `-25 typed beside the contrast slider: the slider followed at once (${sliderWhileTyping}) and the project has ${adjustments().contrast}`,
);
// A number past the slider's end is brought back to the end, in the box, the slider and the project.
await page.fill('[data-num="saturation"]', "400");
await page.keyboard.press("Tab");
await pageIdle();
await page.waitForTimeout(200);
check(
  (await valueIn('[data-num="saturation"]')) === "100" &&
    (await valueIn('[data-adj="saturation"]')) === "100" &&
    adjustments().saturation === 100,
  `400 typed for colour is kept within the slider's range: ${await valueIn('[data-num="saturation"]')}`,
);
// saturation back to 0, the tint's amount to 40, and the tint's colour typed as hex digits
await page.fill('[data-num="saturation"]', "0");
await page.keyboard.press("Enter");
await pageIdle();
await page.fill('[data-num="tintAmount"]', "40");
await page.keyboard.press("Enter");
await pageIdle();
await page.fill("[data-hex]", "#c08040");
await page.keyboard.press("Enter");
await pageIdle();
await page.waitForTimeout(200);
check(
  (await valueIn('[data-adj="tint"]')) === "#c08040" && JSON.stringify(adjustments().tint) === "[192,128,64]",
  `#c08040 typed for the tint: the colour box has ${await valueIn('[data-adj="tint"]')}, the project ${JSON.stringify(adjustments().tint)}`,
);
// A "change" from the colour box when its colour is the one the project has writes nothing.
let revision = projectOnDisk().rev;
await page.dispatchEvent('[data-adj="tint"]', "change");
await page.dispatchEvent('[data-adj="tint"]', "change");
await page.waitForTimeout(300);
await pageIdle();
check(
  projectOnDisk().rev === revision,
  `the colour box closed twice with nothing changed writes nothing (revision ${projectOnDisk().rev})`,
);
// A new colour in the colour box (fill tells the page once, the dispatched "change" a second time) is one
// revision and one line of the log, and the hex box follows.
await page.fill('[data-adj="tint"]', "#a06030");
await page.dispatchEvent('[data-adj="tint"]', "change");
await page.waitForTimeout(300);
await pageIdle();
check(
  projectOnDisk().rev === revision + 1 &&
    projectOnDisk().log.filter((line) => /tint 160,96,48/.test(line.what)).length === 1 &&
    (await valueIn("[data-hex]")) === "#a06030",
  `one change of the tint colour, told twice by the browser, is one line of the log (revision ${revision} to ${projectOnDisk().rev}); the hex box says ${await valueIn("[data-hex]")}`,
);
await page.waitForTimeout(700);
await picture("07c_sliders_by_keys_numbers_and_hex");

// 7d. a run of key presses on one slider: the picture follows every press, the project is written once, when
// the keys stop
/** The lines of the project's log written after a revision. */
const logSince = (afterRevision) => projectOnDisk().log.filter((line) => line.rev > afterRevision);
await page.focus('[data-adj="contrast"]');
revision = projectOnDisk().rev;
for (let press = 0; press < 8; press++) {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);
}
await page.waitForTimeout(250);
// A quarter of a second after the last press the run is still open (S.keying): the slider and the number are
// at -17 (eight up from -25), the texture's picture is the server's trial of contrast -17 (the adjustment is
// in the picture's address), and nothing has been written yet.
const midRun = {
  revision: projectOnDisk().rev,
  slider: await valueIn('[data-adj="contrast"]'),
  number: await valueIn('[data-num="contrast"]'),
  keying: await inPage(() => window.ed.S.keying),
  pictureAddress: decodeURIComponent(await inPage(() => document.getElementById("texImg")?.src ?? "")),
};
check(
  midRun.revision === revision &&
    midRun.keying &&
    midRun.slider === "-17" &&
    midRun.number === "-17" &&
    /"contrast":-17/.test(midRun.pictureAddress),
  `eight presses of Right on the contrast slider, a quarter of a second after the last: it stands at ${midRun.slider}, the picture shown is tried with contrast ${/"contrast":(-?\d+)/.exec(midRun.pictureAddress)?.[1]}, and the project is still at revision ${midRun.revision}`,
);
// Once the page has closed the run: one revision, one line of the log, and the slider still has the keyboard.
await pageIdle();
await page.waitForTimeout(200);
check(
  projectOnDisk().rev === revision + 1 &&
    logSince(revision).length === 1 &&
    /contrast -17/.test(logSince(revision)[0]?.what) &&
    adjustments().contrast === -17 &&
    (await focusedControl()) === "contrast",
  `when the keys stop, one revision and one line of the log: "${logSince(revision)
    .map((line) => line.what)
    .join('" | "')}"; the slider kept the keyboard (${await focusedControl()})`,
);
// Three presses with no pause, then the slider left: the run ends there and then, without waiting for the
// keys to have stopped for a while, and is one revision.
revision = projectOnDisk().rev;
for (let press = 0; press < 3; press++) await page.keyboard.press("ArrowLeft");
await inPage(() => document.activeElement.blur());
check((await inPage(() => window.ed.S.keying)) === false, "leaving the slider ends the run at once");
await pageIdle();
await page.waitForTimeout(200);
check(
  projectOnDisk().rev === revision + 1 && logSince(revision).length === 1 && adjustments().contrast === -20,
  `three presses and the slider left: one revision more (contrast ${adjustments().contrast})`,
);
// One undo is the whole run of three, not one press of it. Redone, contrast is -20 again for what follows.
await page.keyboard.press("Control+z");
await pageIdle();
check(
  adjustments().contrast === -17,
  `one undo takes the whole run back: contrast ${adjustments().contrast}`,
);
await page.keyboard.press("Control+y");
await pageIdle();

// 7e. pictures dropped on one texture again and again: the files the project no longer names are tidied away,
// but for the last eight, and undo still finds its picture
const textureFolder = join(OUT, "v_1hswords.tex");
/** The replacement pictures of texture 55 that are in the project's folder now. */
const replacementFiles = () => readdirSync(textureFolder).filter((name) => name.startsWith("55_"));
/** The server's answer (its HTTP status) when asked for texture 55 as the project has it. */
const textureAnswer = async () =>
  (await fetch(`http://127.0.0.1:${PORT}/api/texture?model=${MODEL}&i=55`)).status;
// the file named after each drop, the first being the one from step 7: twelve in all after eleven more drops
const droppedFiles = [projectOnDisk().textures["55"].file];
for (let drop = 0; drop < 11; drop++) {
  const revisionBeforeDrop = projectOnDisk().rev;
  await page.setInputFiles("#texFile", PAINTED_PNG);
  await waitInPage("the dropped picture", (earlier) => window.ed.S.project.rev > earlier, revisionBeforeDrop);
  await pageIdle();
  droppedFiles.push(projectOnDisk().textures["55"].file);
}
// Every drop got a file name of its own; nine files are left; they are the newest nine, and the three oldest
// are gone.
check(
  new Set(droppedFiles).size === 12 &&
    replacementFiles().length === 9 &&
    droppedFiles.slice(3).every((file) => existsSync(join(OUT, file))) &&
    !droppedFiles.slice(0, 3).some((file) => existsSync(join(OUT, file))),
  `12 pictures dropped on sword_lab.bmp, one after another: ${replacementFiles().length} files in v_1hswords.tex (the one the project names and the ${replacementFiles().length - 1} before it); the 3 oldest are gone`,
);
// Each of three undos names the picture before, that file is still on disk, and the server can draw it.
let everyUndoFoundItsFile = true;
for (let undo = 1; undo <= 3; undo++) {
  await page.keyboard.press("Control+z");
  await pageIdle();
  const namedFile = projectOnDisk().textures["55"].file;
  everyUndoFoundItsFile &&=
    namedFile === droppedFiles[11 - undo] &&
    existsSync(join(OUT, namedFile)) &&
    (await textureAnswer()) === 200;
}
check(
  everyUndoFoundItsFile && replacementFiles().length === 9,
  `undo three times: the project names ${projectOnDisk().textures["55"].file} again, the file is there and the texture is drawn from it; nothing was removed by undoing (${replacementFiles().length} files)`,
);
for (let redo = 0; redo < 3; redo++) {
  await page.keyboard.press("Control+y");
  await pageIdle();
}
check(
  projectOnDisk().textures["55"].file === droppedFiles[11] &&
    projectOnDisk().textures["55"].adjust?.contrast === -20,
  `redo three times: back on the newest (${projectOnDisk().textures["55"].file}), the adjustments untouched`,
);
await picture("07e_after_twelve_pictures");

// 7f. a replaced picture with adjustments on top: said in the tab, with the way out beside it, and the
// picture offered without them
/** A PNG fetched from the server and read by smak: { width, height, rgba }. */
const fetchPng = async (url) => smak.unpng(Buffer.from(await (await fetch(url)).arrayBuffer()));
/** Where a link of the page leads. */
const linkOf = (selector) => inPage((css) => document.querySelector(css)?.href, selector);
/** The server's address for texture 55 as a PNG, as the project has it now. */
const textureUrl = (extra = "") => `http://127.0.0.1:${PORT}/api/texture?model=${MODEL}&i=55&as=png${extra}`;
/** In how many dots two pictures of the same size differ in colour. */
const dotsUnlike = (pictureA, pictureB) => {
  let count = 0;
  for (let offset = 0; offset < pictureA.rgba.length; offset += 4)
    if (
      pictureA.rgba[offset] !== pictureB.rgba[offset] ||
      pictureA.rgba[offset + 1] !== pictureB.rgba[offset + 1] ||
      pictureA.rgba[offset + 2] !== pictureB.rgba[offset + 2]
    )
      count++;
  return count;
};
// The tab has a line (#onTop) that says the picture was replaced and has adjustments on top, and names them;
// in the line, one "No adjustments" button.
check(
  /adjustments on top \(.*hue 150/.test(await page.locator("#onTop").innerText()) &&
    (await page.locator('#onTop [data-act="texReset"]').count()) === 1,
  `the Textures tab says: "${(await page.locator("#onTop").innerText()).slice(0, 110)}..."`,
);
// The tab's two export links fetched: "Export PNG" (the picture with its adjustments) and "PNG without
// adjustments" (#exportPlain). They are different pictures.
const adjustedPng = await fetchPng(await linkOf('#pane a[href*="as=png"]:not(#exportPlain)'));
const plainPng = await fetchPng(await linkOf("#exportPlain"));
check(
  dotsUnlike(adjustedPng, plainPng) > 1000,
  `"PNG without adjustments" is offered beside Export PNG, and ${dotsUnlike(adjustedPng, plainPng)} of its ${plainPng.width * plainPng.height} dots are not the adjusted picture's`,
);
// A picture dropped while adjustments stand: the status line warns that they still apply on top of it.
revision = projectOnDisk().rev;
await page.setInputFiles("#texFile", PAINTED_PNG);
await waitInPage("the project's next revision", (earlier) => window.ed.S.project.rev > earlier, revision);
await pageIdle();
check(
  /still apply on top of the new picture/.test(await statusLine()),
  `a picture dropped while adjustments stand: ${await statusLine()}`,
);
await picture("07f_replaced_with_adjustments_on_top");
// "No adjustments" in that line: the line and the second link go, the project has no adjustments for the
// texture, and the server's PNG is now, dot for dot, the picture "without adjustments" was.
await page.click('#onTop [data-act="texReset"]');
await pageIdle();
const clearedPng = await fetchPng(textureUrl());
check(
  (await page.locator("#onTop").count()) === 0 &&
    (await page.locator("#exportPlain").count()) === 0 &&
    !projectOnDisk().textures["55"].adjust &&
    dotsUnlike(clearedPng, plainPng) === 0,
  `"No adjustments" beside the line: the line and the second export are gone, and Export PNG now gives the picture that "without adjustments" gave (${dotsUnlike(clearedPng, plainPng)} dots apart)`,
);
await page.keyboard.press("Control+z");
await pageIdle();
check(
  projectOnDisk().textures["55"].adjust?.hue === 150 && (await page.locator("#onTop").count()) === 1,
  "undo puts the adjustments back, and the line",
);

// 7g. the adjustments for chosen colours only: a click on the picture chooses, a slider says how like, and
// the inverse
const wholePictureAdjustments = JSON.stringify(adjustments()); // as they are before any colour is chosen
const imageBox = await page.locator("#texImg").boundingBox();
/** Where a dot of the texture is on the picture the tab shows, which is drawn larger than the texture. */
const placeOnImage = (x, y) => ({
  x: ((x + 0.5) / swordTexture.width) * imageBox.width,
  y: ((y + 0.5) / swordTexture.height) * imageBox.height,
});
/** The colour of one dot of a picture, as "r,g,b". */
const colourAt = (png, x, y) =>
  [...png.rgba.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)].join();
// A click on the picture at dot (8, 8), a painted square. One revision; the project's selection is that dot's
// colour in the unadjusted picture with the tolerance 20; the tab's line (#selLine) shows the colour; the
// picture is now shown as a mask; the status line counts the colours taken.
revision = projectOnDisk().rev;
await page.locator("#texImg").click({ position: placeOnImage(8, 8) });
await waitInPage("the project's next revision", (earlier) => window.ed.S.project.rev > earlier, revision);
await pageIdle();
await page.waitForTimeout(500);
let selection = adjustments().select;
let currentPng = await fetchPng(textureUrl());
check(
  selection?.tolerance === 20 &&
    selection.colour.join() === colourAt(plainPng, 8, 8) &&
    projectOnDisk().rev === revision + 1 &&
    (await inPage(() => document.getElementById("selLine").dataset.pick)) === selection.colour.join() &&
    /mask=1/.test(await inPage(() => document.getElementById("texImg").src)) &&
    /colours the picture uses/.test(await statusLine()),
  `a click on a painted square of the picture chose its colour, ${selection?.colour}: ${await statusLine()}`,
);
// In the server's PNG the painted square is adjusted, the unpainted square beside it is as in the plain
// picture, and fewer dots are changed than when the adjustments applied to the whole picture.
check(
  colourAt(currentPng, 8, 8) !== colourAt(plainPng, 8, 8) &&
    colourAt(currentPng, 24, 8) === colourAt(plainPng, 24, 8) &&
    dotsUnlike(currentPng, plainPng) < dotsUnlike(adjustedPng, plainPng),
  `the painted squares are adjusted (${colourAt(plainPng, 8, 8)} to ${colourAt(currentPng, 8, 8)}) and the unpainted left alone (${colourAt(currentPng, 24, 8)}): ${dotsUnlike(currentPng, plainPng)} dots changed where the whole picture's adjustment changed ${dotsUnlike(adjustedPng, plainPng)}`,
);
await picture("07g_adjustments_for_chosen_colours");
// "how like" (the tolerance) brought down from 20 to 4: fewer dots change, the clicked one still does.
const changedAtTolerance20 = dotsUnlike(currentPng, plainPng);
await setSlider("tolerance", 4);
await pageIdle();
currentPng = await fetchPng(textureUrl());
check(
  adjustments().select.tolerance === 4 &&
    (await valueIn('[data-num="tolerance"]')) === "4" &&
    dotsUnlike(currentPng, plainPng) < changedAtTolerance20 &&
    colourAt(currentPng, 8, 8) !== colourAt(plainPng, 8, 8),
  `"how like" brought down to 4: ${dotsUnlike(currentPng, plainPng)} dots changed where 20 changed ${changedAtTolerance20}`,
);
// Back at 20 and "every colour but those" ticked: now the painted square is left alone and the unpainted one
// is adjusted.
await page.fill('[data-num="tolerance"]', "20");
await page.keyboard.press("Enter");
await pageIdle();
await page.check('[data-adj="invert"]');
await pageIdle();
currentPng = await fetchPng(textureUrl());
selection = adjustments().select;
check(
  selection.invert === true &&
    selection.tolerance === 20 &&
    colourAt(currentPng, 8, 8) === colourAt(plainPng, 8, 8) &&
    colourAt(currentPng, 24, 8) !== colourAt(plainPng, 24, 8),
  `the inverse: the painted squares are left alone (${colourAt(currentPng, 8, 8)}) and the rest adjusted (${colourAt(plainPng, 24, 8)} to ${colourAt(currentPng, 24, 8)}); in the project ${JSON.stringify(selection)}`,
);
await picture("07g_the_inverse");
// "All colours" drops the selection and nothing else: the adjustments are what they were before the click.
await page.click('[data-act="selAll"]');
await pageIdle();
check(
  JSON.stringify(adjustments()) === wholePictureAdjustments &&
    (await page.locator("#selLine[data-pick]").count()) === 0,
  `"All colours": the project's adjustments are what they were, ${JSON.stringify(adjustments())}`,
);

// 7h. hex digits that cannot be read: said in the status line, nothing written, and not the shorter colour
// read on the way "#fa0x" is typed letter by letter; after the fourth letter the box held "#fa0", which is a
// colour. The colour box is read before Enter (for the message only). After Enter: the status line says so in
// its "bad" style, the project's revision and tint are untouched, and both boxes show the project's tint
// again.
revision = projectOnDisk().rev;
await page.fill("[data-hex]", "");
await page.type("[data-hex]", "#fa0x");
const colourBoxOnTheWay = await valueIn('[data-adj="tint"]');
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await pageIdle();
check(
  /"#fa0x" is not a colour/.test(await statusLine()) &&
    (await inPage(() => document.getElementById("status").className)) === "bad" &&
    projectOnDisk().rev === revision &&
    JSON.stringify(adjustments().tint) === "[160,96,48]" &&
    (await valueIn("[data-hex]")) === "#a06030" &&
    (await valueIn('[data-adj="tint"]')) === "#a06030",
  `"#fa0x" typed for the tint (the colour box read #fa0 on the way: ${colourBoxOnTheWay}): the line at the top says "${await statusLine()}", the boxes are back at ${await valueIn("[data-hex]")} and the project is untouched (revision ${projectOnDisk().rev})`,
);

// 8. save, and what smak reads back from the saved model
// Ctrl+S bakes the project and writes the model; S.saved is the server's report: where it wrote, how many
// bytes, and what smak's check said.
await page.keyboard.press("Control+s");
await waitInPage("the model to be saved", () => window.ed.S.saved, null, 60000);
await picture("08_saved_and_checked");
const saveReport = await inPage(() => window.ed.S.saved);
const savedModel = readFileSync(saveReport.out);
check(
  saveReport.errors.length === 0,
  `saved ${saveReport.out}: ${saveReport.bytes} bytes, ${saveReport.errors.length} errors, ${saveReport.warnings.length} warnings for ${saveReport.engine}`,
);
// The saved file read by the kit, not by the editor: the event of step 6 is in it,
check(
  JSON.stringify(smak.events(savedModel, "attack1")) ===
    JSON.stringify([{ frame: 14, event: 5004, type: 0, options: "weapons/swingsmall.wav" }]),
  `smak's events() on the saved model: ${JSON.stringify(smak.events(savedModel, "attack1"))}`,
);
// its animations have the source's names in the source's order, and the source file is byte for byte what it
// was when the test began.
check(
  smak
    .sequences(savedModel)
    .map((sequence) => sequence.name)
    .join() ===
    smak
      .sequences(SOURCE_BYTES)
      .map((sequence) => sequence.name)
      .join() && readFileSync(join(MODELS, MODEL)).equals(SOURCE_BYTES),
  "the animations are in their order and the source file is untouched",
);
// A picture to look at: six frames of the swing from the eye, the original above and the saved below.
const stripOptions = {
  seq: 2,
  view: "first",
  body: BODY,
  from: 4,
  to: 19,
  count: 6,
  cols: 6,
  width: 300,
  height: 225,
};
const originalStrip = smak.strip(SOURCE_BYTES, stripOptions);
const savedStrip = smak.strip(savedModel, stripOptions);
const stacked = {
  width: originalStrip.width,
  height: originalStrip.height * 2,
  rgba: new Uint8Array(originalStrip.rgba.length * 2),
};
stacked.rgba.set(originalStrip.rgba, 0);
stacked.rgba.set(savedStrip.rgba, originalStrip.rgba.length);
smak.label(stacked, "original", 6, originalStrip.height - 18);
smak.label(stacked, "saved from the page", 6, originalStrip.height * 2 - 18);
writeFileSync(
  join(OUT, "09_strip_original_above_saved_below.png"),
  smak.png(stacked.width, stacked.height, stacked.rgba),
);
console.log(`      ${join(OUT, "09_strip_original_above_saved_below.png")}`);
// The forearm's key of step 4 is in the saved model: at frame 12 some corner of the sword's body is more than
// a unit from where the source has it.
let furthestPoint = 0;
{
  const originalTriangles = smak.posed(SOURCE_BYTES, { seq: 2, frame: 12, body: BODY }).tris;
  const savedTriangles = smak.posed(savedModel, { seq: 2, frame: 12, body: BODY }).tris;
  for (let triangle = 0; triangle < originalTriangles.length; triangle++)
    for (let corner = 0; corner < 3; corner++)
      furthestPoint = Math.max(
        furthestPoint,
        Math.hypot(
          ...originalTriangles[triangle].c[corner].p.map(
            (value, axis) => value - savedTriangles[triangle].c[corner].p[axis],
          ),
        ),
      );
}
check(
  furthestPoint > 1,
  `at frame 12 a point of the saved model is ${furthestPoint.toFixed(2)} units from where the original has it`,
);

// 9. the agent's turn: the command line changes the same project, and the page takes it up
// The page is left on the hand at frame 22, and the hand's six numbers there are read. Then the command line
// turns the hand 35 degrees at that frame, in a process of its own, as an agent would.
await page.click('[data-act="tab:pose"]');
await inPage(() => {
  window.ed.ACT.bone(window.ed.S.ctx.bones.findIndex((bone) => bone.name === "Bip01 R Hand"));
  window.ed.go(22);
});
const handBefore = await inPage(() => window.ed.S.frames[22][window.ed.S.bone].slice());
console.log("      " + runCli("key", "attack1", "Bip01 R Hand", "22", "--rot", "0,35,0"));
// Nothing is done in the page: within 8 s its status line says the project changed from outside, and the
// hand's numbers at frame 22 are no longer what they were.
await waitInPage(
  "the page to take up the change from outside",
  () => /from outside/.test(document.getElementById("status").textContent),
  null,
  8000,
);
await pageIdle();
const handAfter = await inPage(() => window.ed.S.frames[22][window.ed.S.bone].slice());
check(
  handBefore.some((value, index) => Math.abs(value - handAfter[index]) > 0.05),
  `the page shows the agent's key without being asked: ${await statusLine()}`,
);
await page.click('[data-act="tab:save"]');
await picture("10_agents_edit_shown_in_the_page");
// a picture by the command line, the source above the project (its output is printed, nothing is checked)
console.log(
  "      " +
    runCli(
      "strip",
      "-o",
      join(OUT, "11_cli_strip.png"),
      "--anim",
      "attack1",
      "--body",
      String(BODY),
      "--from",
      "12",
      "--to",
      "24",
      "--count",
      "6",
      "--compare",
    ),
);

// 10. a duplicate at the end, made slower
// In the Animation tab: attack1 duplicated as "attack1_slow" (the page goes to the new animation), then
// stretched from 56 frames to 84. In the project it is animation 25 and its event has moved with the stretch,
// from frame 14 to 21.
await page.click('[data-act="tab:anim"]');
await page.fill("#dupName", "attack1_slow");
await page.click('[data-act="dup"]');
await pageIdle();
await page.fill("#aFrames", "84");
await page.click('[data-act="stretch"]');
await pageIdle();
await picture("12_duplicate_stretched");
const finalProject = projectOnDisk();
check(
  finalProject.anims["25"]?.name === "attack1_slow" &&
    finalProject.anims["25"].frames === 84 &&
    finalProject.anims["25"].events[0].frame === 21,
  `animation 25 in the project: ${finalProject.anims["25"]?.name}, ${finalProject.anims["25"]?.frames} frames, its event now at frame ${finalProject.anims["25"]?.events[0].frame}`,
);

// Last, the whole project baked by the command line for the stricter engine, beside the project. What it
// prints (the check's findings) is shown indented; a failing check there makes the command, and so this test,
// throw.
console.log(
  "      " +
    runCli("bake", "-o", "v_1hswords.goldsrc.mdl", "--engine", "goldsrc").split("\n").join("\n      "),
);

await finish();
