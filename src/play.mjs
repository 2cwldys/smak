// A map seen in the game itself: the game is entered, the player walks, turns, speaks, and pictures are taken;
// what the game SAYS is heard, waited for and asserted, so that a run passes or fails without a person
// reading its pictures.
//
//   import { play, maps } from "./smak/src/index.mjs";
//   const driver = play.browserDriver({ url: "http://127.0.0.1:8097/?args=", playwright: "C:/tools/browser" });
//   const run = await play.play({ driver, map: "orchard", out: "work/seen", mod, steps: [
//     { walk: 3000, shot: "walked" },                 // forward for three seconds, then a picture
//     { face: 90, look: -20 },                        // look along +y and 20 degrees down, exactly
//     { say: "hail", until: "Keeper: .*welcome" },    // said as the mod's profile says a thing is said;
//                                                     // then waited for, by what the game answers
//     { expect: "You receive" },                      // the run FAILS unless the game said so
//   ] });
//   run.pictures;                                     // the PNG files, in the order taken
//   run.passed, run.expectations;                     // whether every expectation held, and each one
//   run.logFile;                                      // every line the game said, with its time
//
// The parts, kept apart:
//   playOf         a list of steps, as a person or an agent writes them, checked and made plain actions
//   playSession    a game kept up: many runs and many maps against one engine, which is started once
//   play           one run from a cold start: the engine waited for, the map, the steps, the driver closed
//   browserDriver  the one driver the kit ships: a browser build of the Xash3D engine, driven with
//                  Playwright (src/play-browser.mjs)
//   serveSession, attachSession   a session kept by one process and used by others (src/play-session.mjs)
//   sheetOf        a run's pictures in one, each with its name (src/play-sheet.mjs)
//
// What belongs to one game (how its menu is got through, how a thing is said so that an NPC hears it, what
// line says a map has loaded, how its messages are read) is the `play` field of the mod's profile
// (maps/mod.mjs), and nothing of it is here.
//
// WHERE THE FACTS ARE FROM. The engine is Xash3D FWGS built for the browser. A console command is run by the
// engine's own Cmd_ExecuteString (engine/common/cmd.c), called through the page's Emscripten module. A player
// moves while one of the client library's buttons is down: `+forward`, `+back`, `+moveleft`, `+moveright`,
// `+left`, `+right`, `+jump`, `+duck`, `+use`, `+attack`, each let go by the same word with `-` (the SDK's
// cl_dll/input.cpp, InitInput). Typed with no key's number after it, a `+` command is "typed manually at the
// console for continuous down" (KeyDown, same file): the button stays down until its `-` comes. So a walk is
// `+forward`, a wait, `-forward`, whatever keys the person has bound.
//
// TIME. Measured 2026-10-13 in a local build drawn in software: the engine is up 8 seconds after the page
// is opened, a small map has loaded 8 seconds after `map <name>` (4 the second time in one session), and the
// player is in the game 3 seconds after the menu's click. The rest of a run of old was waiting by the clock:
// a profile that names the line a loaded map prints (`play.loaded`) and gives its `enter` steps an `until`
// waits for the game instead. A picture costs about 1.6 seconds there; text costs nothing.
//
// TURNING. A driver that can set the view (`look`, as the browser driver can) turns exactly: `turn`, `face`
// and `look` are set and read back in degrees. Without it a `turn` is by time and only about right: `+left`
// turns the view by cl_yawspeed degrees a second (input.cpp, CL_AdjustAngles: 210 unless the person changed
// it), counted frame by frame, so a turn is out by up to a frame's worth and does not add up over several.
//
// GOING TO A PLACE. Xash3D FWGS has no command that puts the player at a place (no `setpos`: looked for in
// engine/server/sv_client.c and engine/client/cl_main.c, 2026-10-13). A game may have one of its own, and
// its profile names it (`play.goto`); then `{ goto: [x, y, z] }` runs it and, where the driver knows where
// the player stands, makes sure he is there. Without one: walk, or `{ command: ["sv_cheats 1", "noclip"] }`
// and fly, which a listen server allows, with `{ where: "name" }` to read the place as you go.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GOLDSRC, modOf } from "./maps/mod.mjs";
import { sheetOf } from "./play-sheet.mjs";
import { MOUSE_BUTTONS } from "./play-browser.mjs";

export { SOFTWARE_GL, playwrightFrom, browserDriver } from "./play-browser.mjs";
export { sheetOf } from "./play-sheet.mjs";
export { serveSession, attachSession, sessionState, closeSession, SESSION_PORT } from "./play-session.mjs";

/** What a step may do: one of these, or nothing but a wait and a picture. */
const KINDS = [
  ...["command", "say", "walk", "turn", "button", "hold", "press", "click"],
  ...["mouse", "mouseDown", "mouseUp", "look", "face", "goto", "where", "map", "expect", "expectNot"],
];
/** What a step may hold beside its kind, and which kinds take `ms` and `to`. */
const BESIDE = ["wait", "shot", "ms", "to", "until", "within", "every", "since"];
const TAKES_MS = ["button", "hold", "mouse"];
/** The kinds that only read: nothing is done to the game, so no wait follows them unless one is given. */
const READS = ["where", "expect", "expectNot"];
/** Where a walk goes, as the client library's buttons name it (the SDK's cl_dll/input.cpp). */
const WALKS = { forward: "forward", back: "back", left: "moveleft", right: "moveright" };
/** Milliseconds waited after a step that does something, unless the step says: a frame or two to show it. */
const PAUSE = 1000;
/** How long a key is held when a `hold` step does not say. */
const HOLD = 1000;
/** Milliseconds between the commands of one step, so that each is taken in a frame of its own. */
const BETWEEN = 150;
/** Milliseconds an `until` waits for its line unless the step says, and between two looks for it. */
const WITHIN = 30000;
const POLL = 100;
/** Milliseconds a map is given to be left before files are put into the engine. */
const LEAVES = 700;
/** How near the place asked for a `goto` has to bring the player, across and in height, and how long it has. */
const GOTO_NEAR = 16;
const GOTO_NEAR_Z = 72;
const GOTO_WITHIN = 3000;
/** A map's name and a picture's, as they may be written: nothing a console or a file system minds. */
const MAP_NAME = /^[A-Za-z0-9_][A-Za-z0-9_\-/.]*$/;
const SHOT_NAME = /^[A-Za-z0-9_-]+$/;
const BUTTON_NAME = /^[a-z][a-z0-9_]*$/;
/** From where an expectation reads, beside a picture's name. */
const SINCE = ["run", "map", "step"];
/** What a driver is: every one of these is called by `play`. */
const DRIVER = ["ready", "command", "keyDown", "keyUp", "press", "click", "wait", "shot", "log", "close"];
/** A run's own lines in what was heard: never matched by an `until` or an expectation. */
const OWN = "play";
/** How many of the last lines heard a failed wait repeats. */
const LAST_LINES = 6;
/** How many pictures a row of the contact sheet holds, and how much smaller each is drawn. */
const SHEET = { cols: 4, shrink: 3 };

const shown = (value) => (value === undefined ? "nothing" : JSON.stringify(value));
const isCount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";

// ── what the game says ──────────────────────────────────────────────────────
/**
 * A pattern as a step writes it, made a regular expression: `"HIT! .* holy damage"` is the expression's
 * source, matched as written (capitals count); `"/the flame sinks/i"` gives flags too. A RegExp is itself.
 */
export function patternOf(written, what = "a pattern") {
  if (written instanceof RegExp) return written;
  if (!isText(written))
    throw new Error(
      `play: ${what} is a regular expression as text, such as "HIT! .* damage", not ${shown(written)}`,
    );
  const literal = /^\/(.+)\/([a-z]*)$/s.exec(written);
  try {
    return literal ? new RegExp(literal[1], literal[2]) : new RegExp(written);
  } catch (error) {
    throw new Error(`play: ${what} ${shown(written)} is no regular expression: ${error.message}`, {
      cause: error,
    });
  }
}

/** The strings of a message's bytes: each run that ends at a 0, read as Latin-1. */
const stringsOf = (bytes, from = 0) => {
  const strings = [];
  let text = "";
  for (let at = from; at < bytes.length; at++)
    if (bytes[at]) text += String.fromCharCode(bytes[at]);
    else {
      strings.push(text);
      text = "";
    }
  if (text) strings.push(text);
  return strings;
};
/** A line as it is kept: the colour codes of the engine's console (1 to 8) and what is not print taken out. */
const clean = (text) => text.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "").trim();
const linesOfText = (text) => text.split(/\r?\n/).map(clean).filter(Boolean);

/**
 * How the SDK's own user messages are read, by the names a profile's `play.messages` may give:
 *   "textmsg"   TextMsg (the SDK's dlls/util.cpp, ClientPrint): a byte for where it is shown, the text, and
 *               up to four strings put where the text has %s. What a script or the game prints to a player's
 *               console, his notify lines and the middle of his screen
 *   "saytext"   SayText (dlls/client.cpp, Host_Say): a byte for who spoke, then the line
 *   "strings"   any message: every string of two letters or more in it, for a message whose layout is not known
 */
export const MESSAGE_READERS = {
  textmsg(bytes) {
    const [text = "", ...put] = stringsOf(bytes, 1);
    let next = 0;
    return linesOfText(text.replace(/%s/g, () => clean(put[next++] ?? "")));
  },
  saytext: (bytes) => linesOfText(stringsOf(bytes, 1).join(" ")),
  strings: (bytes) => stringsOf(bytes).flatMap(linesOfText).filter((each) => each.length > 1), // prettier-ignore
};

// ── the profile's part ──────────────────────────────────────────────────────
/**
 * What a mod's profile says of playing it, made whole: `{ enter, say, loads, loaded, goto, messages,
 * yawspeed, screen }`. A field the profile leaves out is `GOLDSRC`'s; with no profile it is all `GOLDSRC`'s.
 *   enter      the steps that get a player from "the map has loaded" into the game (a menu's clicks); none
 *              for a game that puts the player in by itself. A step with `until` (and `every`) waits for
 *              the game instead of the clock
 *   say        how a thing is said: a list of console commands with `{text}` where the words go, or a
 *              function of the text that gives the commands
 *   loads      milliseconds a map is given to load after `map <name>`: waited out where nothing is heard,
 *              and the longest `loaded` is waited for
 *   loaded     a pattern of the line that says the map has loaded, or null: with it, and a driver that
 *              hears, a run goes on the moment the line comes
 *   goto       how the player is put at a place: console commands with `{x}`, `{y}`, `{z}` in them, or a
 *              function of the three; null where the game has no such command
 *   messages   the game's user messages to listen to, each with how its bytes are read: a name of
 *              `MESSAGE_READERS`, or a function of the bytes that gives a line, lines, or nothing
 *   yawspeed   the game's cl_yawspeed, in degrees a second: what a `turn` is timed by where the driver
 *              cannot set the view
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
  const commands = (value) => typeof value === "function" || (Array.isArray(value) && value.every(isText));
  if (!commands(part.say))
    throw new Error(
      `mod: play.say is a list of console commands with {text} in them, or a function of the text, not ${shown(part.say)}`,
    );
  if (!isCount(part.loads))
    throw new Error(`mod: play.loads is a number of milliseconds, not ${shown(part.loads)}`);
  if (!(isCount(part.yawspeed) && part.yawspeed > 0))
    throw new Error(`mod: play.yawspeed is degrees a second, over 0, not ${shown(part.yawspeed)}`);
  part.loaded ??= null;
  if (part.loaded !== null) part.loaded = patternOf(part.loaded, "mod: play.loaded");
  part.goto ??= null;
  if (part.goto !== null && !commands(part.goto))
    throw new Error(
      `mod: play.goto is a list of console commands with {x}, {y} and {z} in them, or a function of the three, not ${shown(part.goto)}`,
    );
  part.messages ??= {};
  const readers = typeof part.messages === "object" && !Array.isArray(part.messages) ? part.messages : null;
  const read = (how) => typeof how === "function" || Object.hasOwn(MESSAGE_READERS, how);
  if (!readers || !Object.values(readers).every(read))
    throw new Error(
      `mod: play.messages gives each message's name the way it is read: one of ${Object.keys(MESSAGE_READERS).join(", ")}, or a function of its bytes; not ${shown(part.messages)}`,
    );
  return part;
}

/** The names of the user messages a profile reads: what a driver is asked to listen to. */
export const messagesOf = (mod) => Object.keys(playPartOf(mod).messages);

/** The console commands a profile's list (or function) gives for the words put into it. */
function commandsOf(given, put, values, what) {
  const commands =
    typeof given === "function"
      ? [given(...values)].flat()
      : given.map((each) => each.replace(/\{(\w+)\}/g, (all, name) => (name in put ? put[name] : all)));
  if (!commands.length || !commands.every((each) => isText(each) && !/[\r\n]/.test(each)))
    throw new Error(
      `mod: ${what} gave ${shown(commands)} for ${shown(values)}, where console commands were wanted`,
    );
  return commands;
}

/** The console commands that say `text` in a game, as its profile's `play.say` has it. */
function sayCommands(part, text, where) {
  // the console ends a command at `;` and at a line's end, and a `"` opens a quoted word: none can be said
  if (!isText(text) || /[;"\r\n]/.test(text))
    throw new Error(
      `play: ${where}: say is the words to say, with no ; and no " and on one line (the console would take them for its own), not ${shown(text)}`,
    );
  return commandsOf(part.say, { text }, [text], "play.say");
}

// ── steps into actions ──────────────────────────────────────────────────────
/**
 * A list of steps checked and made plain actions; a wrong step is refused in a sentence that names it.
 *
 * A step is an object with at most one of:
 *   { command: "noclip" }             a console command, or a list of them
 *   { say: "hail" }                   said as the mod's profile says a thing is said (`play.say`)
 *   { walk: 2000 }                    forward for that many milliseconds; `to: "back" | "left" | "right"`
 *   { turn: 90 }                      degrees to the left (under 0: to the right): exact where the driver
 *                                     sets the view, by time and about right where it does not
 *   { face: 90 }                      the player turned to that yaw: 0 looks along +x, 90 along +y
 *   { look: -30 }                     the player looking that many degrees up (under 0: down), level at 0
 *   { button: "jump", ms: 200 }       one of the game's buttons held: `+jump`, the wait, `-jump`
 *   { hold: "w", ms: 2000 }           a key of the keyboard held (ms: 1000 unless told), as the driver names keys
 *   { press: "Enter" }                a key pressed and let go
 *   { click: [512, 330] }             a click at that place of the page, in its pixels
 *   { mouse: "left", ms: 2500 }       a button of the mouse held that long: left, right, middle
 *   { mouseDown: "left" }             a button of the mouse held until `{ mouseUp: "left" }` (or the run's
 *                                     end), while the steps between are done
 *   { goto: [512, 96, 36] }           the player put at that place, by the profile's `play.goto`; the place
 *                                     is the middle of his box, 36 above the floor he stands on
 *   { where: "gate" }                 the player's place and view written into the log, under that name
 *   { map: "barrowroad" }             another map loaded in the same run, and entered as the profile says
 *   { expect: "HIT! .* holy" }        the run fails unless a line heard matches (a regular expression)
 *   { expectNot: "Script Error" }     the run fails if a line heard matches
 * and any step may also carry:
 *   until: "Skeleton .* dies"         after it, a line the game says is waited for (and not the clock)
 *   within: 20000                     the longest `until` waits, in milliseconds (30000): past it the run
 *                                     stops and says what it waited for. With `expect`: how long the line
 *                                     is given to come (unless told: it has to be there already); with
 *                                     `expectNot`: how long the line is watched for
 *   every: 1000                       with `until`: the step is done again that often until the line comes
 *   since: "run"                      with `expect` and `expectNot`: the lines read are those since the
 *                                     run began ("run", as when nothing is said), since the map last
 *                                     loaded ("map"), since this step began ("step"), or since a picture
 *                                     of that name was taken
 *   wait: 1500                        milliseconds waited after it (unless told: 1000 after a step that does
 *                                     something and has no `until`, none after one that only reads)
 *   shot: "gate"                      a picture taken after the wait: `NN_gate.png`, numbered as taken
 * so `{ wait: 5000 }` only waits, `{ shot: "here" }` only takes a picture and `{ until: "dies" }` only waits
 * for a line.
 *
 * Options: `mod` (the profile: its `play.say`, `play.goto` and `play.yawspeed`), `pause` (the wait after a
 * step that does something), `what` (how the list is named in a refusal).
 *
 * Each action is `{ kind, wait, shot, step }` with its own fields: "command" `commands`; "button" `button`,
 * `ms` (and `turn`, the degrees, when it came of one); "hold" `key`, `ms`; "press" `key`; "click" `x`, `y`;
 * "mouse" `mouse`, `ms`; "mouseDown", "mouseUp" `mouse`; "look" `yaw`, `pitch` (one of them); "goto"
 * `commands`, `place`; "where" `name`; "map" `map`; "expect", "expectNot" `pattern`, `within`, `since`;
 * "wait" nothing more. One with `until` has `until` (a RegExp), `within` and `every` (or null) too. `step`
 * is the step as written.
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
      `has ${unknown.join(", ")}, which no step has: a step is one of ${KINDS.join(", ")}, with wait, shot and until`,
    );
  // to face a way and to look up or down are one setting of the view: the two may share a step
  const kinds = KINDS.filter((kind) => step[kind] !== undefined);
  const both = kinds.length === 2 && kinds.includes("look") && kinds.includes("face");
  if (kinds.length > 1 && !both)
    refuse(`has ${kinds.join(" and ")}: one thing a step, the next in a step of its own`);
  const kind = both ? "look" : kinds[0];
  const waits = step.wait !== undefined || step.shot !== undefined || step.until !== undefined;
  if (!kind && !waits) refuse(`does nothing: ${shown(step)}`);
  if (step.ms !== undefined && !TAKES_MS.includes(kind))
    refuse("has ms, which goes with hold or button only, and with mouse");
  if (step.to !== undefined && kind !== "walk") refuse("has to, which goes with walk only");
  if (step.wait !== undefined && !isCount(step.wait))
    refuse(`waits ${shown(step.wait)}: wait is a number of milliseconds`);
  if (step.shot !== undefined && !(typeof step.shot === "string" && SHOT_NAME.test(step.shot)))
    refuse(`names its picture ${shown(step.shot)}: letters, digits, _ and - (it becomes a file's name)`);
  const expects = kind === "expect" || kind === "expectNot";
  if (step.until !== undefined && expects)
    refuse(`has until and ${kind}: an expectation waits by its own within`);
  if (step.within !== undefined && step.until === undefined && !expects)
    refuse("has within, which goes with until, expect or expectNot only");
  if (step.within !== undefined && !(isCount(step.within) && step.within > 0))
    refuse(`waits within ${shown(step.within)}: a number of milliseconds over 0`);
  if (step.every !== undefined && (step.until === undefined || !kind))
    refuse("has every, which goes with until, on a step that does a thing to do again");
  if (step.every !== undefined && !(isCount(step.every) && step.every > 0))
    refuse(`does it again every ${shown(step.every)}: a number of milliseconds over 0`);
  if (step.since !== undefined && !expects) refuse("has since, which goes with expect or expectNot only");
  if (step.since !== undefined && !(SINCE.includes(step.since) || SHOT_NAME.test(String(step.since))))
    refuse(`reads since ${shown(step.since)}: ${SINCE.join(", ")}, or the name of a picture taken before`);
  const pattern = (written, of) => {
    try {
      return patternOf(written, of);
    } catch (error) {
      return refuse(error.message.replace(/^play: /, ""));
    }
  };
  const held = (ms, of) =>
    isCount(ms) && ms > 0 ? ms : refuse(`${of} ${shown(ms)}: a number of milliseconds over 0`);
  const mouse = (button) =>
    MOUSE_BUTTONS.includes(button)
      ? button
      : refuse(`names the mouse's button ${shown(button)}: ${MOUSE_BUTTONS.join(", ")}`);

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
    if (!(isNumber(step.turn) && step.turn !== 0))
      refuse(`turns ${shown(step.turn)}: degrees, over 0 to the left and under 0 to the right`);
    // by time where the view cannot be set: see TURNING at the head of this file
    const ms = Math.max(1, Math.round((Math.abs(step.turn) / part.yawspeed) * 1000));
    Object.assign(action, { kind: "button", button: step.turn > 0 ? "left" : "right", ms, turn: step.turn });
  } else if (kind === "look") {
    if (step.look !== undefined && !(isNumber(step.look) && Math.abs(step.look) <= 89))
      refuse(`looks ${shown(step.look)}: degrees up, from -89 (down) to 89`);
    if (step.face !== undefined && !isNumber(step.face))
      refuse(`faces ${shown(step.face)}: a yaw in degrees, 0 along +x and 90 along +y`);
    if (step.face !== undefined) action.yaw = step.face;
    if (step.look !== undefined) action.pitch = step.look;
  } else if (kind === "face") {
    if (!isNumber(step.face))
      refuse(`faces ${shown(step.face)}: a yaw in degrees, 0 along +x and 90 along +y`);
    Object.assign(action, { kind: "look", yaw: step.face });
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
  } else if (kind === "mouse") {
    Object.assign(action, { mouse: mouse(step.mouse), ms: held(step.ms, "holds the mouse's button for") });
  } else if (kind === "mouseDown" || kind === "mouseUp") {
    action.mouse = mouse(step[kind]);
  } else if (kind === "goto") {
    if (!(Array.isArray(step.goto) && step.goto.length === 3 && step.goto.every(isNumber)))
      refuse(`goes to ${shown(step.goto)}: [x, y, z], the middle of the player's box in the map's units`);
    if (!part.goto)
      refuse(
        "goes to a place, and the profile names no command that puts the player at one (play.goto): the engine has none of its own. Walk there, or fly with noclip",
      );
    const [x, y, z] = step.goto;
    action.commands = commandsOf(part.goto, { x, y, z }, step.goto, "play.goto");
    action.place = [x, y, z];
  } else if (kind === "where") {
    if (!(step.where === true || (typeof step.where === "string" && SHOT_NAME.test(step.where))))
      refuse(`asks where under the name ${shown(step.where)}: letters, digits, _ and -, or true for no name`);
    action.name = step.where === true ? "" : step.where;
  } else if (kind === "map") {
    if (!(typeof step.map === "string" && MAP_NAME.test(step.map)))
      refuse(`loads the map ${shown(step.map)}: the map's name as the console's \`map\` takes it`);
    action.map = step.map;
  } else if (expects) {
    action.pattern = pattern(step[kind], `${kind === "expect" ? "expects" : "expects no"}`);
    action.within = step.within ?? 0;
    action.since = step.since ?? "run";
  }
  if (step.until !== undefined) {
    action.until = pattern(step.until, "waits until");
    action.within = step.within ?? WITHIN;
    action.every = step.every ?? null;
  }
  const idle = !kind || READS.includes(kind) || kind === "map" || step.until !== undefined;
  action.wait = step.wait ?? (idle ? 0 : pause);
  action.shot = step.shot ?? null;
  action.step = step;
  return action;
}

// ── the run ─────────────────────────────────────────────────────────────────
/** What a driver has to be able to do for an action, as a sentence's end; null when every driver can. */
function wantOf(action, driver) {
  const has = (...names) => names.every((name) => typeof driver[name] === "function");
  if ((action.until || action.kind === "expect" || action.kind === "expectNot") && !has("lines"))
    return "waits for what the game says, and this driver hears nothing (it has no lines())";
  if (action.kind === "look" && !has("look"))
    return "sets the view, which this driver cannot (it has no look())";
  if (action.kind === "where" && !has("view"))
    return "asks where the player is, which this driver does not know (it has no view())";
  if (["mouse", "mouseDown", "mouseUp"].includes(action.kind) && !has("mouseDown", "mouseUp"))
    return "holds a button of the mouse, and this driver has no mouse (no mouseDown() and mouseUp())";
  return null;
}

const rounded = (value) => Math.round(value * 10) / 10;
const placeText = (origin) => (origin ? origin.map(rounded).join(" ") : "nowhere yet");

/**
 * A game kept up for many runs: the engine is started once (`ready`), and each `run` loads a map, or stays
 * in the one it is in, does its steps and writes its pictures, its log and its sheet. The driver is closed
 * by `close()` and by nothing else, so a second run pays for its map and not for the engine.
 *
 *   const session = play.playSession({ driver, mod });
 *   const first = await session.run({ map: "yard", steps, out: "work/first" });
 *   const second = await session.run({ map: "road", steps: more, out: "work/second" });   // some seconds later
 *   await session.close();
 *
 *   driver   a driver, as `play` takes one
 *   mod      the mod's profile
 *   pause    milliseconds waited after a step that does something and gives no `wait` (1000)
 *   tell     a function handed a line as each thing is done; a run may give its own
 *
 * `session.state` is `{ up, map, entered, runs }`. A run takes:
 *   map        the map to load, as `map <name>` takes it. Loaded afresh even when it is the map the session
 *              is in (monsters back, doors shut), unless `stay` is true
 *   stay       true: nothing is loaded; the steps go on from where the last run left the player
 *   steps      what to do once in the game (`playOf` has the format)
 *   out        the folder the pictures and the log go to; it is made
 *   expect, expectNot   patterns the whole run is held to, beside its steps' own: checked at its end
 *   put        files written into the engine before the map loads: `[{ path: "msc/maps/yard.bsp", file }]`
 *              (or `bytes`). A driver that cannot (`put`) refuses. The map the session is in is left first
 *              (the driver's `leave`): a game may write its own files as a map ends, over what was put
 *   loads, pause, tell   as `play`'s
 *   sheet      false for no contact sheet (unless told: `sheet.png`, when a picture was taken)
 *
 * and resolves to what happened:
 *   { map, out, took,
 *     pictures      the PNG files written, in the order taken (their paths)
 *     sheet         the contact sheet of them, `<out>/sheet.png`, or null
 *     steps         one for each thing done: { part: "load" | "enter" | "steps", index, kind, step, at, took,
 *                   picture, heard }: `at` and `took` in milliseconds from the run's start, `picture` its
 *                   file or null, `heard` the line an `until` waited for
 *     expectations  one for each `expect` and `expectNot`: { where, kind, pattern, passed, line }
 *     passed        true when every expectation held
 *     lines         what was heard in the run: { at, kind, text }, `at` in milliseconds from its start and
 *                   `kind` "console", "error", a message's name, "where", or "play" for the run's own notes
 *     log           the same as text lines; logFile: <out>/log.txt; linesFile: <out>/log.jsonl (a JSON
 *                   object a line); resultFile: <out>/result.json (this, without the lines) }
 *
 * A run that cannot go on (a line waited for that never came, a driver that failed) throws, with the step it
 * was at named; the log, the sheet and result.json are written all the same and named on the error
 * (`pictures`, `logFile`, `sheet`, `expectations`). An expectation that does not hold does not stop a run:
 * it is in `expectations`, and `passed` is false.
 */
export function playSession({ driver, mod, pause: sessionPause, tell: sessionTell } = {}) {
  const lacks = DRIVER.filter((name) => typeof driver?.[name] !== "function");
  if (lacks.length)
    throw new Error(
      `play: driver is an object with ${DRIVER.join(", ")} (browserDriver makes one)${driver ? `: this one has no ${lacks.join(", ")}` : ""}`,
    );
  const part = playPartOf(mod);
  const hears = typeof driver.lines === "function";
  const state = { up: false, map: null, entered: false, runs: 0 };
  /** Everything heard since the session began: `{ at, kind, text }`, `at` the clock's milliseconds. */
  const heard = [];
  let taken = 0;
  /** Whether a turn is still set exactly: false once the driver's view could not be read. */
  let exact = true;
  const readers = Object.fromEntries(
    Object.entries(part.messages).map(([name, how]) => [
      name,
      typeof how === "function" ? how : MESSAGE_READERS[how],
    ]),
  );
  /** What the driver heard since the last asking, read and kept. */
  const listen = async () => {
    if (!hears) return;
    const fresh = (await driver.lines(taken)) ?? [];
    taken += fresh.length;
    for (const each of fresh) {
      if (each.text !== undefined) heard.push({ at: each.at, kind: each.kind, text: String(each.text) });
      else if (readers[each.kind])
        for (const text of [readers[each.kind](each.bytes) ?? []].flat())
          if (isText(text)) heard.push({ at: each.at, kind: each.kind, text: String(text) });
    }
  };
  const note = (kind, text) => heard.push({ at: Date.now(), kind, text });
  /** The first line from `from` on that matches, and is not the run's own. */
  const found = (pattern, from) => {
    for (let at = from; at < heard.length; at++)
      if (heard[at].kind !== OWN && pattern.test(heard[at].text)) return heard[at];
    return null;
  };
  /** Waits until a line from `from` on matches: the line, or null when `within` ran out. */
  const waitFor = async (pattern, from, within, every, again) => {
    for (let waited = 0, last = 0; ; waited += POLL) {
      await listen();
      const line = found(pattern, from);
      if (line || waited >= within) return line;
      if (every && waited - last >= every) {
        last = waited;
        await again();
      }
      await driver.wait(POLL);
    }
  };
  const lastLines = (from) => {
    const said = heard.slice(from).filter((each) => each.kind !== OWN);
    return said.length
      ? `The last it said: ${said.slice(-LAST_LINES).map((each) => shown(each.text)).join(", ")}` // prettier-ignore
      : "It said nothing meanwhile";
  };

  async function ready() {
    if (state.up) return;
    await driver.ready();
    state.up = true;
  }

  async function run({
    map,
    stay = false,
    steps = [],
    out,
    loads,
    pause = sessionPause,
    tell = sessionTell,
    expect = [],
    expectNot = [],
    put = [],
    sheet = true,
  } = {}) {
    const staying = stay === true;
    if (staying && !state.entered)
      throw new Error("play: stay goes on from the run before, and this session has entered no map yet");
    if (!staying && !(typeof map === "string" && MAP_NAME.test(map)))
      throw new Error(
        `play: map is the map's name as the console's \`map\` takes it, such as "orchard", not ${shown(map)}`,
      );
    if (!isText(out))
      throw new Error(`play: out is the folder the pictures and the log go to, not ${shown(out)}`);
    const loading = loads ?? part.loads;
    if (!isCount(loading)) throw new Error(`play: loads is a number of milliseconds, not ${shown(loads)}`);
    const entering = playOf(part.enter, { mod, pause, what: "the profile's enter step" });
    const asked = playOf(steps, { mod, pause });
    const held = [expect, expectNot].map((list, which) =>
      [list].flat().map((written) => ({
        kind: which ? "expectNot" : "expect",
        pattern: patternOf(written, which ? "expectNot" : "expect"),
      })),
    );
    for (const [list, name] of [[entering, "the profile's enter step"], [asked, "step"]]) // prettier-ignore
      list.forEach((action, index) => {
        const want = wantOf(action, driver);
        if (want) throw new Error(`play: ${name} ${index + 1} ${want}`);
      });
    if (held.flat().length && !hears)
      throw new Error("play: an expectation reads what the game says, and this driver hears nothing");
    if (!Array.isArray(put) || !put.every((each) => isText(each?.path) && (each.bytes || isText(each.file))))
      throw new Error(
        `play: put is a list of { path, file } (or bytes): a place in the engine's files and what goes there, not ${shown(put)}`,
      );
    if (put.length && typeof driver.put !== "function")
      throw new Error("play: this driver cannot put a file into the engine (it has no put())");

    mkdirSync(out, { recursive: true });
    const began = Date.now();
    const pictures = [];
    const done = [];
    const expectations = [];
    const marks = new Map();
    const down = new Set();
    let first = heard.length;
    let mapFrom = first;
    const picture = async (name) => {
      const file = join(out, `${String(pictures.length).padStart(2, "0")}_${name}.png`);
      await driver.shot(file);
      pictures.push(file);
      marks.set(name, heard.length);
      return file;
    };
    /** One thing done and written down: `does` does it, `shot` names the picture taken after it. */
    const record = async (phase, index, kind, step, shot, does) => {
      const at = Date.now() - began;
      let file = null;
      let line = null;
      const where =
        phase === "load"
          ? "loading the map"
          : `${phase === "enter" ? "the profile's enter step" : "step"} ${index + 1}`;
      try {
        line = (await does(where)) ?? null;
        if (shot) file = await picture(shot);
      } catch (error) {
        throw new Error(`${/^play: /.test(error.message) ? "" : "play: "}${error.message} (at ${where})`, {
          cause: error,
        });
      }
      const entry = { part: phase, index, kind, step, at, took: Date.now() - began - at, picture: file };
      if (line) entry.heard = line.text;
      done.push(entry);
      const said = lineOf(entry);
      note(OWN, said.trim());
      tell?.(said);
      return entry;
    };
    /** An expectation looked at and written down; it never stops the run. */
    const expecting = async ({ kind, pattern, within = 0, since = "run" }, where, stepFrom) => {
      if (!SINCE.includes(since) && !marks.has(since))
        throw new Error(`play: no picture named ${shown(since)} was taken before, to read since`);
      const from = since === "run" ? first : since === "map" ? mapFrom : since === "step" ? stepFrom : marks.get(since); // prettier-ignore
      // an expectation that a line is not there watches for it; one that it is there waits for it
      const line = within ? await waitFor(pattern, from, within) : (await listen(), found(pattern, from));
      const passed = kind === "expect" ? Boolean(line) : !line;
      const entry = { where, kind, pattern: String(pattern), passed, line: line?.text ?? null };
      expectations.push(entry);
      // told at the run's end by whoever reports it, and kept in the log where it was asked
      note(OWN, expectationLine(entry));
    };
    /** One action done through the driver: what it does, its `until`, then its wait. */
    const act = async (action, where) => {
      const from = heard.length;
      const once = async () => {
        if (action.kind === "command" || action.kind === "goto")
          for (const [index, command] of action.commands.entries()) {
            if (index) await driver.wait(BETWEEN);
            await driver.command(command);
          }
        else if (action.kind === "button") {
          if (action.turn !== undefined && exact && typeof driver.view === "function" && driver.look) {
            // a build whose view cannot be read is turned by time from then on, as a driver with no view is
            const seen = await Promise.resolve(driver.view()).catch((error) => {
              exact = false;
              note(OWN, `${error.message}: a turn is by time, and about right only`);
              return null;
            });
            if (seen) {
              await driver.look({ yaw: (((seen.yaw + action.turn) % 360) + 540) % 360 - 180 }); // prettier-ignore
              return;
            }
          }
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
        else if (action.kind === "mouse") {
          await driver.mouseDown(action.mouse);
          try {
            await driver.wait(action.ms);
          } finally {
            await driver.mouseUp(action.mouse);
          }
        } else if (action.kind === "mouseDown") {
          await driver.mouseDown(action.mouse);
          down.add(action.mouse);
        } else if (action.kind === "mouseUp") {
          await driver.mouseUp(action.mouse);
          down.delete(action.mouse);
        } else if (action.kind === "look") {
          const to = {};
          if (action.yaw !== undefined) to.yaw = action.yaw;
          if (action.pitch !== undefined) to.pitch = action.pitch;
          await driver.look(to);
        } else if (action.kind === "where") {
          const { yaw, pitch, origin } = await driver.view();
          note(
            "where",
            `where${action.name ? ` ${action.name}` : ""}: origin ${placeText(origin)}, yaw ${rounded(yaw)}, pitch ${rounded(pitch)}`,
          );
        } else if (action.kind === "map") await load(action.map);
        else if (action.kind === "expect" || action.kind === "expectNot")
          await expecting(action, where, from);
      };
      await once();
      if (action.kind === "goto" && typeof driver.view === "function") await arrived(action.place);
      let line = null;
      if (action.until) {
        line = await waitFor(action.until, from, action.within, action.every, once);
        if (!line)
          throw new Error(
            `play: the game never said ${action.until} in the ${rounded(action.within / 1000)} seconds it was given. ${lastLines(from)}`,
          );
      }
      if (action.wait > 0) await driver.wait(action.wait);
      return line;
    };
    /** The player is where a `goto` put him, or the run says where he is instead. */
    const arrived = async ([x, y, z]) => {
      let origin = null;
      for (let waited = 0; waited <= GOTO_WITHIN; waited += POLL) {
        ({ origin } = await driver.view());
        const near =
          origin &&
          Math.hypot(origin[0] - x, origin[1] - y) <= GOTO_NEAR &&
          Math.abs(origin[2] - z) <= GOTO_NEAR_Z;
        if (near) return;
        await driver.wait(POLL);
      }
      throw new Error(
        `play: the player was to be put at ${placeText([x, y, z])} and is at ${placeText(origin)}: does this map have the command the profile's play.goto names?`,
      );
    };
    const through = async (phase, actions) => {
      for (const [index, action] of actions.entries())
        await record(phase, index, action.kind, action.step, action.shot, (where) => act(action, where));
    };
    /** `map <name>`, the wait for it, and the profile's steps into the game. */
    const load = async (name, shots = false) => {
      state.entered = false;
      state.map = name;
      const loaded = async () => {
        const from = heard.length;
        await driver.command(`map ${name}`);
        if (!(part.loaded && hears)) {
          if (loading > 0) await driver.wait(loading);
          return null;
        }
        const line = await waitFor(part.loaded, from, loading);
        if (!line)
          throw new Error(
            `play: the map ${name} had not loaded after ${rounded(loading / 1000)} seconds: the game never said ${part.loaded}. ${lastLines(from)}`,
          );
        return line;
      };
      const step = { command: `map ${name}`, wait: loading };
      await record("load", 1, "command", step, shots ? "loaded" : null, loaded);
      mapFrom = heard.length;
      await through("enter", entering);
      if (entering.length && shots)
        await record("enter", entering.length, "wait", { shot: "entered" }, "entered", () => {});
      state.entered = true;
    };

    let failure = null;
    try {
      if (!state.up) await record("load", 0, "ready", null, null, ready);
      await listen();
      first = heard.length;
      mapFrom = first;
      // a game leaving a map may write its own files (a character saved as the server ends): the map is left
      // first, so that what is put is what the next map reads and not what the last one wrote over it
      if (put.length && state.map !== null && typeof driver.leave === "function") {
        await driver.leave();
        await driver.wait(LEAVES);
        state.entered = false;
      }
      for (const each of put) {
        const bytes = each.bytes ?? readFileSync(each.file);
        await driver.put(each.path, bytes);
        note(OWN, `put ${each.path} (${bytes.length} bytes)`);
        tell?.(`put ${each.path} (${bytes.length} bytes)`);
      }
      if (!staying) await load(map, true);
      await through("steps", asked);
      for (const each of held.flat()) await expecting(each, "the run", heard.length);
    } catch (error) {
      failure = error;
    }
    // whatever is still held is let go: the next run begins with free hands
    for (const button of down) await Promise.resolve(driver.mouseUp(button)).catch(() => {});
    await listen().catch(() => {});
    state.runs++;

    // the log is kept whatever happened: a failed run's log says why
    const said = heard.slice(first).sort((a, b) => a.at - b.at);
    const lines = said.map((each) => ({ at: each.at - began, kind: each.kind, text: each.text }));
    let log = lines.map(
      (each) => `[${(each.at / 1000).toFixed(3).padStart(9)}] ${each.kind.padEnd(10)} ${each.text}`,
    );
    if (!hears)
      try {
        log = [...((await driver.log()) ?? [])].map(String);
      } catch {
        log = [];
      }
    const logFile = join(out, "log.txt");
    writeFileSync(logFile, log.join("\n"));
    const linesFile = join(out, "log.jsonl");
    if (hears)
      writeFileSync(
        linesFile,
        said.map((each) => JSON.stringify({ t: (each.at - began) / 1000, time: new Date(each.at).toISOString(), kind: each.kind, text: each.text })).join("\n"), // prettier-ignore
      );
    let sheetFile = null;
    if (sheet && pictures.length)
      try {
        sheetFile = join(out, "sheet.png");
        writeFileSync(sheetFile, sheetOf(pictures, SHEET));
      } catch {
        // pictures that are not PNG (a driver of another kind) make no sheet, and the run is no worse for it
        sheetFile = null;
      }
    const passed = !failure && expectations.every((each) => each.passed);
    const result = {
      ...{ map: state.map, out, took: Date.now() - began, passed },
      ...{ pictures, sheet: sheetFile, steps: done, expectations },
      ...{ logFile, linesFile: hears ? linesFile : null, resultFile: join(out, "result.json") },
    };
    writeFileSync(
      result.resultFile,
      JSON.stringify({ ...result, failure: failure ? failure.message : null }, null, 2),
    );
    if (failure) throw Object.assign(failure, { pictures, logFile, sheet: sheetFile, expectations });
    return { ...result, lines, log };
  }

  async function close() {
    state.up = false;
    state.entered = false;
    await driver.close();
  }

  return { ready, run, close, state };
}

/**
 * A map played from a cold start: the engine waited for, `map <name>`, the profile's steps to enter the
 * game, then `steps`, with a picture wherever a step asks for one; then the driver is closed. Resolves to
 * what `playSession`'s run does: `{ map, out, pictures, sheet, steps, expectations, passed, lines, log,
 * logFile, ... }`.
 *
 * Two pictures are taken unasked, since a run that never got into the game is told by them at a glance:
 * `loaded` when the map has loaded and `entered` after the profile's steps to enter (when it has any).
 *
 *   driver   a plain object: `ready()` resolves when the engine takes commands, `command(text)` runs a
 *            console command, `keyDown(key)`, `keyUp(key)`, `press(key)`, `click(x, y)`, `wait(ms)`,
 *            `shot(file)` writes a PNG of what the player sees, `log()` gives the console's lines and
 *            `close()` ends it. Each may be async. A driver may also have `lines(from)` (what it heard:
 *            `until` and the expectations need it), `view()` and `look({ yaw, pitch })` (`look`, `face`,
 *            `where`, an exact `turn`), `mouseDown(button)` and `mouseUp(button)`, and `put(path, bytes)` with `leave()`.
 *            `browserDriver` makes the kit's own, which has them all
 *   map      the map's name, as `map <name>` takes it
 *   steps    what to do once in the game (`playOf` has the format)
 *   out      the folder the pictures and the log go to; it is made
 *   mod      the mod's profile: its `play` part says how the game is entered and how a thing is said
 *   loads    milliseconds the map is given to load (unless told: the profile's `play.loads`)
 *   pause    milliseconds waited after a step that does something and gives no `wait` (1000)
 *   tell     a function handed a line as each thing is done, for a caller that prints while it waits
 *   expect, expectNot, put, sheet   as a session's run takes them
 *
 * Every step is checked before the driver is touched. The driver is closed and the log written whatever
 * happens; what a driver throws comes through with the step it was doing named before it. For a second map
 * or a second run without the engine's start, keep a `playSession`.
 */
export async function play({ driver, mod, pause, tell, ...run } = {}) {
  const session = playSession({ driver, mod, pause, tell });
  let result = null;
  let failure = null;
  try {
    result = await session.run({ ...run, stay: false });
  } catch (error) {
    failure = error;
  }
  // a run refused before the driver was touched leaves nothing to close
  if (session.state.up || session.state.runs)
    try {
      await session.close();
    } catch (error) {
      failure ??= new Error(`play: the driver did not close: ${error.message}`, { cause: error });
    }
  if (failure) throw failure;
  return result;
}

/** One thing done, as a line: when, how long, what, its picture and the line it waited for. */
function lineOf({ part, kind, step, at, took, picture, heard }) {
  const seconds = (ms) => `${(ms / 1000).toFixed(1).padStart(6)} s`;
  const what = kind === "ready" ? "the engine is up" : JSON.stringify(step);
  return `${seconds(at)} ${seconds(took)}  ${part === "enter" ? "enter  " : ""}${what}${heard ? `   heard: ${heard}` : ""}${picture ? `   -> ${picture}` : ""}`;
}

/** An expectation, as a line: whether it held, what it was, where it was asked and the line that decided. */
export function expectationLine({ where, kind, pattern, passed, line }) {
  const what = kind === "expect" ? "expect" : "expect no";
  const why = line ? `: ${line}` : kind === "expect" ? ": no such line was heard" : "";
  return `${passed ? "PASS" : "FAIL"}  ${what} ${pattern} (${where})${why}`;
}
