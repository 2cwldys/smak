# Playing a map in the game, and testing by what the game says

`smak play` opens a browser build of the Xash3D engine, loads a map, gets into the game as the mod's profile
says, does a list of steps, and writes down what happened: pictures, a sheet of them, and **every line the
game said, with its time**. A step can wait for a line and a run can be held to lines, so a test passes or
fails by text and nobody has to read its pictures.

It needs two things that are not part of this kit: a browser build of the engine served at an address, and
Playwright (`npm install playwright` in a folder of your own; name the folder with `--playwright` or
`PLAYWRIGHT_DIR`). The library is `src/play.mjs` (`import { play } from "smak"`); `docs/API.md` has its
functions.

## The commands

```
smak play <url> --map yard --steps steps.json -o work/run1 --mod <profile> --game <folder> --playwright <folder>
```

One run from a cold start. It ends with 0 when every expectation held, with 1 when one did not or the run
stopped. Several `--map` (each with the `--steps` given in the same place) are several runs in one start of
the engine, each in a folder of its own under `-o`.

```
smak play <url> --serve [--port 8098] --mod <profile> --game <folder> --playwright <folder>
smak play http://127.0.0.1:8098 --attach --map yard --steps steps.json -o work/run1
smak play http://127.0.0.1:8098 --attach --map road --steps more.json -o work/run2 --expect "Skeleton .* dies"
smak play http://127.0.0.1:8098 --attach --stay --steps again.json -o work/run3
smak play http://127.0.0.1:8098 --attach --close
```

**A session.** `--serve` starts the game once and keeps it; every `--attach` is a run in it that pays for its
map and not for the engine. Measured in a local build drawn in software (2026-10-13): the engine is up in 8
to 9 seconds; a small map has loaded 8 seconds after `map` the first time and 4 to 6 after that; the player
is in the game a tenth of a second after the menu's click. A cold run is in the game after 18 seconds and a
run in a session after 6, where the fixed waits of 0.11 took 79.

- `--map <name>` loads the map afresh, even the one the session is in (monsters back, doors shut).
- `--stay` loads nothing: the steps go on where the last run left the player.
- `--put <place>=<file>` writes a file into the running engine before the map loads (`--put
  msc/maps/yard.bsp=build/yard.bsp`): a map rebuilt, a script pack repacked or a save put back is tried
  without starting the engine again. The map the session is in is left first, because a game may write its own
  files as a map ends. What an engine reads only once is not changed by this: a game's list of items, read
  when its libraries load, wants a new session; so may a model the engine still holds.
- `--expect <pattern>`, `--expect-not <pattern>`: lines the whole run is held to.
- `--no-sheet`, `--show` (the browser's window seen), `--loads <ms>`, `--width`, `--height`.

What a run leaves in its folder: `NN_name.png` for each picture, `sheet.png` (all of them in one, each under
its name), `log.txt` and `log.jsonl` (what was heard), `result.json` (the steps with their times, the
expectations, `passed`, and the `failure` when it stopped).

## The steps

A JSON list. Each step is an object with at most one thing to do:

| Step | What it does |
| --- | --- |
| `{ "command": "noclip" }` | a console command, or a list of them |
| `{ "say": "hail" }` | said as the profile says a thing is said |
| `{ "walk": 2000 }` | forward for that many milliseconds; `"to": "back"`, `"left"`, `"right"` |
| `{ "turn": 90 }` | 90 degrees to the left (under 0: right). Exact: the yaw is read, added to and set |
| `{ "face": 90 }` | turned to that yaw: 0 looks along +x, 90 along +y |
| `{ "look": -30 }` | looking 30 degrees down (over 0: up; 0: level). `face` and `look` may share a step |
| `{ "button": "use", "ms": 200 }` | one of the game's buttons held: `+use`, the wait, `-use` |
| `{ "mouse": "left", "ms": 2500 }` | a button of the mouse held that long: `left`, `right`, `middle` |
| `{ "mouseDown": "left" }` ... `{ "mouseUp": "left" }` | held while the steps between are done (let go at the run's end if not before) |
| `{ "hold": "w", "ms": 2000 }`, `{ "press": "Enter" }`, `{ "click": [512, 330] }` | a key held, a key pressed, a click on the page |
| `{ "goto": [512, 96, 36] }` | the player put at that place (the middle of his box: the floor and 36), by the profile's command; then read back, and the run stops if he is not there |
| `{ "where": "gate" }` | a line in the log: `where gate: origin 512 96 36, yaw 90, pitch -30` |
| `{ "map": "road" }` | another map loaded and entered, in the same run |
| `{ "expect": "HIT! .* holy damage" }` | the run fails unless a line heard matches |
| `{ "expectNot": "Script Error" }` | the run fails if a line heard matches |

and any step may carry:

| Beside | What it does |
| --- | --- |
| `"until": "Skeleton .* dies"` | after the step, wait for a line the game says (from the step's beginning on) and not for the clock |
| `"within": 20000` | the longest `until` waits (30000). Past it the run stops and says what it waited for and the last lines heard. With `expect`: how long the line is given to come (unless told, it has to be there already); with `expectNot`: how long it is watched for |
| `"every": 1000` | with `until`: the step is done again that often until the line comes (a click a menu does not take until it is drawn) |
| `"since": "map"` | with `expect`, `expectNot`: read the lines since the run began (`"run"`, the default), since the map last loaded (`"map"`), since this step began (`"step"`), or since the picture of that name |
| `"wait": 1500` | milliseconds waited after it (1000 after a step that does something and has no `until`) |
| `"shot": "gate"` | a picture taken after the wait |

So `{ "wait": 5000 }` only waits, `{ "shot": "here" }` only takes a picture, `{ "until": "dies" }` only waits
for a line. A pattern is a regular expression as text, matched as written (capitals count); `"/flame
sinks/i"` gives flags.

A test, whole:

```json
[
  { "look": -55 },
  { "button": "use", "ms": 200, "until": "The trial chest gives you blunt_lantern", "every": 1500 },
  { "goto": [272, 48, 36] },
  { "face": 0, "look": -5, "shot": "at_dummy" },
  { "mouse": "right", "ms": 250, "until": "You kindle the lantern", "shot": "kindled" },
  { "mouseDown": "left" },
  { "until": "holy damage", "within": 15000 },
  { "until": "The flame sinks", "within": 90000, "shot": "sunk" },
  { "mouseUp": "left" },
  { "expect": "HIT! .* holy damage" },
  { "expectNot": "Script Error|PAGE ERROR" }
]
```

An expectation that does not hold does not stop the run: every one is looked at, and the run ends `FAILED`
with each on a line (`PASS  expect /.../ (step 10): the line that decided`). A line an `until` waited for in
vain does stop it: the steps after it would be done in a game that is not where they think.

## What is heard

`log.txt` has a line for everything, with its seconds from the run's start and its kind:

```
[   13.668] HUDInfoMsg ent_owner CHARGEPROBE blunt begin
[   13.877] HUDInfoMsg You attack a Trial Dummy. (61/0) HIT! 35.5 blunt damage.
[   14.584] TextMsg    TRIAL get target haseffect = 0
[   15.002] console    [19:22:41] Host_EndGame: disconnected from server
[   15.100] where      where gate: origin 512 96 36, yaw 90, pitch -30
[   15.101] play       15.0 s    0.1 s  {"where":"gate"}
```

- `console`: the page's console, which is the engine's; `error`: an error of the page (`PAGE ERROR: ...`).
- **A message's name**: what the server told the player. A GoldSrc game speaks to its players in "user
  messages": HUD text, hints, chat. The browser driver listens to the ones the profile names, in the engine's
  own table of them, and the profile reads their bytes (`play.messages`). The SDK's two, `TextMsg` (what a
  script or the game prints to a player's console or the middle of his screen) and `SayText`, are read for
  any game. Nothing of the game is changed for this (`src/play-browser.mjs` says how it is done).
- `where`: a `where` step's answer. `play`: the run's own notes (each step as it ended, each expectation);
  these are never matched by an `until` or an expectation.

`log.jsonl` is the same, one JSON object a line: `{ "t": 13.877, "time": "2026-10-13T19:22:55.012Z", "kind":
"HUDInfoMsg", "text": "..." }`.

What is NOT heard: what a game draws without telling (a health bar's length, a model's animation), and what a
build prints nowhere (Master Sword's script command `dbg` is compiled out of a release build; `consolemsg`
and the `playermessage` family are heard).

## The profile's part

Everything that is one game's is the `play` field of its profile (`docs/MAPS-MAKING.md`, "A mod's profile"):

```js
play: {
  enter: [{ click: [512, 330], every: 1000, until: "^Welcome to Master Sword", within: 60000 }],
  say: ["cmd say_text 1 {text}"],
  loads: 90000,                                    // the longest a map is given to load
  loaded: "Custom resource propagation complete",  // the line that says it has: waited for, not the clock
  goto: ["trial goto {x} {y} {z}"],                // the game's command that puts the player at a place, if it has one
  messages: { HUDInfoMsg: hudInfoLines, TextMsg: "textmsg", SayText: "saytext" },
  yawspeed: 210, screen: [1024, 768],
}
```

`messages` gives each user message the way its bytes are read: `"textmsg"`, `"saytext"`, `"strings"` (every
string in it, for a message whose layout you do not know yet), or a function of the bytes that gives a line,
several, or nothing. To find a game's messages: its server registers them by name (`REG_USER_MSG`), and
`"strings"` on a name shows what it carries. `profiles/mastersword.mjs` is a whole example, with where each
fact is from.

With no profile (`GOLDSRC`) nothing is clicked to enter, a thing is said with `say`, the engine's own line is
waited for, `TextMsg` and `SayText` are read, and a `goto` step is refused: the engine has no command that
puts a player at a place.

## From a script

```js
import { play } from "./smak/src/index.mjs";
const driver = play.browserDriver({ url, playwright: "C:/tools/browser", messages: play.messagesOf(mod) });
const session = play.playSession({ driver, mod });
const first = await session.run({ map: "yard", steps, out: "work/first", expect: ["holy damage"] });
const second = await session.run({ map: "road", steps: more, out: "work/second" });
await session.close();
first.passed; first.expectations; first.lines; first.pictures; first.sheet;
```

`play.play({ driver, map, steps, out, mod })` is one run with the driver closed after it.
`play.serveSession({ session, port })` and `play.attachSession(address, run)` are the session shared between
processes. `play.sheetOf(files, { cols, shrink })` is the sheet by itself. A driver of your own is a plain
object (`ready, command, keyDown, keyUp, press, click, wait, shot, log, close`); with `lines(from)` it can be
waited on and expected of, with `view()` and `look()` it turns exactly, with `mouseDown`/`mouseUp`, `put` and
`leave` it does the rest.

## When it does not work

| What you see | Why, and what to do |
| --- | --- |
| `the map X had not loaded after N seconds: the game never said /.../` | The map did not load. The last lines heard are in the sentence and in `log.txt`: a missing file, a map with no place to put a player |
| `the game never said /Welcome.../ ... (at the profile's enter step 1)` | The menu was not got through. Open `00_loaded.png`: is the menu where the profile clicks? |
| `the game never said /.../ in the N seconds it was given` | The line did not come. The sentence ends with the last lines that did: is the pattern right (capitals, a full stop), is the thing in reach? |
| `the player was to be put at ... and is at ...` | The profile's `goto` command did nothing: this map does not have it |
| `the view cannot be read: this build of the engine does not export pfnSPR_Load...` | The view cannot be read or set in this build. A `turn` is then by time (the game's `+left` held: about right only, and the log says so); `face`, `look` and `where` stop the run |
| A message named in the profile is never heard | It is not in the engine's table (the game does not register it), or the game's client takes it by no function. `driver.unheard()` lists them |
| A new item, or a script's new model, is not there after `--put` | The game read its list once, when it started: close the session and start it again |
