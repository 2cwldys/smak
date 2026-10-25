// A run of `play` broken in one way each: a line expected that the game never says, and one expected not to be
// said that it says. The driver is a fake with a clock of its own and a game that says what it is told to, as in
// 40-play-heard.mjs: what is tested is that the run fails, and on which expectation.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../../src/index.mjs";
import { tmp } from "../helper.mjs";
import { brokenAsync } from "./case.mjs";

const { play, expectationLine } = smak.play;
const folder = join(tmp, "broken-play");
mkdirSync(folder, { recursive: true });

/** A driver whose game says, `after` ms after a command, each of its lines: `says` { command: [[after, text]] }. */
const speaking = (says) => {
  let now = Date.now();
  const due = [];
  const heard = [];
  const picture = smak.png(4, 4, new Uint8Array(4 * 4 * 4).fill(200));
  const nothing = () => {};
  return {
    clock: () => now,
    ready: nothing,
    command: (text) => {
      for (const [after, line] of says[text] ?? []) due.push({ at: now + after, kind: "console", text: line });
    },
    ...Object.fromEntries(["click", "keyDown", "keyUp", "press", "mouseDown", "mouseUp", "put", "leave", "close"].map((name) => [name, nothing])), // prettier-ignore
    wait: (ms) => void (now += ms),
    shot: (file) => writeFileSync(file, picture),
    view: () => ({ yaw: 0, pitch: 0, origin: [0, 0, 36] }),
    look: (to) => ({ yaw: 0, pitch: 0, origin: [0, 0, 36], ...to }),
    lines: (from = 0) => {
      for (let at = due.length - 1; at >= 0; at--) if (due[at].at <= now) heard.push(...due.splice(at, 1));
      heard.sort((a, b) => a.at - b.at);
      return heard.slice(from);
    },
    log: () => heard.map((each) => each.text),
  };
};
const GAME = { name: "smakgame", play: { enter: [], say: ["say {text}"], loads: 20000, loaded: "the map is in" } };
/** A run of the yard: the lantern kindled, and what the game says to it. */
const run = async (name, lantern, steps) => {
  const said = await play({
    driver: speaking({ "map yard": [[100, "the map is in"]], kindle: lantern }),
    ...{ map: "yard", out: join(folder, name), mod: GAME },
    steps: [{ command: "kindle" }, ...steps],
  });
  // each expectation that did not hold, with what came of the run; a run failed with none, or passed with one, said
  const lines = said.expectations.filter((each) => !each.passed).map((each) => `${expectationLine(each)}; the run ${said.passed ? "PASSED" : "failed"}`); // prettier-ignore
  return lines.length || said.passed ? lines : ["the run failed, and every expectation held"];
};

await brokenAsync("play", "a line expected that the game never says", {
  said: /^FAIL  expect \/You kindle\/ \(step 2\): no such line was heard; the run failed$/,
  broken: () => run("never", [[400, "The wick is wet."]], [{ expect: "You kindle", within: 1000 }]),
  whole: () => run("kindled", [[400, "You kindle the lantern."]], [{ expect: "You kindle", within: 1000 }]),
});

await brokenAsync("play", "a script error said where none is to be", {
  said: /^FAIL  expect no \/Script Error\/ \(step 2\): Script Error in items\/lantern; the run failed$/,
  broken: () => run("error", [[400, "Script Error in items/lantern"]], [{ expectNot: "Script Error", within: 1000 }]),
  whole: () => run("quiet", [[400, "You kindle the lantern."]], [{ expectNot: "Script Error", within: 1000 }]),
});
