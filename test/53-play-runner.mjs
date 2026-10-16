// The play driver's runner, as a long run in the game asked for it: a line already said before its step
// began, sections with a run that begins at one and steps that fail and let it go on, values kept from what
// was said, a way to another map gone through and the map followed by its server's line, a run's summary,
// and what the script check says the game cuts of a description or a name.
//
// No browser and no game: the driver is fixture-game.mjs's, with a clock of its own.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { scriptLint } from "../profiles/mastersword.mjs";
import { test, testAsync, sure, tmp } from "./helper.mjs";
import { GAME, GAME_SAYS, gameDriver, refusalOf } from "./fixture-game.mjs";

const { play, playOf, playSession, summaryLines } = smak.play;
const folder = join(tmp, "play-runner");
mkdirSync(folder, { recursive: true });
const inFolder = (name) => join(folder, name);
const refusal = (run) => {
  try {
    run();
  } catch (e) {
    return e.message;
  }
  return "";
};
/** The made-up game with a way to another map: `accept` takes the player, and the engine names the map. */
const TRAVELS = { ...GAME, play: { ...GAME.play, travel: { commands: ["accept"], spawned: "^Spawn Server: (\\S+)" } } };
const logOf = (run) => readFileSync(run.logFile ?? join(run.out, "log.txt"), "utf8");

test("playOf takes already, onFail, keep, section and travel, and refuses them wrong", () => {
  const [fight, wait, deed, section, travel, kept] = playOf(
    [
      { fight: true, until: "quiet", within: 9000 },
      { until: "bell" },
      { command: "ring", until: "bell", already: "pass" },
      { section: "terraces", onFail: "continue" },
      { travel: "road", within: 5000 },
      { command: "ask hp", until: "hp is", keep: { hp: "hp is (\\d+)" }, onFail: "continue" },
    ],
    { mod: TRAVELS },
  );
  sure(fight.already === "pass" && wait.already === "warn" && deed.already === "pass", `already: a fight passes, a wait warns, as told otherwise: ${fight.already} ${wait.already} ${deed.already}`); // prettier-ignore
  sure(playOf([{ command: "x", until: "y" }])[0].already === "wait", "a step that does a thing waits for its own answer");
  sure(section.kind === "section" && section.name === "terraces" && section.onFail === "continue" && section.wait === 0, JSON.stringify(section)); // prettier-ignore
  sure(travel.kind === "travel" && travel.map === "road" && travel.within === 5000 && travel.commands.join() === "accept" && travel.wait === 0, JSON.stringify(travel)); // prettier-ignore
  sure(kept.keep[0].name === "hp" && kept.keep[0].pattern.test("hp is 3") && kept.onFail === "continue", "a keep and an onFail");
  const [named] = playOf([{ expect: "hp is ${hp}$" }]);
  sure(named.templates.pattern === "hp is ${hp}$", "a pattern that names a kept value is kept as written, to be made whole");
  const wrong = [
    [[{ command: "x", already: "pass" }], /step 1 has already, which goes with until only/],
    [[{ until: "x", already: "soon" }], /step 1 does "soon" with a line heard before it began: pass, warn, wait/],
    [[{ walk: 100, onFail: "later" }], /step 1 does "later" when it fails: stop, continue/],
    [[{ command: "x", keep: { "h p": "x" } }], /step 1 keeps \{"h p":"x"\}: \{ "name": "a pattern/],
    [[{ command: "x", keep: [] }], /step 1 keeps \[\]/],
    [[{ section: "a b" }], /step 1 opens the section "a b": a name of letters/],
    [[{ section: "a", wait: 100 }], /step 1 opens a section and has wait: a section's step holds its name and onFail only/],
    [[{ travel: true, until: "x" }], /step 1 has until and travel/],
    [[{ travel: 3 }], /step 1 travels to 3: true, or the name of the map/],
  ]; // prettier-ignore
  for (const [steps, sentence] of wrong) {
    const said = refusal(() => playOf(steps, { mod: TRAVELS }));
    sure(sentence.test(said), `${JSON.stringify(steps)} was ${said ? `refused with: ${said}` : "not refused"}`);
  }
  sure(/step 1 travels to another map, and the profile names no way to \(play\.travel/.test(refusal(() => playOf([{ travel: true }], { mod: GAME }))), "a travel with no profile's way is refused"); // prettier-ignore
});

await testAsync(
  "a line said before its step began: a fight ends at once, a wait warns, and a wait in vain says when it was heard",
  "play: a line already said",
  async () => {
    const says = { ...GAME_SAYS, "ring bell": [[100, "the yard is quiet"], [200, "the bell rings"]], other: [] };
    const driver = gameDriver(says);
    const run = await play({
      ...{ driver, map: "yard", out: inFolder("already"), mod: GAME },
      steps: [
        { command: "ring bell", wait: 500 },
        { command: "other", wait: 500 },
        { fight: true, until: "the yard is quiet", within: 60000, shot: "quiet" },
        { until: "the bell rings", within: 1000, onFail: "continue" },
        { expect: "the bell rings" },
      ],
    });
    const fought = run.steps.find((each) => each.kind === "fight");
    sure(fought?.already === true && fought.heard === "the yard is quiet", `the fight ended at once by the line said before it: ${JSON.stringify(fought)}`); // prettier-ignore
    sure(run.fights.length === 0 && !driver.calls.some((call) => /nearest/.test(call)), "and no enemy was asked for");
    const log = logOf(run);
    sure(/step 3: "the yard is quiet" was heard at [\d.]+ s, before the step began: it ends at once \(already: "pass"\)/.test(log), "the log says so"); // prettier-ignore
    sure(/step 4: WARN "the bell rings" was heard at [\d.]+ s, before the step began; it waits for the line all the same/.test(log), "a wait warns of its line said before"); // prettier-ignore
    const failed = run.expectations.find((each) => each.kind === "step");
    sure(failed && !failed.passed && /never said \/the bell rings\/ .* This line was heard at [\d.]+ s, before the step began: "the bell rings"/.test(failed.line), `and the wait in vain says when its line was heard: ${failed?.line}`); // prettier-ignore
    sure(run.expectations.at(-1).passed && run.passed === false, "the run went on (onFail: continue), and failed");
    sure(/FAIL  step \{"until":"the bell rings"/.test(log), "the failed step is in the log as an expectation");
  },
);

await testAsync(
  "sections timed and counted, a run that begins at one, a step that fails and lets the run go on, and the summary",
  "play: sections, from and the summary",
  async () => {
    const says = { ...GAME_SAYS, "heal me": [[50, "health 100"]], hurt: [[100, "a rat hits you for 7"], [150, "a rat hits you for 3"]], kill: [[100, "you killed rat"], [120, "you died"]] }; // prettier-ignore
    const driver = gameDriver(says);
    const session = playSession({ driver, mod: GAME });
    const steps = [
      { command: "look", wait: 100 },
      { section: "cellar" },
      { command: "hurt", wait: 300 },
      { command: "heal me", wait: 100 },
      { section: "hall", onFail: "continue" },
      { command: "kill", wait: 300 },
      { until: "a ghost", within: 500 },
      { command: "heal me", wait: 100 },
    ];
    const first = await session.run({ map: "yard", steps, out: inFolder("sections") });
    const names = first.summary.sections.map((each) => each.name).join();
    sure(names === "(start),cellar,hall", `the sections: ${names}`);
    const [, cellar, hall] = first.summary.sections;
    sure(cellar.step === 2 && cellar.steps === 2 && cellar.heals === 1 && cellar.taken.hits === 2 && cellar.taken.sum === 10 && cellar.ended === "done", `the cellar counted: ${JSON.stringify(cellar)}`); // prettier-ignore
    sure(hall.deaths === 1 && hall.slain === 1 && hall.heals === 1 && hall.expectations.failed === 1, `the hall counted, its wait in vain gone on from: ${JSON.stringify(hall)}`); // prettier-ignore
    sure(first.summary.totals.heals === 2 && first.summary.totals.taken.sum === 10 && first.passed === false, "the run's totals");
    const file = JSON.parse(readFileSync(join(first.out, "summary.json"), "utf8"));
    sure(file.sections.length === 3 && file.chain.runs.length === 1, "summary.json is written beside the log");
    const lines = summaryLines(first.summary);
    sure(/^section cellar \(step 2\): [\d.]+ s, done; 2 steps; 0 fights; 1 heal, 0 deaths; taken 2 hits, 10 in all/.test(lines[1]) && /^the run: /.test(lines.at(-1)), lines.join("\n")); // prettier-ignore

    // on from the hall, staying: the steps before it are not done, and the two runs add up
    const calls = driver.calls.length;
    const second = await session.run({ stay: true, steps, from: "hall", out: inFolder("sections-from") });
    const done = second.steps.filter((each) => each.part === "steps").map((each) => each.index + 1).join();
    sure(done === "5,6,7,8", `from the hall: steps ${done}`);
    sure(/never said \/a ghost\//.test(second.steps.find((each) => each.index === 6)?.failed), "the step that failed is among the steps, with why");
    sure(!driver.calls.slice(calls).some((call) => call === "command hurt"), "the cellar's steps were not done");
    sure(second.summary.chain.runs.length === 2 && second.summary.chain.totals.heals === 3, `the runs since the map was loaded: ${JSON.stringify(second.summary.chain)}`); // prettier-ignore
    sure(/from step 5 \(section hall\): steps 1 to 4 are not done/.test(logOf(second)), "the log says where it began");
    const third = await session.run({ stay: true, steps, from: 8, out: inFolder("sections-8") });
    sure(third.summary.sections[0].name === "hall" && third.summary.sections[0].steps === 1, "from a step's number, in the section it is in");
    const said = await refusalOf(() => session.run({ stay: true, steps, from: "attic", out: inFolder("sections-no") }));
    sure(/from "attic": the steps have no section of that name \(cellar, hall\)/.test(said), said);
    const stopped = await refusalOf(() => session.run({ stay: true, steps: [{ until: "never", within: 200 }], out: inFolder("sections-stop") })); // prettier-ignore
    sure(/never said \/never\//.test(stopped), "without onFail a wait in vain stops the run, as ever");
    await session.close();
  },
);

await testAsync("a value kept from what was said, and named by later steps", "play: kept values", async () => {
  const says = { ...GAME_SAYS, "ask hp": [[100, "TRIAL get me hp = 42.5"]], "say 42.5": [[50, "you said 42.5"]], "ask name": [[50, "name Deoroot"]] }; // prettier-ignore
  const driver = gameDriver(says);
  const session = playSession({ driver, mod: GAME });
  const run = await session.run({
    ...{ map: "yard", out: inFolder("kept") },
    steps: [
      { command: "ask hp", until: "TRIAL get me hp", keep: { hp: "= ([\\d.]+)" } },
      { command: "ask name", wait: 300, keep: { who: "^name (\\w+)" } },
      { command: "say ${hp}", until: "you said ${hp}$" },
      { expect: "hp = ${hp}$" },
      { expectNot: "hp = 4.5" },
      { expect: "^name ${who}" },
    ],
  });
  sure(driver.calls.includes("command say 42.5"), "a command names the kept value");
  sure(run.passed && run.expectations.every((each) => each.passed), run.expectations.map((each) => `${each.pattern} ${each.passed}`).join("; ")); // prettier-ignore
  sure(/step 1: kept hp = 42\.5/.test(logOf(run)) && /step 2: kept who = Deoroot/.test(logOf(run)), "the log says what was kept");
  // a run that stays has them still; one never kept is refused where it is named
  const again = await session.run({ stay: true, steps: [{ command: "ask hp", until: "= ${hp}$" }], out: inFolder("kept-stay") }); // prettier-ignore
  sure(again.passed, "a run that stays has the values kept before");
  const said = await refusalOf(() => session.run({ stay: true, steps: [{ expect: "${mana}" }], out: inFolder("kept-none") }));
  sure(/step 1 names \$\{mana\}, and no step before it has kept a value of that name/.test(said), said);
  const unmatched = await refusalOf(() => session.run({ stay: true, steps: [{ command: "ask hp", wait: 200, keep: { mp: "mp = (\\d+)" } }], out: inFolder("kept-unmatched") })); // prettier-ignore
  sure(/step 1 keeps mp by \/mp = \(\\d\+\)\/, and nothing said since it began matches it/.test(unmatched), unmatched);
  await session.close();
});

await testAsync(
  "a way to another map gone through, and the map the session is in followed by its server's line",
  "play: travel",
  async () => {
    const says = {
      ...GAME_SAYS,
      "walk in": [[300, "Travel to next area (road): press enter"]],
      accept: [[1500, "Spawn Server: road []"], [4000, "the map is in"]],
      teleport: [[200, "Spawn Server: cave []"]],
    };
    const driver = gameDriver(says);
    const session = playSession({ driver, mod: TRAVELS });
    const run = await session.run({
      ...{ map: "yard", out: inFolder("travel") },
      steps: [
        { command: "walk in", until: "Travel to next area" },
        { travel: "road", shot: "arrived" },
        { expect: "welcome", since: "map" },
      ],
    });
    sure(session.state.map === "road" && session.state.entered, `the session is in road: ${JSON.stringify(session.state)}`);
    const clicks = driver.calls.filter((call) => /^click/.test(call)).length;
    sure(clicks === 2 && driver.calls.includes("command accept"), "the profile's command, and its enter after the map loaded");
    sure(run.passed && run.map === "road" && /step 2: travelled to road/.test(logOf(run)), "the run says where it went");
    // a map changed by the game itself is followed all the same
    await session.run({ stay: true, steps: [{ command: "teleport", wait: 500 }], out: inFolder("travel-followed") });
    sure(session.state.map === "cave", `followed by the line: ${session.state.map}`);
    const wrong = gameDriver({ ...says, accept: [[500, "Spawn Server: cave []"]] });
    const said = await refusalOf(() =>
      play({ driver: wrong, map: "yard", mod: TRAVELS, out: inFolder("travel-wrong"), steps: [{ travel: "road" }] }),
    );
    sure(/the way led to cave, and the step travels to road/.test(said), said);
    const nowhere = await refusalOf(() =>
      play({ driver: gameDriver(GAME_SAYS), map: "yard", mod: TRAVELS, out: inFolder("travel-none"), steps: [{ travel: true, within: 2000 }] }), // prettier-ignore
    );
    sure(/the game never said .*Spawn Server.* in the 2 seconds a travel was given: is the player in a way/.test(nowhere), nowhere);
    await session.close();
  },
);

test("the script check warns of a description and a name the game cuts", () => {
  const text = [
    "{",
    `\tname\t\tthe|Warden's Bow`,
    `\tdesc\t\tA bow of black yew bound in iron. Its arrows burn the restless dead`,
    `\tname\t\ta|Lantern Mace of the Very Long Name`,
    `\tdesc\t\t"An iron-bound mace, a caged lantern for its head, and words enough to be cut off"`,
    `\tname\t\tA name of no prefix, however long it is, is not cut`,
    `//\tdesc\t\t${"x".repeat(80)}`,
    "}",
  ].join("\r\n");
  const said = scriptLint(text);
  sure(said.length === 2, `two of the lines are cut: ${said.join(" | ")}`);
  sure(/^line 4: its name "a\|Lantern Mace of the Very Long Name" is 35 characters with its prefix, and the game keeps 29 of the two \(shared\/ms\/scriptcmds\.cpp, ScriptCmd_Name\): the name becomes "Lantern Mace of the Very Lon"$/.test(said[0]), said[0]); // prettier-ignore
  sure(/^line 5: its desc is 80 characters, and the game keeps 72 of it .*: "An iron-bound mace, a caged lantern for its head, and words enough to be" \(cut: " cut off"\)$/.test(said[1]), said[1]); // prettier-ignore
  const placed = smak.maps.scriptsPlaced({
    ours: new Map([["items/mace", { text, file: "items/mace.script" }]]),
    shipped: new Map([["items/mace", ""]]),
    rules: { lint: (name, body) => scriptLint(body) },
  });
  sure(placed.warnings.length === 2 && placed.warnings.every((each) => each.startsWith("items/mace (items/mace.script): line ")), placed.warnings.join(" | ")); // prettier-ignore
});
