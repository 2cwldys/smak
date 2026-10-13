// One picture of the editor's page, for looking at it without opening a browser. It opens the page in a
// headless browser, waits for the model, saves a picture, and prints the page's status line and the picture's
// path. It checks one thing: an error thrown by the page's own code, or a page that never has its model, is
// said in a last line and makes the exit code 1 (the picture is still taken when it can be).
//
//   node editor/test/shot.mjs "<query of the page>" [out.png] [port]
//
//   "<query of the page>"   what follows the "?" of the page's address, for instance
//                           "model=v_1hswords.mdl&anim=attack1&frame=12&body=1&tab=textures"
//   out.png                 where the picture goes (unless told: build/editor/shots/page.png of the
//                           checkout the kit is in)
//   port                    the port of an editor server that is already running. Without it the script
//                           starts one of its own on 8197 (or the one SMAK_TEST_PORT names) and stops it at
//                           the end; its projects go to build/editor/projects of that checkout.
//
// From the environment:
//   SMAK_MODELS       the folder of models the server it starts shows (unless told:
//                     run-msc/msc/models/viewmodels of the checkout the kit is in)
//   SMAK_TEST_PORT    the port of the server it starts (8197 unless told)
//   SMAK_PLAYWRIGHT   the package.json of a project that has playwright installed (unless told: the
//                     MasterSwordThreeJS checkout next to this one, as lab/wardrobe/shots.mjs uses)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../serve.mjs";

// playwright is not a dependency of the kit: it is borrowed from another project's node_modules
const require = createRequire(
  process.env.SMAK_PLAYWRIGHT
    ? resolve(process.env.SMAK_PLAYWRIGHT)
    : new URL("../../../../MasterSwordThreeJS/package.json", import.meta.url),
);
const { chromium } = require("playwright");

// ROOT is the checkout the kit lies in (the folder above smak/): what is not told is found under it, as in
// the other tests, whatever folder the command is run in
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OWN_PORT = Number(process.env.SMAK_TEST_PORT ?? 8197);
// how long the page is given to have its model, in milliseconds
const READY_MS = 60000;
const [query = "", picturePath = join(ROOT, "build/editor/shots/page.png"), runningPort] =
  process.argv.slice(2);

// a server of our own, unless the port of a running one was given
const server = runningPort
  ? null
  : await serve(process.env.SMAK_MODELS ?? join(ROOT, "run-msc/msc/models/viewmodels"), {
      port: OWN_PORT,
      work: join(ROOT, "build/editor/projects"),
      engine: "xash",
    });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });

// what is wrong with the page, for the last line and the exit code. An error thrown by the page's own code
// is; what it logs as an error is only printed, so that a blank picture explains itself
const faults = [];
page.on("pageerror", (error) => {
  console.log("page error:", error.message);
  faults.push(`the page threw: ${error.message}`);
});
page.on("console", (message) => {
  if (message.type() === "error") console.log("console:", message.text());
});

// open the page in the state the query names, wait for the model, then a moment more for the textures and the
// first frames to be drawn
await page.goto(`http://127.0.0.1:${runningPort ?? OWN_PORT}/?${query}`);
try {
  await page.waitForFunction(() => window.ed?.S.ready, null, { timeout: READY_MS });
} catch {
  faults.push(`the page had no model after ${READY_MS / 1000} s`);
}
await page.waitForTimeout(1500);

mkdirSync(dirname(resolve(picturePath)), { recursive: true });
await page.screenshot({ path: picturePath });
console.log(await page.evaluate(() => document.getElementById("status")?.textContent ?? ""));
console.log(resolve(picturePath));

await browser.close();
server?.close();
if (faults.length) console.log(`FAILED: ${faults.join("; ")}`);
process.exit(faults.length ? 1 : 0);
