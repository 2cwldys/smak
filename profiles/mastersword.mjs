// ONE MOD'S PROFILE, AND AN EXAMPLE OF ONE: Master Sword Classic (the game folder `msc`).
//
// This file is no part of the kit's core, and nothing in `src/` knows of it. It is here to be copied: a
// profile for another GoldSrc mod is written the same way, from that mod's FGD, its own maps and what its
// code is known to do (docs/MAPS-MAKING.md, "A mod's profile"). It holds no game content: the definitions
// are read from the installed game when the profile is made (the game's FGDs, its hundred maps, its script
// pack), so it needs the game.
//
//   import masterSword from "./smak/profiles/mastersword.mjs";
//   const mod = masterSword({ game: "C:/games/Half-Life" });               // or { folders: [msc, valve] }
//   maps.checkPlan(map, { mod });   maps.checkBsp(bytes, { mod });   maps.reachOf(map, { mod });
//
//   smak map-check orchard.bsp --mod smak/profiles/mastersword.mjs --game <Half-Life>/msc --game <Half-Life>/valve
//
// WHERE EACH FACT IS FROM. "The source" is the game's own C++ (MasterSwordRebirth, src/game); "the maps" are
// the 100 maps the game ships in msc/maps, counted with `learnEntities`; the FGD is msc/dev/ms1.4.fgd.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GOLDSRC, definitionsOf, entitiesOfFile, isNamed } from "../src/maps/index.mjs";

/** The mod's folder in a Half-Life folder, its script pack and its FGDs, as the game ships them. */
const MOD_FOLDER = "msc";
const SCRIPT_PACK = "dlls/sc.dll";
const FGDS = ["dev/halflife.fgd", "dev/ms1.4.fgd"];
/** The game's own program, as the `gamedll` line of msc/liblist.gam names it. */
const PROGRAM = "dlls/ms.dll";
/** How a script's file is named in the pack and in a folder of loose scripts. */
const SCRIPT_END = ".script";
/** The folder of the pack whose scripts are items: an item's name is its script's, without the folder. */
const ITEMS = "items/";

// ── the script pack ─────────────────────────────────────────────────────────
// dlls/sc.dll is a data file despite its name: every script of the game, enciphered. The format and the
// cipher are in the source, src/game/shared/ms/groupfile.cpp and encrypt.cpp: the last four bytes are a
// checksum; before them, each byte i was swapped with the byte (i + 7) % n after (i * 4) % 128 was added to
// it. Unciphered it is a count, then for each script 256 bytes of name, an offset and a size.
const PACK = { name: 256, entry: 256 + 8, checksum: 4 };

/** A script's name as the game compares it: lower case, `/` between folders, no leading `/`, no `.script`. */
const scriptName = (name) =>
  name
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/\.script$/, "");

/** The names of the scripts in a pack's bytes, as `scriptName` writes them. */
export function packScriptNames(bytes) {
  const length = bytes.length - PACK.checksum;
  const plain = Buffer.from(bytes.subarray(0, length));
  for (let i = length - 1; i >= 0; i--) {
    const j = (i + 7) % length;
    const kept = plain[i];
    plain[i] = plain[j];
    plain[j] = kept;
  }
  // only the table of names is needed: the count, then each entry's name
  const byteAt = (at) => (plain[at] - ((at * 4) % 128)) & 0xff;
  const count = byteAt(0) | (byteAt(1) << 8) | (byteAt(2) << 16) | (byteAt(3) << 24);
  if (!(count > 0 && 4 + count * PACK.entry <= length))
    throw new Error("the script pack is not one this profile reads (its table of names runs past its end)");
  const names = [];
  for (let entry = 0; entry < count; entry++) {
    const at = 4 + entry * PACK.entry;
    let name = "";
    for (let i = 0; i < PACK.name; i++) {
      const letter = byteAt(at + i);
      if (!letter) break;
      name += String.fromCharCode(letter);
    }
    names.push(scriptName(name));
  }
  return names;
}

/** Every script of a pack's bytes: a Map from its name (`scriptName`) to its text. */
export function packScripts(bytes) {
  const length = bytes.length - PACK.checksum;
  const plain = Buffer.from(bytes.subarray(0, length));
  for (let i = length - 1; i >= 0; i--) {
    const j = (i + 7) % length;
    const kept = plain[i];
    plain[i] = plain[j];
    plain[j] = kept;
  }
  for (let at = 0; at < length; at++) plain[at] = (plain[at] - ((at * 4) % 128)) & 0xff;
  const count = plain.readInt32LE(0);
  if (!(count > 0 && 4 + count * PACK.entry <= length))
    throw new Error("the script pack is not one this profile reads (its table of names runs past its end)");
  const texts = new Map();
  for (let entry = 0; entry < count; entry++) {
    const at = 4 + entry * PACK.entry;
    const end = plain.indexOf(0, at);
    const name = plain.toString("latin1", at, Math.min(end < 0 ? at + PACK.name : end, at + PACK.name));
    const from = plain.readUInt32LE(at + PACK.name);
    const size = plain.readUInt32LE(at + PACK.name + 4);
    if (from + size <= length) texts.set(scriptName(name), plain.toString("latin1", from, from + size));
  }
  return texts;
}

/** The loose scripts of a folder (and of its folders): a Map from each one's name to its file. */
function looseScriptFiles(folder, under = "", files = new Map()) {
  for (const name of existsSync(folder) ? readdirSync(folder) : []) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) looseScriptFiles(path, `${under}${name}/`, files);
    else if (name.toLowerCase().endsWith(SCRIPT_END)) files.set(scriptName(`${under}${name}`), path);
  }
  return files;
}

// ── the model a script gives its entity ─────────────────────────────────────
// A monster, an NPC or a chest names no model in the map: its script does, with `setmodel`, by a path under
// models/ ("setmodel monsters/skeleton.mdl"; the source, shared/script/scriptcmds.cpp, puts "models/" before
// it). Of the 900 `setmodel` lines of the game's scripts some 650 name the file there and the rest a word
// the script, or a script it includes, gives a value with `const` or `setvard` (MONSTER_MODEL, NPC_MODEL);
// a script with no `setmodel` of its own has it from a script it takes in with `#include`
// (monsters/skeleton_base). "none" is no model. What is NOT read: `setmodelbody` (which of the model's
// parts are shown) and a model chosen while the game runs, by a parameter or at random.
const MODELS = "models/";
/** How deep `#include` is followed: the game's own scripts go four deep. */
const INCLUDES_DEEP = 6;

/** The words of a script's lines that begin with a command, comments left out. */
function linesOf(text, command) {
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    const words = line
      .replace(/\/\/.*$/, "")
      .trim()
      .split(/\s+/);
    if (words[0]?.toLowerCase() === command && words.length > 1) lines.push(words.slice(1));
  }
  return lines;
}

/**
 * The model a script gives its entity, as a path from the game's folder ("models/monsters/skeleton.mdl"),
 * or null where it names none that can be read. `textOf(name)` is a script's text, or undefined.
 */
export function scriptModel(script, textOf) {
  const taken = [];
  const take = (name, deep) => {
    const text = textOf(scriptName(name));
    if (text === undefined || deep > INCLUDES_DEEP || taken.some((each) => each.name === scriptName(name)))
      return;
    taken.push({ name: scriptName(name), text });
    // "#include [server] monsters/wolf_base": the script is the line's last word
    for (const words of linesOf(text, "#include")) take(words[words.length - 1], deep + 1);
  };
  take(script, 0);
  const valueOfWord = (word) => {
    for (const { text } of taken)
      for (const command of ["const", "setvard", "setvar"])
        for (const [name, value] of linesOf(text, command))
          if (name === word && value !== undefined) return value.replace(/^"|"$/g, "");
    return null;
  };
  for (const { text } of taken)
    for (const [word] of linesOf(text, "setmodel")) {
      const said = word.replace(/^"|"$/g, "");
      const file = /\.mdl$/i.test(said) ? said : valueOfWord(said);
      if (file && /\.mdl$/i.test(file)) return `${MODELS}${file.replace(/\\/g, "/").replace(/^\/+/, "")}`;
      if (said.toLowerCase() === "none") return null;
    }
  return null;
}

/** The scripts of a folder of loose scripts (and of its folders), named as the pack names them. */
function looseScriptNames(folder, under = "") {
  const names = [];
  for (const name of existsSync(folder) ? readdirSync(folder) : []) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) names.push(...looseScriptNames(path, `${under}${name}/`));
    else if (name.toLowerCase().endsWith(SCRIPT_END)) names.push(scriptName(`${under}${name}`));
  }
  return names;
}

// ── the profile ─────────────────────────────────────────────────────────────
/** The classes a monster's template is written as: every `msmonster_*`, the NPCs and the chests. */
const TEMPLATES = ["msmonster_*", "ms_npc", "msnpc_*", "msworlditem_treasure"];
const AREAS = ["ms_monsterspawn", "msarea_monsterspawn"];

/**
 * Master Sword Classic's profile, made from the installed game.
 *
 *   game      the Half-Life folder (the one that holds `msc` and `valve`); or
 *   folders   the game's folders themselves, the mod's first: `[<Half-Life>/msc, <Half-Life>/valve]`
 *   scripts   folders of loose scripts that are not in the game's pack yet (a new map's own), each laid out
 *             as the pack is: `<folder>/orchard/keeper.script` is the script `orchard/keeper`
 *   cache     a file to keep what the maps teach in (unless told: one in the system's temp folder)
 */
export default function masterSword({ game, folders, scripts = [], cache } = {}) {
  const home = folders?.length ? folders : game ? [join(game, MOD_FOLDER), join(game, "valve")] : null;
  if (!home || !existsSync(home[0]))
    throw new Error(
      `the Master Sword profile is made from the installed game: give { game: <the Half-Life folder> } or { folders: [<Half-Life>/msc, <Half-Life>/valve] }${home ? ` (${home[0]} is not there)` : ""}`,
    );
  const mod = home[0];
  const fgd = FGDS.map((file) => join(mod, file)).filter((file) => existsSync(file));

  // the scripts: the pack's, and the loose ones given
  const pack = join(mod, SCRIPT_PACK);
  const known = new Set(scripts.flatMap((folder) => looseScriptNames(folder)));
  if (existsSync(pack)) for (const name of packScriptNames(readFileSync(pack))) known.add(name);
  const haveScripts = known.size > 0;

  // the scripts' texts, read when a picture first asks for a model: the loose ones stand over the pack's,
  // as they do in a pack made from them
  let texts = null;
  const models = new Map();
  const textOf = (name) => {
    if (!texts) {
      texts = existsSync(pack) ? packScripts(readFileSync(pack)) : new Map();
      for (const folder of scripts)
        for (const [script, file] of looseScriptFiles(folder))
          texts.set(script, readFileSync(file, "latin1"));
    }
    return texts.get(name);
  };
  const items = new Set(
    [...known].filter((name) => name.startsWith(ITEMS)).map((name) => name.slice(ITEMS.length)),
  );

  // the FGD writes reqhp as a whole number ("Req. Total HP (min;max)" : 0), and the game reads "min;max":
  // the key is given its true kind on every class the FGD gives it to
  // and it draws a spawn area as brushes, where the game has one class under two names (the source,
  // server/msmapents.cpp: msarea_monsterspawn and ms_monsterspawn are both CAreaMonsterSpawn) and the maps
  // write either name as a point (67 of 1232 msarea_monsterspawn have no brush)
  const classes = {};
  if (fgd.length)
    for (const [name, defined] of Object.entries(definitionsOf(fgd).classes))
      if (defined.keys.reqhp) classes[name] = { keys: { reqhp: { type: "string" } } };
  for (const area of AREAS) classes[area] = { ...classes[area], kind: "either" };

  // the names players arrive by: every `desttrans` a transition of the game's maps sends them on with
  let arrivals = null;
  const arrivesBy = (name) => {
    if (!arrivals) {
      arrivals = new Set();
      const mapsFolder = join(mod, "maps");
      for (const file of existsSync(mapsFolder) ? readdirSync(mapsFolder) : [])
        if (/.bsp$/i.test(file))
          for (const entity of entitiesOfFile(join(mapsFolder, file)) ?? [])
            for (const [key, value] of entity) if (key === "desttrans") arrivals.add(value);
    }
    return arrivals.has(name);
  };

  return {
    name: "mastersword",
    title: "Master Sword Classic",
    folders: home,
    // the classes that exist are the ones the program exports: the FGD and the hundred maps both lack
    // msmonster_giantspider, which the source links (server/monsters/msmonsterserver.cpp) and ms.dll has
    dlls: [join(mod, PROGRAM)].filter((file) => existsSync(file)),
    fgd,
    // the maps beside the FGD: ms1.4.fgd says of itself that it is to be put together with halflife.fgd,
    // and forgets classes and keys the maps use daily (msmonster_random, ms_counter's keys, params...)
    learned: { maps: join(mod, "maps"), cache: cache ?? join(tmpdir(), "smak-mastersword-entities.json") },
    classes,

    // where a player comes into a map: a new character at an ms_player_begin, one who comes from another
    // map at an ms_player_spawn (the source, server/player/player.cpp: LINK_ENTITY_TO_CLASS of the two)
    starts: ["ms_player_begin", "ms_player_spawn"],
    // what walks: the FGD's ms_basenpc, `size(-16 -16 0, 16 16 72)`: a standing hull with its origin at the feet
    walkers: ["msmonster_*", "ms_npc", "msnpc_*"],
    origin: { starts: "middle", walkers: "feet" },

    // a player leaves a map by an msarea_transition (the source, server/msmapents.cpp, CAreaTransition);
    // one switched off (`disabled_msarea_transition`) is another class, and no way out
    exits: ["msarea_transition"],

    // what a monster, an NPC or a chest looks like is in its script (`scriptModel`, above)
    modelOf: (keys) => {
      const script = keys.scriptfile ?? keys.defscriptfile;
      if (!script || !isNamed(TEMPLATES, keys.classname)) return null;
      if (!models.has(script)) models.set(script, scriptModel(script, textOf));
      return models.get(script);
    },

    // a classname the game does not have is an entity switched off, and the mappers do it on purpose:
    // the maps have 20 classes written `disabled_<class>`, 5 `disable_<class>` and 5 `<class>_disabled`;
    // and 28 entities in 9 maps are a mapper's note to the next, `remark_<name>`
    off: ["disabled_*", "disable_*", "*_disabled", "remark_*"],

    // playing it (src/play.mjs), as seen in the game on 2026-10-13, in a local browser build with one saved
    // character and a page of 1024 by 768: a loaded map shows the character cards, and the first card, at
    // (512, 330), is clicked once to choose it and once more to enter; the game is there some 20 seconds
    // later. An NPC hears local speech only: `setsay` and then `say <text>` (`say_text` opens the chat line
    // instead, which then swallows the keys that follow). The orchard map took about 45 seconds to load.
    // Tried through `smak play` the same day: an NPC answered a `say` 9 to 27 seconds after it (the build
    // draws in software), so a say wants a long `wait` before its picture
    play: {
      enter: [{ click: [512, 330], wait: 1500, shot: "chosen" }, { click: [512, 330], wait: 20000 }], // prettier-ignore
      say: ["setsay", "say {text}"],
      loads: 45000,
      screen: [1024, 768],
    },

    targets: {
      // perishtarget: fired on a monster's last death (the source, server/monsters/msmonsterserver.cpp,
      // CMSMonster::KeyValue); fireallperish: fired by a spawn area when all its monsters have perished
      // (server/msmapents.cpp, CAreaMonsterSpawn::KeyValue)
      keys: [...GOLDSRC.targets.keys, "perishtarget", "fireallperish"],
      // mstrig_multi is multi_manager under another name (server/triggers.cpp links both to CMultiManager)
      others: [...GOLDSRC.targets.others, "mstrig_multi"],
    },

    // music: an msarea_music or an mstrig_music names its songs as KEYS, each with its length as the value
    // ("mschalls.mp3" "2:00"), or as `song`; the files are in msc/music (the maps: 291 msarea_music in 78
    // maps). "stop.mp3" stops the music and is no file
    files: [
      {
        classes: ["msarea_music", "mstrig_music", "msarea_music_dynamic"],
        key: "song",
        keys: "*.mp3",
        folders: ["music", ""],
        unless: ["stop.mp3", "none"],
        what: "music files",
      },
    ],

    rules: [
      // A player who has connected and not yet chosen his character is put at an ms_player_spec, or with
      // none at any ms_player_spawn; with neither the game finds him no place and drops him (the source,
      // server/player/player.cpp: SPAWN_SPECTATE, then SPAWN_GENERIC, then "No valid spots, kick player",
      // which on a listen server is a "disconnect"). A place to begin (ms_player_begin) does not count.
      // The maps: 38 of 100 have an ms_player_spec, and the rest an ms_player_spawn. Seen 2026-10-13: a yard
      // with a place to begin and neither of the two ended at "disconnected from server" every time, and
      // loaded once it was given an ms_player_spec.
      (live) =>
        live.some((entity) => entity.classname === "ms_player_spec" || entity.classname === "ms_player_spawn")
          ? []
          : [
              {
                level: "error",
                text: "the map has neither an ms_player_spec nor an ms_player_spawn: the game has nowhere to put a player who has connected and not yet chosen a character, and drops him at once (an ms_player_begin does not count)",
              },
            ],
      // A spawn area holds 32 monsters. The source, server/msmapents.cpp: class CAreaMonsterSpawn has
      // `monster_data_t mdSpawnMonster[32]`, and every monster that names the area by `spawnarea` takes
      // one place in it.
      {
        rule: "limit",
        key: "spawnarea",
        most: 32,
        to: AREAS,
        why: "a spawn area holds 32 monsters, mdSpawnMonster[32] in the game's msmapents.cpp: the rest never appear",
      },
      // `reqhp` is read only through a spawn area. The source: CMSMonster::KeyValue
      // (server/monsters/msmonsterserver.cpp) keeps it in m_HPReq_min and m_HPReq_max, and the only code
      // that looks at them is the spawn area's, which copies them into its own table when the monster
      // names it (msmapents.cpp, hpreq_min = pMonster->m_HPReq_min). A monster that stands in the map by
      // itself appears whatever the players' health. "0" asks for nothing, and the editors write it.
      {
        rule: "beside",
        classes: TEMPLATES,
        key: "reqhp",
        needs: "spawnarea",
        unless: ["", "0"],
        why: "the game reads reqhp only for a monster that names a spawn area: here it does nothing",
      },
      // `reqhp "min;max"`, or "min" alone for no upper end ("avg" after it has the players' average
      // counted and not their sum: msmonsterserver.cpp, the same function). Templates that stand at one
      // place of one area with different ranges are the same monster for different parties: the ranges are
      // to meet, so that someone appears whatever the health, and not to overlap, so that two do not.
      // The numbers are whole (atoi): "1;2000" and "2001" meet, as the game's own maps write them.
      {
        rule: "bands",
        classes: TEMPLATES,
        key: "reqhp",
        among: ["spawnarea", "origin"],
        separator: ";",
        words: ["avg"],
        whole: true,
        why: "one place of a spawn area, one monster for each strength of party",
      },
      // `fireallperish` fires when every monster of the area has used up its lives, and a monster with no
      // `lives`, or with 0, has them without end. The source: msmonsterserver.cpp, "if (!m_Lives) m_Lives
      // = -1; //zero == infinite lives", and the area's count in msmapents.cpp, which only ever counts down
      // a monster whose lives are over 0.
      {
        rule: "finite",
        classes: AREAS,
        when: "fireallperish",
        counted: "spawnarea",
        count: "lives",
        why: "fireallperish fires when every monster of the area has used up its lives; with no lives, or 0, a monster has them without end and it never fires",
      },
      // A player appears at an ms_player_spawn whose `message` is the name of the transition he came by.
      // The source, server/player/player.cpp: GetRandomSpawnSpot passes over every spot whose `message` is
      // not the player's transition, and that name is the `targetname` of the msarea_transition he last
      // touched in this map (msmapents.cpp, m_OldTransition) or the `desttrans` of the one that sent him
      // here from another. So `message` is to name a transition of this map, or a `desttrans` some map of
      // the game sends players on with; a spawn with no `message` is found by nobody but the fallbacks
      // (the maps: 769 of 852 ms_player_spawn give one). A transition that is switched off still names.
      {
        rule: "names",
        classes: ["ms_player_spawn"],
        key: "message",
        required: true,
        of: { classes: ["*msarea_transition*"] },
        among: (name) => arrivesBy(name),
        what: "the targetname of a transition (msarea_transition) of this map, nor a desttrans of any of the game's maps",
        why: "a player arrives at the ms_player_spawn whose message is the transition he came by",
      },
      // An msitem_spawn's `scriptfile` is an item's NAME, not a script's path: "item_key_rusty", never
      // "items/item_key_rusty". The source: shared/weapons/gispawn.cpp keeps it and hands it to the item
      // list, which knows items by name. The maps: 74 msitem_spawn, every `scriptfile` a bare name.
      {
        rule: "names",
        classes: ["msitem_spawn"],
        key: "scriptfile",
        required: true,
        among: (name) =>
          !haveScripts ||
          items.has(name.toLowerCase()) ||
          (known.has(scriptName(name))
            ? `an item is named without its folder: ${name.replace(/\\/g, "/").split("/").pop()}`
            : false),
        what: "an item's name (a script of the pack's items/ folder, without the folder)",
        why: "an msitem_spawn's scriptfile is an item's name",
      },
      // `scriptfile` and `defscriptfile` name a script of the pack, by its path without ".script":
      // "monsters/skeleton". The source: msmonsterserver.cpp takes either as m_ScriptName, and the scripts
      // are looked for in dlls/sc.dll (shared/ms/groupfile.cpp) and nowhere else in a released game.
      ...["scriptfile", "defscriptfile"].map((key) => ({
        rule: "names",
        classes: TEMPLATES,
        key,
        among: (name) => !haveScripts || known.has(scriptName(name)),
        what: `a script of the game's pack (${SCRIPT_PACK}) or of the script folders given`,
        why: "a monster with no script is nothing",
      })),
    ],
  };
}
