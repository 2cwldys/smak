// A map seen in the game itself: the game is entered, the player walks, turns, speaks, and pictures are taken.
//
//   import { play, maps } from "./smak/src/index.mjs";
//   const driver = play.browserDriver({ url: "http://127.0.0.1:8097/?args=", playwright: "C:/tools/browser" });
//   const run = await play.play({ driver, map: "orchard", out: "work/seen", mod, steps: [
//     { walk: 3000, shot: "walked" },                 // forward for three seconds, then a picture
//     { turn: 90 },                                   // a quarter turn to the left (about: see TURNING)
//     { say: "hail", wait: 3000, shot: "spoken" },    // said as the mod's profile says a thing is said
//   ] });
//   run.pictures;                                     // the PNG files, in the order taken: open them and look
//
// Three parts, kept apart:
//   playOf         a list of steps, as a person or an agent writes them, checked and made plain actions
//   play           the actions run through a DRIVER, and what happened given back. It knows no browser
//   browserDriver  the one driver the kit ships: a browser build of the Xash3D engine, driven with Playwright
//
// What belongs to one game (how its menu is got through, how a thing is said so that an NPC hears it, how long
// a map takes to load) is the `play` field of the mod's profile (maps/mod.mjs), and nothing of it is here.
//
// THE KIT HAS NO DEPENDENCIES, AND THIS KEEPS IT SO. Playwright is the caller's: handed in as the module, or
// found in a folder the caller names (`playwrightFrom`). Without it everything but `browserDriver` works.
//
// WHERE THE FACTS ARE FROM. The engine is Xash3D FWGS built for the browser. A console command is run by the
// engine's own Cmd_ExecuteString (engine/common/cmd.c), called through the page's Emscripten module. A player
// moves while one of the client library's buttons is down: `+forward`, `+back`, `+moveleft`, `+moveright`,
// `+left`, `+right`, `+jump`, `+duck`, `+use`, `+attack`, each let go by the same word with `-` (the SDK's
// cl_dll/input.cpp, InitInput). Typed with no key's number after it, a `+` command is "typed manually at the
// console for continuous down" (KeyDown, same file): the button stays down until its `-` comes. So a walk is
// `+forward`, a wait, `-forward`, whatever keys the person has bound.
//
// TURNING is by time, and only about right. No command of the engine or of the SDK sets the view's angles;
// `+left` turns the view by cl_yawspeed degrees a second (input.cpp, CL_AdjustAngles: 210 unless the person
// changed it), counted frame by frame, and the frames on which the button goes down and comes up count half.
// A turn asked for is therefore out by up to about a frame's worth: 7 degrees at 30 frames a second, more on
// a slow software renderer, and it does not add up over several turns to where it began. Take a picture after
// a turn and look; do not navigate by dead reckoning.
//
// THERE IS NO `goto`. Xash3D FWGS has no command that puts the player at a place (no `setpos`: looked for in
// engine/server/sv_client.c and engine/client/cl_main.c of the engine's source, 2026-10-13). To see a far
// place: walk to it, or `{ command: "sv_cheats 1" }`, `{ command: "noclip" }` and fly, which a listen server
// allows.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { GOLDSRC, modOf } from "./maps/mod.mjs";

/** What a step may do: one of these, or nothing but a wait and a picture. */
const KINDS = ["command", "say", "walk", "turn", "button", "hold", "press", "click"];
/** What a step may hold beside its kind, and which kinds take `ms` and `to`. */
const BESIDE = ["wait", "shot", "ms", "to"];
const TAKES_MS = ["button", "hold"];
/** Where a walk goes, as the client library's buttons name it (the SDK's cl_dll/input.cpp). */
const WALKS = { forward: "forward", back: "back", left: "moveleft", right: "moveright" };
/** Milliseconds waited after a step that does something, unless the step says: a frame or two to show it. */
const PAUSE = 1000;
/** How long a key is held when a `hold` step does not say. */
const HOLD = 1000;
/** Milliseconds between the commands of one step, so that each is taken in a frame of its own. */
const BETWEEN = 150;
/** A map's name and a picture's, as they may be written: nothing a console or a file system minds. */
const MAP_NAME = /^[A-Za-z0-9_][A-Za-z0-9_\-/.]*$/;
const SHOT_NAME = /^[A-Za-z0-9_-]+$/;
const BUTTON_NAME = /^[a-z][a-z0-9_]*$/;
/** What a driver is: every one of these is called by `play`. */
const DRIVER = ["ready", "command", "keyDown", "keyUp", "press", "click", "wait", "shot", "log", "close"];
/**
 * Chromium drawing WebGL in software, so that the pictures are the same on a machine with no graphics card
 * and under a headless browser: the arguments the first map made with the kit was looked at with.
 */
export const SOFTWARE_GL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

const shown = (value) => (value === undefined ? "nothing" : JSON.stringify(value));
const isCount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isText = (value) => typeof value === "string" && value.trim() !== "";

// ── the profile's part ──────────────────────────────────────────────────────
/**
 * What a mod's profile says of playing it, made whole: `{ enter, say, loads, yawspeed, screen }`. A field the
 * profile leaves out is `GOLDSRC`'s; with no profile it is all `GOLDSRC`'s.
 *   enter      the steps that get a player from "the map has loaded" into the game (a menu's clicks); none
 *              for a game that puts the player in by itself
 *   say        how a thing is said: a list of console commands with `{text}` where the words go, or a
 *              function of the text that gives the commands
 *   loads      milliseconds waited after `map <name>` before anything else
 *   yawspeed   the game's cl_yawspeed, in degrees a second: what a `turn` is timed by
 *   screen     `[width, height]` of the page the `enter` steps' clicks were measured on
 */
export function playPartOf(mod) {
  const whole = modOf(mod) ?? GOLDSRC;
  if (
    whole.play !== undefined &&
    (typeof whole.play !== "object" || !whole.play || Array.isArray(whole.play))
  )
    throw new Error(
      `mod: play is an object such as { enter: [], say: ["say {text}"] }, not ${shown(whole.play)}`,
    );
  const part = { ...GOLDSRC.play, ...whole.play };
  if (!Array.isArray(part.enter))
    throw new Error(`mod: play.enter is a list of steps, not ${shown(part.enter)}`);
  const said = typeof part.say === "function" || (Array.isArray(part.say) && part.say.every(isText));
  if (!said)
    throw new Error(
      `mod: play.say is a list of console commands with {text} in them, or a function of the text, not ${shown(part.say)}`,
    );
  if (!isCount(part.loads))
    throw new Error(`mod: play.loads is a number of milliseconds, not ${shown(part.loads)}`);
  if (!(isCount(part.yawspeed) && part.yawspeed > 0))
    throw new Error(`mod: play.yawspeed is degrees a second, over 0, not ${shown(part.yawspeed)}`);
  return part;
}

/** The console commands that say `text` in a game, as its profile's `play.say` has it. */
function sayCommands(part, text, where) {
  // the console ends a command at `;` and at a line's end, and a `"` opens a quoted word: none can be said
  if (!isText(text) || /[;"\r\n]/.test(text))
    throw new Error(
      `play: ${where}: say is the words to say, with no ; and no " and on one line (the console would take them for its own), not ${shown(text)}`,
    );
  const commands =
    typeof part.say === "function"
      ? [part.say(text)].flat()
      : part.say.map((each) => each.replaceAll("{text}", text));
  if (!commands.length || !commands.every(isText))
    throw new Error(
      `mod: play.say gave ${shown(commands)} for ${shown(text)}, where console commands were wanted`,
    );
  return commands;
}

// ── steps into actions ──────────────────────────────────────────────────────
/**
 * A list of steps checked and made plain actions; a wrong step is refused in a sentence that names it.
 *
 * A step is an object with at most one of:
 *   { command: "noclip" }             a console command, or a list of them
 *   { say: "hail" }                   said as the mod's profile says a thing is said (`play.say`)
 *   { walk: 2000 }                    forward for that many milliseconds; `to: "back" | "left" | "right"`
 *   { turn: 90 }                      degrees to the left (under 0: to the right), by time: about right only
 *   { button: "jump", ms: 200 }       one of the game's buttons held: `+jump`, the wait, `-jump`
 *   { hold: "w", ms: 2000 }           a key of the keyboard held (ms: 1000 unless told), as the driver names keys
 *   { press: "Enter" }                a key pressed and let go
 *   { click: [512, 330] }             a click at that place of the page, in its pixels
 * and any step may also carry:
 *   wait: 1500                        milliseconds waited after it (unless told: 1000 after a step that does
 *                                     something, none after one that does not)
 *   shot: "gate"                      a picture taken after the wait: `NN_gate.png`, numbered as taken
 * so `{ wait: 5000 }` only waits and `{ shot: "here" }` only takes a picture.
 *
 * Options: `mod` (the profile: its `play.say` and `play.yawspeed`), `pause` (the wait after a step that does
 * something), `what` (how the list is named in a refusal).
 *
 * Each action is `{ kind, wait, shot, step }` with its own fields: "command" `commands`; "button" `button`,
 * `ms`; "hold" `key`, `ms`; "press" `key`; "click" `x`, `y`; "wait" nothing more. `step` is the step as written.
 */
export function playOf(steps, { mod, pause = PAUSE, what = "step" } = {}) {
  const part = playPartOf(mod);
  if (!Array.isArray(steps))
    throw new Error(
      `play: the steps are a list, such as [{ walk: 2000 }, { shot: "here" }], not ${shown(steps)}`,
    );
  if (!isCount(pause)) throw new Error(`play: pause is a number of milliseconds, not ${shown(pause)}`);
  return steps.map((step, index) => actionOf(step, `${what} ${index + 1}`, part, pause));
}

function actionOf(step, where, part, pause) {
  const refuse = (sentence) => {
    throw new Error(`play: ${where} ${sentence}`);
  };
  if (!step || typeof step !== "object" || Array.isArray(step))
    refuse(
      `is ${shown(step)}: a step is an object, such as { walk: 2000 } or { command: "noclip", shot: "seen" }`,
    );
  const unknown = Object.keys(step).filter((key) => !KINDS.includes(key) && !BESIDE.includes(key));
  if (unknown.length)
    refuse(
      `has ${unknown.join(", ")}, which no step has: a step is one of ${KINDS.join(", ")}, with wait and shot`,
    );
  const kinds = KINDS.filter((kind) => step[kind] !== undefined);
  if (kinds.length > 1) refuse(`has ${kinds.join(" and ")}: one thing a step, the next in a step of its own`);
  const [kind] = kinds;
  if (!kind && step.wait === undefined && step.shot === undefined) refuse(`does nothing: ${shown(step)}`);
  if (step.ms !== undefined && !TAKES_MS.includes(kind))
    refuse("has ms, which goes with hold or button only");
  if (step.to !== undefined && kind !== "walk") refuse("has to, which goes with walk only");
  if (step.wait !== undefined && !isCount(step.wait))
    refuse(`waits ${shown(step.wait)}: wait is a number of milliseconds`);
  if (step.shot !== undefined && !(typeof step.shot === "string" && SHOT_NAME.test(step.shot)))
    refuse(`names its picture ${shown(step.shot)}: letters, digits, _ and - (it becomes a file's name)`);
  const held = (ms, of) =>
    isCount(ms) && ms > 0 ? ms : refuse(`${of} ${shown(ms)}: a number of milliseconds over 0`);

  const action = { kind: kind ?? "wait" };
  if (kind === "command") {
    const commands = [step.command].flat();
    if (!commands.length || !commands.every((each) => isText(each) && !/[\r\n]/.test(each)))
      refuse(
        `gives the command ${shown(step.command)}: a console command, or a list of them, each on one line`,
      );
    action.commands = commands;
  } else if (kind === "say") {
    action.commands = sayCommands(part, step.say, where);
    action.kind = "command";
  } else if (kind === "walk") {
    const to = step.to ?? "forward";
    if (!Object.hasOwn(WALKS, to)) refuse(`walks to ${shown(to)}: ${Object.keys(WALKS).join(", ")}`);
    Object.assign(action, { kind: "button", button: WALKS[to], ms: held(step.walk, "walks for") });
  } else if (kind === "turn") {
    if (!(typeof step.turn === "number" && Number.isFinite(step.turn) && step.turn !== 0))
      refuse(`turns ${shown(step.turn)}: degrees, over 0 to the left and under 0 to the right`);
    // by time: see TURNING at the head of this file
    const ms = Math.max(1, Math.round((Math.abs(step.turn) / part.yawspeed) * 1000));
    Object.assign(action, { kind: "button", button: step.turn > 0 ? "left" : "right", ms });
  } else if (kind === "button") {
    if (!(typeof step.button === "string" && BUTTON_NAME.test(step.button)))
      refuse(
        `holds the button ${shown(step.button)}: a button's name without its +, such as jump, duck, use, attack`,
      );
    Object.assign(action, { button: step.button, ms: held(step.ms, "holds its button for") });
  } else if (kind === "hold") {
    if (!isText(step.hold)) refuse(`holds ${shown(step.hold)}: a key, such as "w" or "Space"`);
    Object.assign(action, { key: step.hold, ms: held(step.ms ?? HOLD, "holds its key for") });
  } else if (kind === "press") {
    if (!isText(step.press)) refuse(`presses ${shown(step.press)}: a key, such as "e" or "Enter"`);
    action.key = step.press;
  } else if (kind === "click") {
    if (!(Array.isArray(step.click) && step.click.length === 2 && step.click.every(isCount)))
      refuse(`clicks ${shown(step.click)}: [x, y], a place of the page in its pixels`);
    [action.x, action.y] = step.click;
  }
  action.wait = step.wait ?? (kind ? pause : 0);
  action.shot = step.shot ?? null;
  action.step = step;
  return action;
}

// ── the run ─────────────────────────────────────────────────────────────────
/** One action done through a driver: what it does, then its wait. A button or a key held is always let go. */
async function act(driver, action) {
  if (action.kind === "command")
    for (const [index, command] of action.commands.entries()) {
      if (index) await driver.wait(BETWEEN);
      await driver.command(command);
    }
  else if (action.kind === "button") {
    await driver.command(`+${action.button}`);
    try {
      await driver.wait(action.ms);
    } finally {
      await driver.command(`-${action.button}`);
    }
  } else if (action.kind === "hold") {
    await driver.keyDown(action.key);
    try {
      await driver.wait(action.ms);
    } finally {
      await driver.keyUp(action.key);
    }
  } else if (action.kind === "press") await driver.press(action.key);
  else if (action.kind === "click") await driver.click(action.x, action.y);
  if (action.wait > 0) await driver.wait(action.wait);
}

/**
 * A map played: the engine waited for, `map <name>`, the profile's steps to enter the game, then `steps`,
 * with a picture wherever a step asks for one. Resolves to what happened:
 *
 *   { map, out,
 *     pictures   the PNG files written, in the order taken (their paths): open them and look
 *     steps      one for each thing done: { part: "load" | "enter" | "steps", index, kind, step, at, took,
 *                picture }: `at` and `took` in milliseconds from the start, `picture` its file or null
 *     log        the game's console, as lines
 *     logFile    the same, written to <out>/log.txt }
 *
 * Two pictures are taken unasked, since a run that never got into the game is told by them at a glance:
 * `loaded` when the map has loaded and `entered` after the profile's steps to enter (when it has any).
 *
 *   driver   a plain object: `ready()` resolves when the engine takes commands, `command(text)` runs a
 *            console command, `keyDown(key)`, `keyUp(key)`, `press(key)`, `click(x, y)`, `wait(ms)`,
 *            `shot(file)` writes a PNG of what the player sees, `log()` gives the console's lines and
 *            `close()` ends it. Each may be async. `browserDriver` makes the kit's own
 *   map      the map's name, as `map <name>` takes it
 *   steps    what to do once in the game (`playOf` has the format)
 *   out      the folder the pictures and the log go to; it is made
 *   mod      the mod's profile: its `play` part says how the game is entered and how a thing is said
 *   loads    milliseconds waited for the map to load (unless told: the profile's `play.loads`)
 *   pause    milliseconds waited after a step that does something and gives no `wait` (1000)
 *   tell     a function handed a line as each thing is done, for a caller that prints while it waits
 *
 * Every step is checked before the driver is touched. The driver is closed and the log written whatever
 * happens; what a driver throws comes through with the step it was doing named before it.
 */
export async function play({ driver, map, steps = [], out, mod, loads, pause, tell } = {}) {
  const lacks = DRIVER.filter((name) => typeof driver?.[name] !== "function");
  if (lacks.length)
    throw new Error(
      `play: driver is an object with ${DRIVER.join(", ")} (browserDriver makes one)${driver ? `: this one has no ${lacks.join(", ")}` : ""}`,
    );
  if (!(typeof map === "string" && MAP_NAME.test(map)))
    throw new Error(
      `play: map is the map's name as the console's \`map\` takes it, such as "orchard", not ${shown(map)}`,
    );
  if (!isText(out))
    throw new Error(`play: out is the folder the pictures and the log go to, not ${shown(out)}`);
  const part = playPartOf(mod);
  const loading = loads ?? part.loads;
  if (!isCount(loading)) throw new Error(`play: loads is a number of milliseconds, not ${shown(loads)}`);
  const entering = playOf(part.enter, { mod, pause, what: "the profile's enter step" });
  const asked = playOf(steps, { mod, pause });

  mkdirSync(out, { recursive: true });
  const began = Date.now();
  const pictures = [];
  const done = [];
  const picture = async (name) => {
    const file = join(out, `${String(pictures.length).padStart(2, "0")}_${name}.png`);
    await driver.shot(file);
    pictures.push(file);
    return file;
  };
  /** One thing done and written down: `run` does it, `shot` names the picture taken after it. */
  const record = async (phase, index, kind, step, shot, run) => {
    const at = Date.now() - began;
    let file = null;
    try {
      await run();
      if (shot) file = await picture(shot);
    } catch (error) {
      const where =
        phase === "load"
          ? "loading the map"
          : `${phase === "enter" ? "the profile's enter step" : "step"} ${index + 1}`;
      throw new Error(`${/^play: /.test(error.message) ? "" : "play: "}${error.message} (at ${where})`, {
        cause: error,
      });
    }
    const entry = { part: phase, index, kind, step, at, took: Date.now() - began - at, picture: file };
    done.push(entry);
    tell?.(lineOf(entry));
    return entry;
  };
  const through = async (phase, actions) => {
    for (const [index, action] of actions.entries())
      await record(phase, index, action.kind, action.step, action.shot, () => act(driver, action));
  };

  let failure = null;
  let log = [];
  try {
    await record("load", 0, "ready", null, null, () => driver.ready());
    await record("load", 1, "command", { command: `map ${map}`, wait: loading }, "loaded", async () => {
      await driver.command(`map ${map}`);
      if (loading > 0) await driver.wait(loading);
    });
    await through("enter", entering);
    if (entering.length)
      await record("enter", entering.length, "wait", { shot: "entered" }, "entered", () => {});
    await through("steps", asked);
  } catch (error) {
    failure = error;
  }
  // the console is kept and the driver closed whatever happened: a failed run's log says why
  try {
    log = [...((await driver.log()) ?? [])].map(String);
  } catch {
    log = [];
  }
  const logFile = join(out, "log.txt");
  writeFileSync(logFile, log.join("\n"));
  try {
    await driver.close();
  } catch (error) {
    failure ??= new Error(`play: the driver did not close: ${error.message}`, { cause: error });
  }
  if (failure) throw Object.assign(failure, { pictures, logFile });
  return { map, out, pictures, steps: done, log, logFile };
}

/** One thing done, as a line: when, how long, what, and its picture. */
function lineOf({ part, kind, step, at, took, picture }) {
  const seconds = (ms) => `${(ms / 1000).toFixed(1).padStart(6)} s`;
  const what = kind === "ready" ? "the engine is up" : JSON.stringify(step);
  return `${seconds(at)} ${seconds(took)}  ${part === "enter" ? "enter  " : ""}${what}${picture ? `   -> ${picture}` : ""}`;
}

// ── the browser ─────────────────────────────────────────────────────────────
/**
 * Playwright, found in a folder: one that holds `node_modules/playwright` (or `playwright-core`), which is
 * what `npm install playwright` in that folder leaves. It is looked for there and nowhere else, and when it
 * is not there that is said in a sentence. The kit never installs it.
 */
export function playwrightFrom(folder) {
  if (!isText(folder))
    throw new Error(
      "play: Playwright is not part of this kit, which has no dependencies: name a folder that holds node_modules/playwright (--playwright <folder>, or the PLAYWRIGHT_DIR environment variable), or hand browserDriver the module itself",
    );
  const home = resolve(folder);
  const name = ["playwright", "playwright-core"].find((each) => existsSync(join(home, "node_modules", each)));
  if (!name)
    throw new Error(
      `play: there is no Playwright in ${home} (no node_modules/playwright there). It is an outside program and no part of this kit: in a folder of your own run \`npm install playwright\` and \`npx playwright install chromium\`, and name that folder`,
    );
  const found = createRequire(join(home, "package.json"))(name);
  if (!found?.chromium) throw new Error(`play: the ${name} in ${home} has no chromium to launch`);
  return found;
}

/**
 * The driver for a browser build of Xash3D: a headless Chromium opened on the page that runs the engine.
 *
 *   url           the page's address
 *   playwright    the Playwright module (`{ chromium }`), or a folder to find it in (`playwrightFrom`)
 *   width, height the page's size, which is the game's screen and the pictures' size (1024 by 768)
 *   readyWithin   milliseconds the engine is given to come up (120000)
 *   engine        the name of the page's global that is the engine's Emscripten module: commands are run by
 *                 its `ccall("Cmd_ExecuteString", ...)` ("xash")
 *   readyFlag     the name of the global the page sets when the engine takes commands ("xashReady")
 *   args          Chromium's arguments (`SOFTWARE_GL`)
 *
 * The two names are the page's own, not the engine's: they are what the one build this was tried with calls
 * them, and another page's are passed. Nothing is opened until `ready()` is called. The console's lines are
 * what the page writes to the browser's console, and its errors, which begin `PAGE ERROR:`.
 */
export function browserDriver({
  url,
  playwright,
  width = 1024,
  height = 768,
  readyWithin = 120000,
  engine = "xash",
  readyFlag = "xashReady",
  args = SOFTWARE_GL,
} = {}) {
  if (!(typeof url === "string" && /^https?:\/\//i.test(url)))
    throw new Error(
      `play: url is the address of the page that runs the engine (http://...), not ${shown(url)}`,
    );
  if (![width, height].every((side) => Number.isInteger(side) && side > 0))
    throw new Error(
      `play: width and height are whole numbers of pixels, not ${shown(width)} by ${shown(height)}`,
    );
  const library =
    typeof playwright === "string" || playwright === undefined ? playwrightFrom(playwright) : playwright;
  if (typeof library?.chromium?.launch !== "function")
    throw new Error(
      "play: playwright is the Playwright module ({ chromium }), or the folder it is installed in",
    );
  const lines = [];
  let browser = null;
  let page = null;
  const opened = () => page ?? fail("the browser is not open: ready() comes first");
  const fail = (sentence) => {
    throw new Error(`play: ${sentence}`);
  };
  return {
    async ready() {
      browser = await library.chromium.launch({ args });
      page = await browser.newPage({ viewport: { width, height } });
      page.on("console", (message) => lines.push(message.text()));
      page.on("pageerror", (error) => lines.push(`PAGE ERROR: ${error.message}`));
      try {
        await page.goto(url);
      } catch (error) {
        fail(`nothing answers at ${url}: is the game's page being served? (${error.message.split("\n")[0]})`);
      }
      // asked once a second: the page sets the flag when the engine's main loop runs
      for (let waited = 0; waited < readyWithin; waited += 1000) {
        await page.waitForTimeout(1000);
        if (await page.evaluate((flag) => Boolean(window[flag]), readyFlag).catch(() => false)) return;
      }
      fail(
        `the engine at ${url} did not come up in ${Math.round(readyWithin / 1000)} seconds: the page never set window.${readyFlag}. The console's last lines are in the log`,
      );
    },
    async command(text) {
      try {
        await opened().evaluate(
          ([name, command]) => window[name].ccall("Cmd_ExecuteString", null, ["string"], [command]),
          [engine, text],
        );
      } catch (error) {
        fail(`the engine did not take the command ${shown(text)}: ${error.message.split("\n")[0]}`);
      }
    },
    keyDown: (key) => opened().keyboard.down(key),
    keyUp: (key) => opened().keyboard.up(key),
    press: (key) => opened().keyboard.press(key),
    click: (x, y) => opened().mouse.click(x, y),
    wait: (ms) => opened().waitForTimeout(ms),
    async shot(file) {
      await opened().screenshot({ path: file });
    },
    log: () => [...lines],
    async close() {
      await browser?.close();
      browser = null;
      page = null;
    },
  };
}
