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

**Done 2026-10-24**: `smak play native --map h9_te_neuropolis --mod ts --expect-not "Couldn't load gfx/env"`
ran in 4.0 s and failed by the log, as it should: Neuropolis lacks its sky. Commands are not put in a `.cfg`
once: the start `.cfg` keeps a loop that reads a file every 5 frames, and each command is a file of its own that
runs once and answers (`SMAK_ACK n`) in 0.1 to 0.2 s, so a run is driven step by step like the browser's.
A map is in when `status` names the player. Test 108 holds the protocol against a fake engine. TS cannot be
entered by the console: after `slot7` (Random) its client lets the player in only on the key bound to `+attack`
(it prints "MOUSE1 is unbound" for the console's `+attack`), so a TS run is a spectator's; walking it needs 3c's
real input. A step's `bind` was found saved into the person's config.cfg: the driver now puts the file back.

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

**Done 2026-10-24.** Four broken cases (a game's sound copied, a game's texture in one's own `.wad`, a path into
the home folder, a GitHub token) fail for their reason, and their twin passes. The released map did not pass,
and was right not to: `h9_te_neuropolis.bsp`, as handed to Havoc9, carries 11 of `valve/halflife.wad`'s
textures inside it (`C1A3FLOOR02`, `CRATE05`, ...), which TS players have already, being Half-Life's. Its
plugin's `ts_matchmode.cfg` names `D:\Downloads\TSM` in a comment (theirs): a warning. A map of one's own
installed in the game's folder is said `--ours`, or it is the game's file byte for byte.

## Phase 5: art from a generator (a recipe, not code)

`docs/IMPORT.md` gets a section on bringing generated art in:
- images for textures from a local ComfyUI (free, on the GPU);
- meshes as `.glb` from Blender's generator or any service.

From there SMAK's own import, fit and checks take over. Nothing of a paid service goes into the kit.

## Which model does the work (measured 2026-10-25)

Three of 1a's usual tasks, each given to Haiku, Sonnet and Opus as subagents with the same prompt and only
`AGENTS.md` to start from: Barney's shirt made dark olive (re-skin), a flanged mace in Master Sword's
one-handed blunt family (item from a kit), and a corridor, hall, raised gallery by stairs and storeroom behind
a door, compiled with SDHLT (map from a spec). Every run passed its checks; the pictures were judged by Opus.

| Task | Model | Tokens | Tools | Time | Runs | The pictures |
| --- | --- | --- | --- | --- | --- | --- |
| re-skin | Haiku | 90,700 | 24 | 106 s | 1 | right; green lighter than asked. Alone with Opus in naming the `barney01`-`03` files a renamed model needs |
| re-skin | Sonnet | 66,900 | 15 | 70 s | 1 | right; passed the same warning without a word |
| re-skin | Opus | 84,000 | 24 | 171 s | 3 | right; recoloured the palette, so the textures' unused margins cannot bleed blue at seams |
| item | Haiku | 93,300 | 23 | 113 s | 2 | **wrong**: a ball with six spikes, not flanges, and it described the spikes without seeing it |
| item | Sonnet | 60,000 | 13 | 61 s | 1 | right, the best of the three |
| item | Opus | 66,500 | 19 | 116 s | 1 | right; head broader than the game's, said so |
| map | Haiku | 101,400 | 27 | 118 s | 2 | right, and the closest to the brief (concrete floors, pale walls) |
| map | Sonnet | 70,300 | 18 | 84 s | 3 | layout right; materials off the brief (busy lab panels), said so |
| map | Opus | 79,500 | 16 | 112 s | 3 | right; two floors tile where metal was asked, said so |

What it says:
- **Haiku is not cheaper here.** It took the most tokens on every task (about 1.4 times Sonnet's), in more
  rounds of small helper scripts. The checks kept every run sound; Haiku's one miss is the kind only a
  picture shows, and it looked at the picture and did not see it.
- **Sonnet is the cheapest and fastest**, and was right on shape; it was the least careful with what the
  person asked of the look, and with a warning it should have passed on.
- **Opus found the most about the kit itself** (below), and the subtlest risk (the margins).
- So: Sonnet for work a check and one look decide; Opus to judge the pictures, to talk to the person, and for
  anything that touches their machine (3c). Haiku is not given SMAK's work.

What the runs found wrong with the kit (all fixed the same day; CHANGELOG "Unreleased"):
- 4 of 9 runs first imported the kit by a bare `C:/` path; Node on Windows needs a `file://` URL, and no
  guide says so.
- All 3 map runs first set `VHLT_DIR` to SDHLT's folder; the programs are in `tools/Win64`. The build should
  look there itself.
- `smak item` ends with no `PASS`/`FAIL` line (1b missed it).
- A room's own floor texture is reported as `fact [object Object]: ...`.
- No Half-Life `.fgd` is found on a machine without one; one map run took Master Sword's and got a false fault.
- The sequence-group warning on a model with `01`-`03` files does not say that a renamed model needs them
  renamed too.

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
