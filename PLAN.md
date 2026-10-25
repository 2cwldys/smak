# SMAK: the next plan (fewer errors, easier tests, fewer tokens)

Started 2026-10-24, after reading [universal-modder](https://github.com/rehan-remade/universal-modder) (MIT;
read, not installed). What it does better than SMAK is taken here as ideas, written SMAK's way: Node, no
dependencies, tested. Its fal (paid) generation, its Python CLI and its playbooks for other engines are not
taken.

Each phase says what it is for, what it delivers, and how we know it worked. The measures in "Now" were taken
on 0.26.0.

## Now (0.26.0)

| Measure | Value |
| --- | --- |
| What an agent reads before a task: `AGENTS.md` | 112 KB, about 28,000 tokens, every task |
| The other guides (`docs/*.md`), read as needed | 530 KB; `API.md` 120 KB, `SPEC.md` 111 KB, `MAPS.md` 107 KB |
| Tests | 755 passing, in 116 files; none checks that a checker fails on a broken input |
| Where a test runs in the game | only a browser build of Xash3D (`smak play`); never the Steam game |
| Before sharing a map or model | nothing checks that it carries none of the game's files |

## Phase 1: fewer tokens (first, because every later phase pays for it)

**1a. `AGENTS.md` becomes an index.** About 6 KB holds the loop, the rules that keep a model working, how to
report, and a table "task → the one guide to read". The recipes, the command line and the long sections move
into the guides they belong to (most of them are there already, twice). Measure: under 8,000 tokens read at
the start of a task, and a sample of five usual tasks (re-skin, item from a kit, map from a spec, walk test,
play a map) each needing one guide at most.

**1b. Answers in text first.** Every command that checks something ends with one line, `PASS`/`FAIL`, and the
reasons, and writes the detail to a file instead of the terminal. `check`, `maps check`, the judges and
`play` say which picture to look at when one is needed, and none when the text decides. Measure: a passing
run of each prints 5 lines or fewer.

**1c. Pictures cheap by default.** Contact sheets and pictures at the size that answers the question (the
judges' crops, a third of the screen for `play`), the full size only when asked for.

## Phase 2: fewer errors (checks that are known to fail when they should)

**2a. A broken case for every checker.** `test/broken/` holds inputs with exactly one defect each, and the
message each must give. To begin with:

- a model over the engine's limits (vertices, bones, textures over 100);
- a texture off its palette;
- a sequence with a missing event;
- a map with a leak, an entity the mod lacks, or a spawn in a wall;
- a figure in another game's style, for the judges.

A test fails when a checker passes any of them, or fails for another reason. The rule goes in `AGENTS.md`: a
new checker comes with its broken cases. This is the rule NEXT.md already keeps for map comparisons, made a
test. Measure: every command that says PASS/FAIL has at least one broken case.

**2b. Evidence in every report.** Each claim an agent hands over says how it is known:

| Label | Means |
| --- | --- |
| read | read in the code or the files |
| drawn | in the kit's pictures |
| checked | by a SMAK check |
| played | in the game, and which game: browser Xash or Steam |

Only "played" may say "works in the game". This goes in `AGENTS.md` ("Reporting to the person").

**2c. Stop after three.** After the same failure three times, the agent writes down what it knows and changes
approach, or asks. One line in `AGENTS.md`.

## Phase 3: easier tests (the real game, without the mouse)

**3a. `smak play --native` for the Steam game, by its console.** GoldSrc reads commands from its command line
and from a `.cfg`, and `-condebug` writes its console to a file. So a run needs no input at all:

1. write the steps that are console commands into a `.cfg`;
2. start `hl.exe -game <mod> -insecure -windowed -w 1024 -h 768 -condebug +map <map> +exec smak_run.cfg`;
3. wait for the lines the steps expect in the console file;
4. pass or fail as `smak play` does today, and close the game.

`-insecure` keeps it off VAC; it only ever starts a local game, never joins a server. The same steps file
should run in the browser and in Steam.

First targets:
- a map of ours for The Specialists, then Half-Life;
- `msc` is installed in the Steam folder too.

Found by hand, 2026-10-24 (TS, `h9_te_neuropolis`, build 8684, Steam running):
- the console file is `qconsole.log` in the Half-Life folder, not the mod's, and each run **adds** to it: a run
  reads only what follows its own start;
- `+exec` runs while the map is still loading (the player not in yet), so a step that needs the player waits
  first: 1,500 `wait` lines brought the player in (`status` showed them at 1616 1056 38, 14 s in). Frames, not
  seconds: the run should wait on a line in the log instead where it can;
- `screenshot` writes `HalfLife00.tga` (1024×768, 24-bit, bottom-up) in the mod's folder: a picture of the real
  game with no window capture, so 3b may not be needed;
- `quit` at the end closes it cleanly (18 s for the whole run);
- the log already tells faults: Neuropolis lacks `sound/callhascome.wav` and its sky `gfx/env/neurort.tga`;
- with Steam running it starts with no prompt; without Steam was not tried.

Measure: a map that passes `maps check` is played in TS from Steam by one command, and its log decides.

**3b. Pictures of the native game** (only after 3a works). A picture of the game's window through Windows'
own capture (`Windows.Graphics.Capture`; ordinary capture comes out black for GPU games), with a PowerShell
helper called from Node.

**3c. Input to the native game, last and only if needed** (walking a route, a fight). Rules taken from
universal-modder:
- input only while the game's window is in front;
- not while the person is using the machine (check idle time; ask first);
- exact process ids, never killing by name.

Most of what a test needs is a console command (`setpos`, `give`, `impulse`, the mod's own), so this may
never be needed.

## Phase 4: before sharing

**`smak check --publish <folder> --game <game folder>`** fails on:
- a file byte for byte one of the game's;
- a texture of the game's `.wad` inside a map's own `.wad`;
- an absolute path of the user's;
- a key or token.

It warns on large archives and on a missing readme. Measure: it fails on a broken folder made for it (see 2a)
and passes a map we have released.

## Phase 5: art from a generator (a recipe, not code)

`docs/IMPORT.md` gets a section on bringing generated art in:
- images for textures from a local ComfyUI (free, on the GPU);
- meshes as `.glb` from Blender's generator or any service.

From there SMAK's own import, fit and checks take over. Nothing of a paid service goes into the kit.

## Order and size

| Phase | For | Size |
| --- | --- | --- |
| 1a, 1b, 1c | tokens | small to medium: mostly moving text, then a pass over the commands' output |
| 2a, 2b, 2c | errors | medium: the broken cases are the work; the rules are lines |
| 3a | testing | medium: one new mode of `play`; the open questions first, by hand |
| 4 | errors | small |
| 3b, 3c, 5 | testing | after the rest, if still wanted |

1 and 2a can go to separate agents at the same time (one moves text, the other writes test inputs). 3a needs
the person once, to say the Steam game may be started.

Each phase ends with its measure taken and written here.
