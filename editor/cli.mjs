#!/usr/bin/env node
// The editor from a terminal: everything the page does to a project, for an agent (editor/AGENTS.md).
//   node editor/cli.mjs new <model.mdl> <project.smakproj.json> [--engine xash|goldsrc]
//   node editor/cli.mjs <project> <command> ...
// Every change is one patch on the project file, made under the same lock and by the same code as the page's,
// and noted in the project's log as the agent's. A page that has the project open shows it within a second.
//
// How this file is laid out: the arguments are read in one place (parseArgs); each command is a function
// handed the session (the project, its file and its source model), the words after the command and the flags;
// and COMMANDS, after them, maps a command's name to its function and to its lines of the help.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import {
  newProject,
  readProject,
  patchProject,
  sourceOf,
  bakeProject,
  saveBake,
  textureFor,
  pictureFor,
  selectionOf,
  maskShown,
  smak,
} from "./project.mjs";
import * as core from "./core.mjs";

// the flags that take no value after them
const BARE_FLAGS = [
  "json",
  "compare",
  "source",
  "clear",
  "no-adjust",
  "no-file",
  "invert",
  "no-invert",
  "all-colours",
  "plain",
  "both",
];
// what `thin` keeps a bone within unless told: degrees of turn, units of place
const THIN_DEGREES = 0.5;
const THIN_UNITS = 0.02;
// how like the chosen colour a colour has to be when a selection is first made (see core.colourGap)
const DEFAULT_TOLERANCE = 20;
// the camera of `render` and `strip` unless told, in degrees
const DEFAULT_YAW = 30;
const DEFAULT_PITCH = 15;
// `strip` unless told: how many frames it draws, and how many of them in a row at most
const STRIP_FRAMES = 12;
const STRIP_COLUMNS_MOST = 6;
// where `strip --compare` writes "source" and "project" in the picture: from its left, and up from each
// half's bottom
const LABEL_LEFT = 6;
const LABEL_UP = 18;
// how many of the project's last changes `show` lists
const CHANGES_SHOWN = 10;
// the adjustments that are one number each
const ADJUSTMENTS = ["brightness", "contrast", "saturation", "hue"];
const VIEWS = ["first", "orbit"];
const ENGINES = ["xash", "goldsrc"];
// what --loops takes for yes and for no
const YES = /^(yes|true|1)$/i;
const NO = /^(no|false|0)$/i;

// ── the arguments ──────────────────────────────────────────────────────────
/**
 * The command line read: { flags, words }. `-o x` is flags.o; `--name value` is flags.name, or true for the
 * flags that take no value; a flag given twice has both values in a list; the rest are `words`, in order. A
 * flag that takes a value and has none after it is an error.
 */
function parseArgs(argv) {
  const flags = {};
  const words = [];
  const valueAfter = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value after it`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (word === "-o") flags.o = valueAfter(i++, "-o");
    else if (word.startsWith("--")) {
      const name = word.slice(2);
      const value = BARE_FLAGS.includes(name) ? true : valueAfter(i++, word);
      if (name in flags) flags[name] = [].concat(flags[name], value);
      else flags[name] = value;
    } else words.push(word);
  }
  return { flags, words };
}
/** "1,2,3" as `count` numbers, or an error that says so. */
function numbersOf(text, count) {
  const values = String(text).split(",").map(Number);
  if (values.length !== count || values.some(Number.isNaN))
    throw new Error(`${text}: ${count} numbers with commas between`);
  return values;
}
/** A flag's value as a number, `otherwise` when the flag is not given; one that is no number is an error. */
function numberFlag(flags, name, otherwise) {
  const value = flags[name];
  if (value === undefined) return otherwise;
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Number(value)))
    throw new Error(`--${name}: a number, not ${value}`);
  return Number(value);
}
/** A frame named on the command line: a whole number, or an error. */
function frameOf(word) {
  if (!/^\d+$/.test(String(word))) throw new Error(`a frame is a whole number, not ${word}`);
  return Number(word);
}
/** A flag that is one of a few words (`otherwise` when not given), or an error that names them. */
function wordFlag(flags, name, choices, otherwise) {
  const value = flags[name] ?? otherwise;
  if (value !== undefined && !choices.includes(value))
    throw new Error(`--${name}: ${choices.join(" or ")}, not ${value}`);
  return value;
}
/** The command stopped with how it is called, when it has fewer words than it needs. */
function needWords(words, count, usage) {
  if (words.length < count) throw new Error(usage);
}
/** A file a command reads, or an error: one that is not there, or that is a folder. */
function existing(file) {
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  if (statSync(file).isDirectory()) throw new Error(`${file} is a folder, not a file`);
  return file;
}
/** What went wrong, as a sentence: a file that could not be read or written is named. */
function sayOf(error) {
  if (error.code === "ENOENT") return `no such file: ${error.path}`;
  if (error.code === "EEXIST" || error.code === "ENOTDIR")
    return `${error.path} cannot be made: a file of that name is in the way`;
  if (error.code === "EISDIR") return `${error.path ?? "that"} is a folder, where a file is wanted`;
  return error.message;
}
/** A flag that may be given several times, as a list. */
const listOf = (flag) => [].concat(flag ?? []);
/** A key's six values as they are printed: the place rounded, the turn in degrees. */
const inDegrees = (values) => values.map((v, i) => (i < 3 ? +v.toFixed(3) : +(v / core.DEG).toFixed(2)));
const print = (what) => console.log(typeof what === "string" ? what : JSON.stringify(what, null, 1));
/** A bone named on the command line: its number when it is all digits, else its name. */
const boneOf = (word) => (/^\d+$/.test(word) ? Number(word) : word);
/** The number of a bone named on the command line, or an error that lists the bones there are. */
const boneNumber = (session, word) => core.boneAt(session.ctx, boneOf(word));
/** The file a picture or a model is written to, its folder made first. */
function writeTo(file, data) {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, data);
}

// ── the session: a project, its file, and the model it is about ────────────
/**
 * A change made to the project file, as the agent's, and said. The session's project is the changed one
 * after.
 */
function change(session, op) {
  if (!op.set.length) {
    print(`nothing to change (${op.what})`);
    return;
  }
  const result = patchProject(session.projPath, { ...op, by: "agent" });
  session.project = result.project;
  print(`revision ${session.project.rev}: ${op.what}`);
}
/** The number of a texture named by number or by name. */
function textureAt(session, which) {
  const textures = session.src.info.textures;
  const i = /^\d+$/.test(String(which))
    ? Number(which)
    : textures.findIndex((texture) => texture.name.toLowerCase() === String(which).toLowerCase());
  if (!textures[i]) throw new Error(`no texture ${which}`);
  return i;
}
/** The number of the animation a command is about: its first word, or --anim, or the first animation. */
const animOf = (session, words, flags) =>
  core.animAt(session.project, session.ctx, words[0] ?? flags.anim ?? 0);
/** A picture written as a PNG, and where said. */
function writePicture(picture, to) {
  if (!to) throw new Error("-o <picture.png>");
  writeTo(to, smak.png(picture.width, picture.height, picture.rgba));
  print(resolve(to));
}
const pngOf = (texture) => smak.png(texture.width, texture.height, smak.rgbaOf(texture));

// ── new ────────────────────────────────────────────────────────────────────
function begin(words, flags) {
  const [, model, projPath] = words;
  if (!model || !projPath) throw new Error("new <model.mdl> <project.json>");
  if (existsSync(projPath)) throw new Error(`${projPath} is there already`);
  const fresh = newProject(existing(model), projPath, wordFlag(flags, "engine", ENGINES, "xash"));
  mkdirSync(dirname(resolve(projPath)), { recursive: true });
  const result = patchProject(
    resolve(projPath),
    { set: [], what: `project begun on ${basename(model)}`, by: "agent" },
    fresh,
  );
  print(`${resolve(projPath)}: revision ${result.project.rev}, source ${result.project.source.path}`);
}

// ── show ───────────────────────────────────────────────────────────────────
const keyCount = (keys) => Object.keys(keys).length;
function showJson(session, anims) {
  const { project, projPath, src, ctx } = session;
  print({
    project: projPath,
    rev: project.rev,
    source: src.path,
    sourceChanged: project.source.sha1 !== src.sha1,
    engine: project.engine,
    output: project.output,
    bones: ctx.bones.map((bone, i) => ({ i, name: bone.name, parent: bone.parent })),
    animations: anims.map((anim) => ({
      ...anim,
      keyed: Object.fromEntries(
        Object.entries(project.anims[anim.n]?.keys ?? {}).map(([bone, keys]) => [bone, keyCount(keys)]),
      ),
      events: project.anims[anim.n]?.events ?? ctx.seqs[anim.n]?.events ?? [],
    })),
    textures: src.info.textures.map((texture, i) => ({
      i,
      name: texture.name,
      width: texture.width,
      height: texture.height,
      flags: texture.flags,
      ...(project.textures[i] ?? {}),
    })),
    log: project.log,
  });
}
/**
 * One animation's line in `show`: marked when the project changes or adds it, with its keyed bones and its
 * events.
 */
function animLine(anim, entry) {
  const mark = entry ? (anim.added ? "+" : "*") : " ";
  const keyed = Object.entries(entry?.keys ?? {}).filter(([, keys]) => keyCount(keys));
  // a bone with one or two keys is counted, one with more is named
  const few = keyed.filter(([, keys]) => keyCount(keys) <= 2);
  const many = keyed
    .filter(([, keys]) => keyCount(keys) > 2)
    .map(([bone, keys]) => `${bone} ${keyCount(keys)}`)
    .join(", ");
  const keysText = keyed.length
    ? `   keys: ${many}${few.length ? ` and ${few.length} bones with 1 or 2` : ""}`
    : "";
  const eventsText = entry?.events
    ? `   events: ${entry.events.map((event) => `${event.frame}:${event.event} ${event.options}`).join(", ") || "none"}`
    : "";
  const facts = `${String(anim.frames).padStart(4)} frames at ${+anim.fps.toFixed(2)} fps${anim.loops ? ", loops" : ""}${anim.outside ? "  (in another file: cannot be changed)" : ""}`;
  return `  ${mark} ${String(anim.n).padStart(3)} ${anim.name.padEnd(24)} ${facts}${keysText}${eventsText}`;
}
function show(session, words, flags) {
  const { project, projPath, src, ctx } = session;
  const anims = core.animList(project, ctx);
  if (flags.json) return showJson(session, anims);
  const changed = project.source.sha1 !== src.sha1 ? "  CHANGED since the project was begun" : "";
  print(
    `${projPath}\n  revision ${project.rev}, engine ${project.engine}, output ${project.output}\n  source ${src.path} (${src.bytes} bytes)${changed}`,
  );
  print(`\nANIMATIONS (${anims.length}; * the project changes it, + the project adds it)`);
  for (const anim of anims) print(animLine(anim, project.anims[anim.n]));
  const textures = Object.entries(project.textures).filter(
    ([, entry]) => entry.file || Object.keys(entry.adjust ?? {}).length,
  );
  print(`\nTEXTURES changed (${textures.length} of ${src.info.textures.length})`);
  for (const [i, entry] of textures)
    print(
      `  ${i} ${src.info.textures[i]?.name}${entry.file ? `  from ${entry.file}` : ""}${entry.adjust ? `  ${JSON.stringify(entry.adjust)}` : ""}`,
    );
  print(`\nLAST CHANGES`);
  for (const line of project.log.slice(-CHANGES_SHOWN))
    print(`  ${String(line.rev).padStart(4)} ${line.by.padEnd(7)} ${line.at}  ${line.what}`);
  print(
    `\n${ctx.bones.length} bones: "node smak/bin/smak.mjs info <model>" lists them, with the body numbers`,
  );
}

// ── keys and poses ─────────────────────────────────────────────────────────
function keys(session, words, flags) {
  const { project, ctx } = session;
  const number = animOf(session, words, flags);
  const anim = core.animOf(project, ctx, number);
  if (words[1] === undefined) {
    print(
      `${anim.name} (${number}): ${anim.count} frames; ${anim.smooth ? "a curve through the keys" : "straight between keys"}`,
    );
    for (const [bone, boneKeys] of Object.entries(anim.keys))
      print(
        `  ${bone.padEnd(26)} ${keyCount(boneKeys) === anim.count ? "every frame" : Object.keys(boneKeys).join(" ")}`,
      );
    if (!Object.keys(anim.keys).length)
      print("  no bone has keys of its own: every bone plays the source's frames");
    return;
  }
  const name = ctx.bones[boneNumber(session, words[1])].name;
  const boneKeys = anim.keys[name];
  if (!boneKeys)
    return print(
      `${words[1]} has no keys of its own in ${anim.name}: it plays the source's frames (a key on every frame)`,
    );
  const frames = Object.keys(boneKeys)
    .map(Number)
    .sort((x, y) => x - y);
  for (const frame of frames)
    print(`  ${String(frame).padStart(4)}  ${inDegrees(boneKeys[frame]).join("  ")}`);
}
function pose(session, words, flags) {
  const { project, ctx } = session;
  const number = animOf(session, words, flags);
  const frame = frameOf(words[1] ?? 0);
  core.checkFrame(core.animOf(project, ctx, number), frame);
  const line = (bone) =>
    `${String(bone).padStart(3)} ${ctx.bones[bone].name.padEnd(26)} ${inDegrees(core.valuesAt(project, ctx, number, bone, frame)).join("  ")}`;
  if (words[2] !== undefined) return print(line(boneNumber(session, words[2])));
  ctx.bones.forEach((_, bone) => print(line(bone)));
}
function key(session, words, flags) {
  const { project, ctx } = session;
  needWords(words, 3, "key <anim> <bone> <frame> [--rot dx,dy,dz] [--move dx,dy,dz] [--set x,y,z,rx,ry,rz]");
  const number = animOf(session, words, flags);
  const bone = boneOf(words[1]);
  const frame = frameOf(words[2]);
  const spread = numberFlag(flags, "spread", 0);
  if (flags.set) {
    // the six values outright: the place as it is, the turn from degrees
    const v = numbersOf(flags.set, 6);
    const values = [v[0], v[1], v[2], v[3] * core.DEG, v[4] * core.DEG, v[5] * core.DEG];
    return change(session, core.opKey(project, ctx, number, bone, frame, values, spread));
  }
  const nudge = {
    rot: flags.rot ? numbersOf(flags.rot, 3) : [0, 0, 0],
    move: flags.move ? numbersOf(flags.move, 3) : [0, 0, 0],
  };
  change(session, core.opNudge(project, ctx, number, bone, frame, nudge, spread));
}
function unkey(session, words, flags) {
  needWords(words, 3, "unkey <anim> <bone> <frame|all>");
  const frame = words[2] === "all" ? "all" : frameOf(words[2]);
  change(
    session,
    core.opDeleteKey(session.project, session.ctx, animOf(session, words, flags), boneOf(words[1]), frame),
  );
}
function movekey(session, words, flags) {
  needWords(words, 4, "movekey <anim> <bone> <from> <to>");
  const number = animOf(session, words, flags);
  change(
    session,
    core.opMoveKey(
      session.project,
      session.ctx,
      number,
      boneOf(words[1]),
      frameOf(words[2]),
      frameOf(words[3]),
    ),
  );
}
function thin(session, words, flags) {
  const { ctx } = session;
  const number = animOf(session, words, flags);
  const framesNow = () => core.bakeAnim(core.animOf(session.project, ctx, number), ctx);
  const was = framesNow();
  change(
    session,
    core.opThin(session.project, ctx, number, {
      rot: numberFlag(flags, "tol", THIN_DEGREES),
      pos: numberFlag(flags, "pos", THIN_UNITS),
      bones: flags.bone ? [].concat(flags.bone) : undefined,
    }),
  );
  const apart = core.poseError(ctx.bones, was, framesNow());
  print(
    `  at most ${apart.units.toFixed(3)} units and ${apart.degrees.toFixed(2)} degrees from what it was (frame ${apart.frame}, ${apart.bone || "no bone"})`,
  );
}
function set(session, words, flags) {
  if (flags.loops !== undefined && !YES.test(flags.loops) && !NO.test(flags.loops))
    throw new Error(`--loops: yes or no, not ${flags.loops}`);
  change(
    session,
    core.opSettings(session.project, session.ctx, animOf(session, words, flags), {
      frames: numberFlag(flags, "frames"),
      fps: numberFlag(flags, "fps"),
      loops: flags.loops === undefined ? undefined : YES.test(flags.loops),
      interp: wordFlag(flags, "interp", ["smooth", "linear"]),
    }),
  );
}
function dup(session, words, flags) {
  change(session, core.opDuplicate(session.project, session.ctx, animOf(session, words, flags), words[1]));
}
function diff(session, words, flags) {
  const { project, ctx } = session;
  const anim = core.animOf(project, ctx, animOf(session, words, flags));
  if (anim.count !== anim.base.length)
    return print(
      `${anim.name}: ${anim.count} frames where the source has ${anim.base.length}: no frame by frame comparison`,
    );
  const apart = core.poseError(ctx.bones, anim.base, core.bakeAnim(anim, ctx));
  print(
    `${anim.name}: at most ${apart.units.toFixed(3)} units and ${apart.degrees.toFixed(2)} degrees from the source's (frame ${apart.frame}, ${apart.bone || "no bone"})`,
  );
}

// ── events ─────────────────────────────────────────────────────────────────
/**
 * The animation's events with the flags' changes made, in this order: --clear, --del (the highest number
 * first, so that the others keep theirs), --move, --text, --add. Null when the flags change nothing.
 */
function eventsChanged(current, flags) {
  let list = current.map((event) => ({ ...event }));
  let touched = false;
  const at = (which) => {
    const i = /^\d+$/.test(String(which)) ? Number(which) : -1;
    if (!list[i]) throw new Error(`no event ${which}`);
    touched = true;
    return list[i];
  };
  if (flags.clear) {
    list = [];
    touched = true;
  }
  // looked up first, so that one that is not there is said by the word it was asked with
  for (const which of listOf(flags.del)) at(which);
  const doomed = listOf(flags.del)
    .map(Number)
    .sort((x, y) => y - x);
  for (const i of doomed) list.splice(i, 1);
  for (const move of listOf(flags.move)) {
    const [i, frame] = numbersOf(move, 2);
    at(i).frame = frame;
  }
  for (const text of listOf(flags.text)) {
    // "i,text": the text may have commas of its own
    const comma = text.indexOf(",");
    if (comma < 1) throw new Error(`--text ${text}: the event's number, a comma, its text`);
    at(text.slice(0, comma)).options = text.slice(comma + 1);
  }
  for (const added of listOf(flags.add)) {
    const [frame, event, ...text] = added.split(",");
    if (!/^\d+$/.test(frame) || !/^\d+$/.test(event ?? ""))
      throw new Error(`--add ${added}: a frame, the event's number and its text, with commas between`);
    list.push({ frame: Number(frame), event: Number(event), type: 0, options: text.join(",") });
    touched = true;
  }
  return touched ? list : null;
}
function events(session, words, flags) {
  const { ctx } = session;
  const number = animOf(session, words, flags);
  const now = () => core.animOf(session.project, ctx, number).events;
  // read before --source is looked at: an animation that cannot be read is said either way
  const before = now();
  if (flags.source)
    return change(session, {
      what: `events of ${ctx.seqs[number]?.name ?? number} as the source's`,
      set: [{ path: ["anims", number, "events"], value: null }],
    });
  const list = eventsChanged(before, flags);
  if (list) change(session, core.opEvents(session.project, ctx, number, list));
  now().forEach((event, i) =>
    print(`  ${i}: frame ${event.frame}, event ${event.event}, "${event.options}"`),
  );
}

// ── texture ────────────────────────────────────────────────────────────────
/**
 * --file and --no-file: the picture that replaces the texture copied beside the project, or the source's
 * again. The patch's entries are added to `entries` and what was done to `said`.
 */
function pictureFromFlags(session, number, flags, entries, said) {
  const texture = session.src.info.textures[number];
  if (flags.file) {
    // refused here, not at the bake, when it cannot be read
    smak.textureFrom(readFileSync(existing(flags.file)), texture.name);
    const dir = session.projPath.replace(/\.smakproj\.json$/, "") + ".tex";
    const name = `${number}_${basename(flags.file)}`;
    mkdirSync(dir, { recursive: true });
    copyFileSync(flags.file, join(dir, name));
    entries.push({ path: ["textures", number, "file"], value: `${basename(dir)}/${name}` });
    said.push(`replaced from ${basename(flags.file)}`);
  }
  if (flags["no-file"]) {
    entries.push({ path: ["textures", number, "file"], value: null });
    said.push("the source's picture");
  }
}
/**
 * The colour under a pixel of the texture's picture before its adjustments, as "r,g,b": what --select-at
 * chooses.
 */
function colourAt(session, number, flags, entries) {
  const [x, y] = numbersOf(flags["select-at"], 2);
  // the picture as this very command leaves it: the one it has just put there, or none, or the project's
  const fileSet = entries.find((entry) => entry.path[2] === "file")?.value;
  const file = flags["no-file"] ? undefined : (fileSet ?? session.project.textures[number]?.file);
  const picture = pictureFor(session.src, number, { file }, session.projPath);
  if (!(x >= 0 && y >= 0 && x < picture.width && y < picture.height))
    throw new Error(`no pixel ${x},${y} in a picture of ${picture.width}x${picture.height}`);
  const index = picture.pixels[Math.floor(y) * picture.width + Math.floor(x)];
  return [...picture.palette.subarray(index * 3, index * 3 + 3)].join();
}
/**
 * The texture's adjustments with the flags' changes made: { adjust, adjusted (whether a flag changed
 * anything) }. Which colours they apply to: those like one colour (named, or under a pixel of the picture
 * before its adjustments), or all.
 */
function adjustFromFlags(session, number, flags, entries) {
  const adjust = { ...(session.project.textures[number]?.adjust ?? {}) };
  let adjusted = false;
  for (const name of ADJUSTMENTS)
    if (flags[name] !== undefined) {
      adjust[name] = numberFlag(flags, name);
      if (!adjust[name]) delete adjust[name];
      adjusted = true;
    }
  if (flags.tint) {
    const [r, g, b, amount] = numbersOf(flags.tint, 4);
    adjust.tint = [r, g, b];
    adjust.tintAmount = amount;
    adjusted = true;
  }
  if (flags.select && flags["select-at"]) throw new Error("--select r,g,b or --select-at x,y: one of them");
  const select = flags["select-at"] ? colourAt(session, number, flags, entries) : flags.select;
  if (select) {
    adjust.select = {
      colour: numbersOf(select, 3),
      tolerance: adjust.select?.tolerance ?? DEFAULT_TOLERANCE,
      ...(adjust.select?.invert ? { invert: true } : {}),
    };
    adjusted = true;
  }
  if (flags.tolerance !== undefined || flags.invert || flags["no-invert"]) {
    if (!adjust.select)
      throw new Error(
        "--tolerance and --invert are of a selection: choose a colour with --select r,g,b or --select-at x,y",
      );
    const tolerance = numberFlag(flags, "tolerance", adjust.select.tolerance);
    const invert = (flags.invert || adjust.select.invert) && !flags["no-invert"];
    adjust.select = { colour: adjust.select.colour, tolerance, ...(invert ? { invert: true } : {}) };
    adjusted = true;
  }
  if (flags["all-colours"]) {
    delete adjust.select;
    adjusted = true;
  }
  return { adjust, adjusted };
}
/** What is said of the texture as the project now has it, and --mask and --export written. */
function reportTexture(session, number, flags) {
  const { src, projPath } = session;
  const now = session.project.textures[number];
  const select = now?.adjust?.select;
  if (select) {
    const taken = selectionOf(src, number, now, projPath);
    const which = select.invert ? "every colour but those" : "the colours";
    const share = ((100 * taken.pixels) / taken.of).toFixed(1);
    print(
      `  the adjustments apply to ${which} within ${select.tolerance} of ${select.colour.join(",")}: ${taken.taken} of the ${taken.used} colours the picture uses, ${share}% of its pixels`,
    );
  }
  if (now?.file && Object.keys(now.adjust ?? {}).some((name) => name !== "select"))
    print(
      `  note: the picture that replaced it has adjustments on top (${JSON.stringify(now.adjust)}); --export gives it adjusted, --export with --plain as it was dropped, --no-adjust takes them off`,
    );
  if (flags.mask) {
    const masked = maskShown(
      textureFor(src, number, now, projPath),
      selectionOf(src, number, now, projPath).on,
    );
    writeTo(flags.mask, pngOf(masked));
    print(resolve(flags.mask));
  }
  if (flags.export) {
    const plain = { ...now, adjust: undefined };
    const texture = textureFor(src, number, flags.plain ? plain : now, projPath);
    writeTo(flags.export, /\.bmp$/i.test(flags.export) ? smak.bmp(texture) : pngOf(texture));
    print(resolve(flags.export));
  }
}
function texture(session, words, flags) {
  needWords(words, 1, "texture <texture name|n> [--file picture.png|bmp] [--brightness n] ...");
  const number = textureAt(session, words[0]);
  const source = session.src.info.textures[number];
  // the patch: the texture's name is written down with whatever is changed of it
  const entries = [{ path: ["textures", number, "name"], value: source.name }];
  const said = [];
  pictureFromFlags(session, number, flags, entries, said);
  const { adjust, adjusted } = adjustFromFlags(session, number, flags, entries);
  if (flags["no-adjust"]) {
    entries.push({ path: ["textures", number, "adjust"], value: null });
    said.push("no adjustments");
  } else if (adjusted) {
    entries.push({
      path: ["textures", number, "adjust"],
      value: Object.keys(adjust).length ? adjust : null,
    });
    said.push(`adjusted ${JSON.stringify(adjust)}`);
  }
  if (said.length) change(session, { what: `texture ${source.name}: ${said.join(", ")}`, set: entries });
  reportTexture(session, number, flags);
  // asked nothing: the texture as it stands
  if (!said.length && !flags.export && !flags.mask)
    print(
      `${number} ${source.name} ${source.width}x${source.height} flags ${source.flags}  ${JSON.stringify(session.project.textures[number] ?? {})}`,
    );
}

// ── the baked model: written, and drawn ────────────────────────────────────
function bake(session, words, flags) {
  const engine = wordFlag(flags, "engine", ENGINES);
  const report = saveBake(session.project, session.projPath, { out: flags.o, engine });
  print(`${report.out}: ${report.bytes} bytes, checked for ${report.engine}`);
  for (const error of report.errors) print(`  ERROR    ${error}`);
  for (const warning of report.warnings) print(`  warning  ${warning}`);
  for (const note of report.notes) print(`  note     ${note}`);
  for (const fact of report.facts) print(`  ${fact}`);
  print(
    `  ${report.anims.length} animations written from the project: ${report.anims.map((anim) => `${anim.n} ${anim.name}`).join(", ") || "none"}`,
  );
  if (report.errors.length) process.exitCode = 1;
}
function render(session, words, flags) {
  const { project, projPath, src, ctx } = session;
  // the arguments first: the project is not baked to find that the picture has nowhere to go
  if (!flags.o) throw new Error("-o <picture.png>");
  const options = {
    view: wordFlag(flags, "view", VIEWS, src.viewModel ? "first" : "orbit"),
    frame: numberFlag(flags, "frame", 0),
    body: numberFlag(flags, "body", 0),
    yaw: numberFlag(flags, "yaw", DEFAULT_YAW),
    pitch: numberFlag(flags, "pitch", DEFAULT_PITCH),
    width: numberFlag(flags, "width") || undefined,
    height: numberFlag(flags, "height") || undefined,
    cull: !flags.both,
  };
  const number = core.animAt(project, ctx, flags.anim ?? 0);
  const mdl = flags.source ? src.buf : bakeProject(project, projPath).mdl;
  // an animation the project added is not in the source: its last is drawn then
  const seq = flags.source ? Math.min(number, ctx.seqs.length - 1) : number;
  writePicture(smak.render(mdl, { ...options, seq }), flags.o);
}
/** Two pictures of one width, the source's above the project's, each with its name written on it. */
function stacked(was, now) {
  const both = {
    width: now.width,
    height: was.height + now.height,
    rgba: new Uint8Array(now.width * (was.height + now.height) * 4),
  };
  both.rgba.set(was.rgba, 0);
  both.rgba.set(now.rgba, was.rgba.length);
  smak.label(both, "source", LABEL_LEFT, was.height - LABEL_UP);
  smak.label(both, "project", LABEL_LEFT, was.height + now.height - LABEL_UP);
  return both;
}
function strip(session, words, flags) {
  const { project, projPath, src, ctx } = session;
  // the arguments first, as in `render`
  if (!flags.o) throw new Error("-o <picture.png>");
  const number = core.animAt(project, ctx, flags.anim ?? 0);
  const count = numberFlag(flags, "count", STRIP_FRAMES);
  const cols = numberFlag(flags, "cols", Math.min(STRIP_COLUMNS_MOST, count));
  for (const [name, value] of Object.entries({ count, cols }))
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`--${name}: a whole number from 1, not ${value}`);
  const options = {
    seq: number,
    view: wordFlag(flags, "view", VIEWS, src.viewModel ? "first" : "orbit"),
    body: numberFlag(flags, "body", 0),
    count,
    cols,
    from: numberFlag(flags, "from"),
    to: numberFlag(flags, "to"),
    yaw: numberFlag(flags, "yaw", DEFAULT_YAW),
    pitch: numberFlag(flags, "pitch", DEFAULT_PITCH),
  };
  const mdl = bakeProject(project, projPath).mdl;
  const now = smak.strip(mdl, options);
  // nothing to compare with: an animation the project added, or a strip of another width
  if (!flags.compare || number >= ctx.seqs.length) return writePicture(now, flags.o);
  const was = smak.strip(src.buf, options);
  if (was.width !== now.width) return writePicture(now, flags.o);
  writePicture(stacked(was, now), flags.o);
}
function undoLast() {
  print(
    "Undo is not offered here: the page undoes the person's own edits, and an agent undoes its own by making the opposite change (unkey, set, events --source, texture --no-adjust). See editor/AGENTS.md.",
  );
}

// ── the commands ───────────────────────────────────────────────────────────
// A command's name, its function, and its lines of the help (none: it is not listed).
const COMMANDS = {
  show: {
    run: show,
    help: `  show [--json]                                   the model's animations, bones and textures, and what the project changes`,
  },
  keys: {
    run: keys,
    help: `  keys <anim> [bone]                              which bones have keys, or one bone's keys (degrees)`,
  },
  pose: {
    run: pose,
    help: `  pose <anim> <frame> [bone]                      the values at a frame as the project has them (x y z, then degrees)`,
  },
  key: {
    run: key,
    help: `  key <anim> <bone> <frame> [--rot dx,dy,dz] [--move dx,dy,dz] [--set x,y,z,rx,ry,rz] [--spread n]
                                                  a key: a turn about the bone's own axes (degrees) and a move (units, in its
                                                  parent's space) from where it is, or the six values outright (degrees)`,
  },
  unkey: {
    run: unkey,
    help: `  unkey <anim> <bone> <frame|all>                 a key removed; all: the bone plays the source's frames again`,
  },
  movekey: {
    run: movekey,
    help: `  movekey <anim> <bone> <from> <to>               a key taken to another frame`,
  },
  thin: {
    run: thin,
    help: `  thin <anim> [--tol 0.5] [--pos 0.02] [--bone name]...   keys thinned within so many degrees and units`,
  },
  set: {
    run: set,
    help: `  set <anim> [--frames n] [--fps f] [--loops yes|no] [--interp smooth|linear]   length (stretched), rate, looping`,
  },
  dup: {
    run: dup,
    help: `  dup <anim> <new name>                           the animation again, after the last one`,
  },
  events: {
    run: events,
    help: `  events <anim> [--add frame,event,text] [--del i] [--move i,frame] [--text i,text] [--clear] [--source]`,
  },
  texture: {
    run: texture,
    help: `  texture <texture> [--file picture.png|bmp] [--brightness n] [--contrast n] [--saturation n] [--hue deg]
                    [--tint r,g,b,amount] [--no-adjust] [--no-file] [--export out.png|bmp [--plain]]
                    [--select r,g,b | --select-at x,y] [--tolerance n] [--invert | --no-invert] [--all-colours] [--mask out.png]
                                                  --select: the adjustments apply only to the colours like that one (--select-at: the one
                                                  under that pixel of the picture before its adjustments), within --tolerance (20 unless
                                                  told; 0: that colour alone); --invert: to every colour but those; --all-colours: to all
                                                  again; --mask: the picture with what is left alone dimmed. --plain: exported without
                                                  the adjustments (the picture to paint on and put back while they stand)`,
  },
  diff: {
    run: diff,
    help: `  diff <anim>                                     how far the animation is from the source's`,
  },
  bake: {
    run: bake,
    help: `  bake [-o out.mdl] [--engine xash|goldsrc]       bake onto the source, write, check; exit code 1 on an error`,
  },
  render: {
    run: render,
    help: `  render -o p.png --anim a --frame f [--view first|orbit] [--body n] [--yaw d] [--pitch d] [--width w] [--height h] [--source] [--both]
                                                  --both: both sides of every triangle (a face that is inside out shows)`,
  },
  strip: {
    run: strip,
    help: `  strip -o p.png --anim a [--count 12] [--cols 4] [--from f] [--to f] [--view first] [--body n] [--compare]
                                                  frames of an animation in one picture; --compare: the source above`,
  },
  "undo-last": { run: undoLast, help: null },
};
const HELP = `node editor/cli.mjs new <model.mdl> <project.json> [--engine xash|goldsrc]     begin a project (the model is only read)
node editor/cli.mjs <project.json> <command>:
${Object.values(COMMANDS)
  .map((entry) => entry.help)
  .filter(Boolean)
  .join("\n")}
<anim> and <texture> are numbers or names; <bone> is a name ("Bip01 R Hand") or a number.`;

// ── the start ──────────────────────────────────────────────────────────────
/** The project in a file (null: there is no such file); a file that is no project is an error that says so. */
function projectAt(projPath, asGiven) {
  if (existsSync(projPath) && statSync(projPath).isDirectory())
    throw new Error(`${asGiven} is a folder, not a project file`);
  try {
    return readProject(projPath);
  } catch (error) {
    // what the parser says of a file that is not JSON quotes the file: left out
    const why = error instanceof SyntaxError ? "it is not JSON" : sayOf(error);
    throw new Error(`${asGiven} is not a project file: ${why}`);
  }
}
/**
 * `new`, or a command on a project: its file is the first word, the command the second (`show` when there is
 * none).
 */
function main(argv) {
  const { flags, words } = parseArgs(argv);
  if (!words.length || words[0] === "help") return print(HELP);
  if (words[0] === "new") return begin(words, flags);
  const projPath = resolve(words[0]);
  const command = words[1] ?? "show";
  const project = projectAt(projPath, words[0]);
  if (!project) throw new Error(`no project at ${projPath}: begin one with "new <model.mdl> ${words[0]}"`);
  const src = sourceOf(project, projPath);
  const session = { projPath, project, src, ctx: src.ctx };
  if (!Object.hasOwn(COMMANDS, command)) throw new Error(`no command ${command}\n\n${HELP}`);
  COMMANDS[command].run(session, words.slice(2), flags);
}
try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`editor: ${sayOf(error)}`);
  process.exit(1);
}
