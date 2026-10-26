// A GoldSrc model (.mdl, version 10) made the files s&box's compiler builds a model from: a DMX for each submodel
// and each animation, a .vmdl that says how they go together, and a PNG and a .vmat for each texture.
//
//   portToSbox(src, { name, folder, groups, kind })   -> { name, vmdl, files, warnings, facts }
//   writeSboxPort(port, out)                         the files written under `out` (a project's Assets folder)
//   portToSboxFile(file, { out, name, folder, kind, compile, sbox })   read, written, compiled: the whole port
//
// WHAT GOES WHERE (under `out`, laid out as an s&box project's Assets):
//   models/<folder>/<name>.vmdl                          the model's document; compiled beside it (.vmdl_c)
//   models/<folder>/<name>/<submodel>.dmx, anims/*.dmx   its meshes and animations
//   materials/models/<folder>/<name>/<texture>.png .vmat (and <texture>_mask.png, a masked one's holes)
//
// IT IS SOURCE'S PORT, WRITTEN FOR s&box: portToSource (source/port.mjs) works the model out once (its bones and
// their names made unique, each submodel in the model's space, each animation's frames with a loop's travel put
// back, the skins, attachments, hit boxes, events, chrome worked out) and hands its parts as data; this writes them
// as s&box reads them. What differs from the GMod port:
// - DMX for SMD, which s&box reads not at all; and no turn (GMod's QC turns with $origin, s&box's compiler turns
//   nothing: see dmx.mjs);
// - a loop's travel taken out by the compiler (ExtractMotion on its root bone, along the axes GoldSrc's was:
//   LX, LY, LZ), as root motion the game moves the model by;
// - an event kept as s&box's generic one (AE_GENERIC_EVENT): its number as Int, its options (a sound's file, a
//   script's words) as StringData, for the game's code (SkinnedModelRenderer.OnGenericEvent). The sounds are not
//   copied: s&box plays a .sound asset, not a file named in an event;
// - nothing it collides as yet (s&box's physics shapes are its own nodes), and the first of an animation's blends
//   only: each said in a warning.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { readStudio, sequenceFilesOf } from "../studio-file.mjs";
import { sequenceGroups } from "../mdl.mjs";
import { png } from "../image.mjs";
import { portToSource, sourceName, PORT_FOLDER } from "../source/port.mjs";
import { dmxOf, boneNameOf } from "./dmx.mjs";
import { vmdlOf, vmatOf } from "./vmdl.mjs";
import { compileVmdl } from "./compile.mjs";

/** GoldSrc's masked texture flag (STUDIO_NF_MASKED): its palette's last colour a hole. */
const MASKED = 64;
/** A node's name as ModelDoc takes it: a hyphen in a mesh's name fails its compile, unsaid why. */
const nodeName = (name) => String(name).replace(/[^A-Za-z0-9_]/g, "_");

/** A masked texture's holes as a picture: white where it is drawn, black where it is not. */
function maskOf({ width, height, rgba }) {
  const mask = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3];
    mask.set([a, a, a, 255], i * 4);
  }
  return mask;
}

/** The port of a model read from its file's bytes (`src`, its textures in it). */
export function portToSbox(src, { name, folder = PORT_FOLDER, groups, kind } = {}) {
  if (!name) throw new Error("portToSbox: the model's name in s&box (name)");
  // a v_ model is a view model, as for GMod; a p_ one is not made a held one unless told: GMod's port gives it
  // Valve's biped's bone names (ValveBiped.Bip01_R_Hand) so GMod finds its hand, which s&box does not look for, and
  // whose hit boxes it then could not find ("Unknown bone", Half-Life's p_ models)
  const madeAs = kind ?? (/^v_/i.test(sourceName(name)) ? "view" : "thing");
  const port = portToSource(src, { name, folder, groups, kind: madeAs, collision: "none" });
  const { parts } = port;
  const where = sourceName(folder);
  const base = `models/${where}/${port.name}`;
  const files = [];
  const warnings = [...port.warnings];
  const view = port.facts.view;
  // the bones named as s&box keeps them, two that would come out one (Bip01 L and Bip01_L) kept apart as _2
  const boneNames = [];
  for (const bone of parts.bones) {
    const kept = boneNameOf(bone.name);
    let named = kept;
    for (let n = 2; boneNames.some((taken) => taken.toLowerCase() === named.toLowerCase()); n++)
      named = `${kept}_${n}`;
    boneNames.push(named);
  }
  const boneOf = new Map(parts.bones.map((bone, i) => [bone.name, boneNames[i]]));
  const sboxBones = parts.bones.map((bone, i) => ({ ...bone, name: boneNames[i] }));
  const dmxData = (path) => ({ ...parts.smd.get(path), bones: sboxBones });

  // ── the textures: a PNG and a .vmat each ──
  const materials = parts.textures.map((t) => {
    const color = `materials/${base}/${t.name}.png`;
    files.push({ path: color, data: png(t.width, t.height, t.rgba) });
    let mask;
    if (t.flags & MASKED) {
      mask = `materials/${base}/${t.name}_mask.png`;
      files.push({ path: mask, data: png(t.width, t.height, maskOf(t)) });
    }
    const path = `materials/${base}/${t.name}.vmat`;
    files.push({ path, data: vmatOf({ color, mask, flags: t.flags }) });
    return { name: t.name, path };
  });
  const pathOf = (material) => `materials/${base}/${material}.vmat`;
  // each skin after the first, as the materials of the first it changes
  const skins = parts.skins
    .slice(1)
    .map((row) =>
      row
        .map((to, j) => ({ from: pathOf(parts.skins[0][j]), to: pathOf(to) }))
        .filter((r) => r.from !== r.to),
    );

  // ── the meshes, and the bodygroups they make ──
  const meshes = [];
  const meshOf = new Map();
  for (const group of parts.bodygroups)
    for (const file of group.models) {
      if (!file || meshOf.has(file)) continue;
      const stem = file.replace(/\.smd$/, "");
      const mesh = { name: nodeName(stem), file: `${base}/${stem}.dmx` };
      files.push({ path: mesh.file, data: dmxOf(dmxData(file), { name: stem }) });
      meshes.push(mesh);
      meshOf.set(file, mesh.name);
    }
  // a model of one bodypart of one submodel has none to choose: its mesh is always drawn
  const choosing = parts.bodygroups.length > 1 || parts.bodygroups.some((g) => g.models.length > 1);
  // s&box finds a bodygroup by its name, and GoldSrc let two have one (v_9mmhandgun.mdl's two "studio"): the second is
  // <name>_2. ModelDoc renumbers a bodygroup whose name ends in a number after a letter (loader.mdl's leg1 to leg4 came
  // out leg1, leg3, leg5, leg7); after an underscore the number is kept, so leg2 is leg_2
  const groupNames = [];
  for (const g of parts.bodygroups) {
    const wanted = g.name.replace(/([A-Za-z])(\d+)$/, "$1_$2");
    let named = wanted;
    for (let n = 2; groupNames.some((taken) => taken.toLowerCase() === named.toLowerCase()); n++)
      named = `${wanted}_${n}`;
    groupNames.push(named);
  }
  const bodygroups = choosing
    ? parts.bodygroups.map((g, k) => ({
        name: groupNames[k],
        choices: g.models.map((file, i) => ({
          name: file ? meshOf.get(file) : `blank${i}`,
          meshes: file ? [meshOf.get(file)] : [],
        })),
      }))
    : [];

  // ── the animations ──
  const root = boneNames[parts.bones.findIndex((b) => b.parent < 0)] ?? "";
  const sequences = parts.sequences.length
    ? parts.sequences
    : parts.smd.has("anims/idle.smd")
      ? [
          {
            name: "idle",
            files: ["anims/idle.smd"],
            fps: 30,
            loops: false,
            activity: null,
            weight: 1,
            travel: [],
            blends: [],
            events: [],
          },
        ]
      : [];
  const blended = [];
  const renamed = [];
  const animations = sequences.map((s) => {
    const stem = s.files[0].replace(/\.smd$/, "");
    const file = `${base}/${stem}.dmx`;
    files.push({
      path: file,
      data: dmxOf(dmxData(s.files[0]), { fps: s.fps, name: stem.replace(/^anims\//, "") }),
    });
    if (s.files.length > 1) blended.push(`${s.name} (${s.files.length})`);
    const named = nodeName(s.name);
    if (named !== s.name) renamed.push(`${s.name} as ${named}`);
    return {
      name: named,
      file,
      fps: s.fps,
      loops: s.loops,
      activity: s.activity,
      weight: s.weight,
      fade: view ? 0 : 0.2,
      travel: s.travel,
      root,
      events: s.events,
    };
  });
  if (blended.length) warnings.push(`the first blend only of each animation that blends (${blended.join(", ")}): s&box blends by its animation graph, which a port does not make yet`); // prettier-ignore
  if (renamed.length) warnings.push(`animations named as s&box's compiler takes them: ${renamed.join(", ")}`);
  const events = sequences.reduce((n, s) => n + s.events.length, 0);
  if (events) warnings.push(`${events} events kept as s&box's generic ones (AE_GENERIC_EVENT: its number as Int, its options as StringData), for the game's code; the sounds they name are not copied`); // prettier-ignore
  warnings.push("nothing to collide as: s&box's physics shapes are not made by a port yet");

  // ── what a monster has ──
  const attachments = parts.attachments.map((a) => ({ name: a.name, bone: boneOf.get(a.bone), pos: a.pos }));
  const hitboxes = parts.hitboxes.map((h, i) => ({
    name: `hitbox${i}`,
    bone: boneOf.get(h.bone),
    group: h.group,
    min: h.min,
    max: h.max,
  }));

  const vmdl = `models/${where}/${port.name}.vmdl`;
  files.push({
    path: vmdl,
    data: vmdlOf({ meshes, materials, skins, bodygroups, sequences: animations, attachments, hitboxes }),
  });
  return {
    name: port.name,
    vmdl,
    files,
    warnings,
    // Source's port's parts it was written from (sbox/check.mjs holds the compiled model to them)
    parts,
    facts: {
      bones: boneNames,
      meshes: meshes.map((m) => m.name),
      sequences: animations.map((a) => a.name),
      materials: materials.map((m) => m.name),
      skins: 1 + skins.length,
      bodygroups: bodygroups.map((g) => ({ name: g.name, choices: g.choices.length })),
      attachments: attachments.map((a) => a.name),
      hitboxes: hitboxes.length,
    },
  };
}

/** The port's files written under `out`. Returns the .vmdl's full path. */
export function writeSboxPort(port, out) {
  for (const { path, data } of port.files) {
    const to = join(out, path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
  }
  return join(out, port.vmdl);
}

/**
 * The whole port of one model file: read (its textures from <name>T.mdl, its animations from <name>01.mdl...
 * when they are beside it), written under `out`, and compiled by s&box's resourcecompiler (unless compile is false).
 * Returns { ...the port, written (the .vmdl's path), compiled: { compiled, notes, took } or null }.
 */
export function portToSboxFile(file, { out, name, folder, kind, compile = true, sbox } = {}) {
  if (!out) throw new Error("portToSboxFile: the folder the port goes to (out: a project's Assets)");
  const { src } = readStudio(file);
  const groups = sequenceGroups(src).length > 1 ? sequenceFilesOf(file, src) : undefined;
  const own = String(file).replace(/\\/g, "/").split("/").pop();
  const port = portToSbox(src, { name: name ?? sourceName(own), folder, groups, kind });
  const written = writeSboxPort(port, resolve(out));
  const compiled = compile ? compileVmdl(resolve(out), port.vmdl, { sbox }) : null;
  return { ...port, written, compiled };
}
