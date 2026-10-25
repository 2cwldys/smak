// The Steam game's driver (src/play-native.mjs): the console loop it starts the game with, a command run once
// however often the loop reads its file, a map waited for until the player is in, the game's own screenshot
// made a PNG, the log read from where the run began, and its refusals.
//
// No game: the game here is a fake engine in this process that reads the driver's files as GoldSrc's command
// buffer does (alias, exec, wait, echo, a map, status, screenshot, quit) and writes qconsole.log. That the
// real game answers so was measured by hand (2026-10-24, Steam's Half-Life with The Specialists).
import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { unpng } from "../src/image.mjs";
import { testAsync, test, sure, tmp } from "./helper.mjs";

const { play, nativeDriver, pngOfTga, playOf } = smak.play;
const { commandCfg, startCfg } = await import("../src/play-native.mjs");

/** A Half-Life folder with an empty hl.exe, a mod's folder and a console file that has a run of before in it. */
const halfLifeOf = (name) => {
  const game = join(tmp, "native", name);
  mkdirSync(join(game, "ts"), { recursive: true });
  writeFileSync(join(game, "hl.exe"), "");
  writeFileSync(join(game, "qconsole.log"), "a line of an earlier run\nsmak_probe\n");
  writeFileSync(join(game, "ts", "config.cfg"), 'bind "ESCAPE" "cancelselect"\n');
  return game;
};

/** A TGA of 2 by 2, 24 bits, rows from the bottom: red, green above blue, white. */
const TGA = (() => {
  const head = Buffer.alloc(18);
  head[2] = 2;
  head.writeUInt16LE(2, 12);
  head.writeUInt16LE(2, 14);
  head[16] = 24;
  // BGR, the bottom row first: blue, white; then the top: red, green
  return Buffer.concat([head, Buffer.from([255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0])]);
})();

/** The commands of a line, split at the semicolons outside quotes. */
const commandsOf = (line) => {
  const out = [];
  let word = "";
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    if (c === ";" && !quoted) (out.push(word.trim()), (word = ""));
    else word += c;
  }
  out.push(word.trim());
  return out.filter(Boolean);
};

/**
 * A fake engine started as `spawn` starts a program: a command buffer run every 10 ms up to its first `wait`.
 * `deaf`: it never runs its start file; `lonely`: no player ever comes into a map.
 */
const fakeGame = ({ deaf = false, lonely = false } = {}) => {
  const seen = { args: null, ran: [] };
  const spawn = (program, args, { cwd }) => {
    seen.args = args;
    const child = new EventEmitter();
    const mod = join(cwd, args[args.indexOf("-game") + 1]);
    const say = (text) => appendFileSync(join(cwd, "qconsole.log"), `${text} \n`);
    const aliases = new Map();
    const buffer = deaf ? [] : ["exec smak_run.cfg"];
    let map = null;
    let inFor = 0;
    let shots = 0;
    const binds = [];
    const timer = setInterval(() => {
      if (map && inFor > 0) inFor--;
      for (let count = 0; buffer.length && count < 500; count++) {
        const command = buffer.shift();
        if (command === "wait") break;
        const [name, ...rest] = command.split(/\s+/);
        const text = rest.join(" ");
        if (name === "alias") {
          const at = text.indexOf(" ");
          aliases.set(text.slice(0, at), text.slice(at + 1).replace(/^"|"$/g, ""));
        } else if (aliases.has(name)) buffer.unshift(...commandsOf(aliases.get(name)));
        else if (name === "exec") {
          const file = join(mod, text);
          if (existsSync(file)) buffer.unshift(...readFileSync(file, "latin1").split(/\r?\n/).flatMap(commandsOf));
        } else if (name === "echo") say(text);
        else if (name === "map") [map, inFor] = [text, lonely ? Infinity : 3];
        else if (name === "status") {
          say(`map     :  ${map} at: 0 x, 0 y, 0 z`);
          if (map && !inFor) say('# 1 "Player" 1 STEAM_ID_LAN   0 00:03    0    0');
          say("1 users");
        } else if (name === "screenshot") {
          const file = `HalfLife${String(shots++).padStart(2, "0")}.tga`;
          writeFileSync(join(mod, file), TGA);
          say(`Wrote ${file}`);
        } else if (name === "bind") binds.push(command);
        else if (name === "quit") {
          // as the game does, the person's binds written as it quits
          writeFileSync(join(mod, "config.cfg"), `${binds.join("\n")}\n`);
          clearInterval(timer);
          setTimeout(() => child.emit("exit", 0), 5);
          return;
        } else if (/^[+-]\w|^disconnect$/.test(command)) seen.ran.push(command);
        else say(`Unknown command: ${name}`);
        if (!/^(alias|exec|smak_)/.test(name)) seen.ran.push(command);
      }
    }, 10);
    child.kill = () => {
      clearInterval(timer);
      child.emit("exit", "killed");
    };
    return child;
  };
  return { spawn, seen };
};

const refusalOf = async (run) => {
  try {
    await run();
  } catch (e) {
    return e.message;
  }
  return "";
};

test("the files a native run gives the game: a loop that reads smak_in.cfg, and a command that runs once", () => {
  const start = startCfg(2);
  sure(start.includes('alias smak_poll "exec smak_in.cfg; wait; wait; smak_poll"'), `the loop: ${start}`);
  sure(start.includes('alias smak_g1 "exec smak_1.cfg"') && start.includes("echo SMAK_UP"), start);
  const one = commandCfg(4, "status").split("\n");
  sure(one[0] === "status" && one[1] === 'alias smak_g4 ""' && one[2] === 'alias smak_g5 "exec smak_5.cfg"' && one[3] === "echo SMAK_ACK 4", one.join(" | ")); // prettier-ignore
});

test("pngOfTga: a screenshot of 24 bits from the bottom, and the same run-length coded, read the right way up", () => {
  const raw = unpng(pngOfTga(TGA));
  sure(raw.width === 2 && raw.height === 2, `${raw.width} by ${raw.height}`);
  const at = (x, y) => [...raw.rgba.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 3)].join(",");
  sure(at(0, 0) === "255,0,0" && at(1, 0) === "0,255,0" && at(0, 1) === "0,0,255" && at(1, 1) === "255,255,255", `${at(0, 0)} ${at(1, 0)} ${at(0, 1)} ${at(1, 1)}`); // prettier-ignore
  // the same pixels as packets: two of one pixel each, raw
  const coded = Buffer.from(TGA);
  coded[2] = 10;
  const rle = Buffer.concat([coded.subarray(0, 18), Buffer.from([0x01]), TGA.subarray(18, 24), Buffer.from([0x01]), TGA.subarray(24)]); // prettier-ignore
  sure(Buffer.compare(pngOfTga(rle), pngOfTga(TGA)) === 0, "the run-length picture differs");
  const grey = Buffer.from(TGA);
  grey[2] = 3;
  sure(/type 3/.test(String((() => { try { pngOfTga(grey); } catch (e) { return e.message; } })())), "a grey TGA was read"); // prettier-ignore
});

await testAsync(
  "a run in the Steam game by its console: the map waited for until the player is in, a picture, a command once, the log from the run's start, the person's settings put back",
  "a native run",
  async () => {
    const game = halfLifeOf("run");
    const { spawn, seen } = fakeGame();
    const driver = nativeDriver({ halfLife: game, mod: "ts", spawn, width: 800, height: 600 });
    const out = join(tmp, "native", "run-out");
    const run = await play({
      ...{ driver, map: "ts_lobbyduel", out, pause: 0 },
      steps: [{ shot: "start" }, { command: "echo smak_probe", until: "smak_probe" }, { walk: 50 }, { command: 'bind "MOUSE1" "+attack"' }, { expect: "smak_probe" }], // prettier-ignore
      expectNot: ["a line of an earlier run"],
    });
    sure(run.passed, `the run failed: ${run.expectations.map((each) => each.line).join("; ")}`);
    const args = seen.args.join(" ");
    sure(args === "-game ts -insecure -windowed -w 800 -h 600 -condebug +exec smak_run.cfg", args);
    // every command once, in order, however often the loop read its file
    const ran = seen.ran.filter((each) => !/^echo SMAK|^status$/.test(each) && !/^echo SMAK_ASK/.test(each));
    sure(ran.filter((each) => each === "echo smak_probe").length === 1, `echo ran ${ran.filter((each) => each === "echo smak_probe").length} times`); // prettier-ignore
    sure(ran.join(" | ").includes("map ts_lobbyduel") && ran.includes("+forward") && ran.includes("-forward"), ran.join(" | ")); // prettier-ignore
    sure(run.pictures.length >= 2 && run.pictures.every((file) => unpng(readFileSync(file)).width === 2), run.pictures.join(", ")); // prettier-ignore
    // the driver's own lines are the run's (`play`), never the game's, so never matched
    const said = readFileSync(run.logFile, "utf8");
    sure(!/console\s+(SMAK_(ACK|UP|ASK)|1 users)/.test(said) && /console\s+SMAK entered ts_lobbyduel/.test(said), said); // prettier-ignore
    sure(!readdirSync(join(game, "ts")).some((name) => /^smak_|\.tga$/.test(name)), `left in the mod's folder: ${readdirSync(join(game, "ts"))}`); // prettier-ignore
    // the bind a step made was the game's to save, and the person's settings are as they were
    const settings = readFileSync(join(game, "ts", "config.cfg"), "utf8");
    sure(settings === 'bind "ESCAPE" "cancelselect"\n', `config.cfg is now ${JSON.stringify(settings)}`);
  },
);

await testAsync("the native driver's refusals: a server joined, a key, a game that never comes up, a map the player never enters", "native refusals", async () => {
  // none on the machine, as SMAK_HALF_LIFE=none says
  const was = process.env.SMAK_HALF_LIFE;
  process.env.SMAK_HALF_LIFE = "none";
  const none = await refusalOf(() => nativeDriver({ mod: "ts" }));
  if (was === undefined) delete process.env.SMAK_HALF_LIFE;
  else process.env.SMAK_HALF_LIFE = was;
  sure(/no Half-Life with ts in it was found/.test(none), `a game not found: ${none}`);
  const game = halfLifeOf("refused");
  const live = nativeDriver({ halfLife: game, mod: "ts", spawn: fakeGame().spawn });
  sure(/ready\(\) comes first/.test(await refusalOf(() => live.command("echo x"))), "a command before ready");
  await live.ready();
  sure(/would join a server/.test(await refusalOf(() => live.command("connect 10.0.0.1:27015"))), "connect was sent");
  sure(/by its console alone, and a key/.test(await refusalOf(() => live.keyDown("w"))), "a key was pressed");
  sure(/one line of the console/.test(await refusalOf(() => live.command("echo a\nquit"))), "two lines in one command");
  await live.close();
  const deaf = nativeDriver({ halfLife: game, mod: "ts", spawn: fakeGame({ deaf: true }).spawn, readyWithin: 300 });
  sure(/did not come up in 0.3 seconds: it never ran smak_run.cfg/.test(await refusalOf(() => deaf.ready())), "a game that never came up");
  await deaf.close();
  const lonely = nativeDriver({ halfLife: game, mod: "ts", spawn: fakeGame({ lonely: true }).spawn, enterWithin: 1500 });
  await lonely.ready();
  sure(/the player was not in ts_nowhere 1.5 seconds after/.test(await refusalOf(() => lonely.command("map ts_nowhere"))), "a map never entered"); // prettier-ignore
  await lonely.close();
  sure(!readdirSync(join(game, "ts")).some((name) => /^smak_/.test(name)), "the driver's files were left");
  sure(playOf([{ walk: 100 }]).length === 1, "a walk is a step");
});
