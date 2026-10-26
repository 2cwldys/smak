// Valve's DMX, the text s&box's model compiler reads a mesh and an animation from: what the SMD was to Source's
// compiler. s&box reads no SMD (neither its resourcecompiler nor any of its libraries; dmxconvert knows no SMD), so
// a port's SMDs are written as DMX instead, from the same data.
//
//   dmxOf({ bones, frames, triangles }, { fps, name })   the text of one DMX: a mesh's when there are triangles,
//                                                        else an animation's
//   boneNameOf(name)                                    a bone's name as s&box keeps it
//
// THE INPUT is smdOf's (source/smd.mjs): bones [{ name, parent }], frames [for each bone [x, y, z, rx, ry, rz]]
// (its place from its parent, the angles in radians about x, then y, then z), and a mesh's triangles
// [{ material, corners: [{ bone, p, n, uv, links? }] x3 }] in the model's space, counter-clockwise from the front,
// v counted from the picture's bottom.
//
// THE FILE is keyvalues2 text, format model 22, as s&box's own citizen_head.dmx:
//   a mesh       DmElement root { model, skeleton } -> DmeModel { its joints (DmeJoint, a tree), jointList, the
//                mesh's DmeDag -> DmeMesh -> DmeVertexData "bind" (position$0, normal$0, texcoord$0,
//                blendweights$0, blendindices$0, each with its Indices) and a DmeFaceSet for each material }
//   an animation DmElement root { skeleton, animationList } -> DmeAnimationList -> DmeChannelsClip { channels: each
//                bone's position and orientation, a DmeChannel on its joint's transform with a log of its keys }
// Measured on Half-Life's barney, compiled and played in s&box's editor (2026-10-26):
// - the axis system is z up, forwardParity 1: s&box reads that as its own (+x forward) and turns nothing. -2, the
//   citizen's, turns mesh and animations alike a quarter round;
// - s&box keeps a bone named "Bip01 Pelvis" as Bip01_Pelvis (and "Stealth." as Stealth_), and an animation's
//   channel on "Bip01 Pelvis" then moves nothing: names are written as s&box keeps them.
import { createHash } from "node:crypto";

/** Decimals a number is written with, as the SMD's. */
const DECIMALS = 6;
const num = (v) => {
  const text = (Math.abs(v) < 0.5 * 10 ** -DECIMALS ? 0 : v).toFixed(DECIMALS).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
};
const vec = (v) => v.map(num).join(" ");
/** A string in quotes: a quote in it would end it, and is written as an apostrophe. */
const quoted = (s) => `"${String(s).replace(/"/g, "'")}"`;

/** A bone's name as s&box keeps it: anything but a letter, a digit or an underscore as an underscore (measured: a
 * space, and stealth.mdl's "Stealth." kept as Stealth_). Two names may come out one: portToSbox keeps them apart. */
export const boneNameOf = (name) => String(name).replace(/[^A-Za-z0-9_]/g, "_");

/** A bone's three angles (radians, about x, then y, then z: the matrix Rz Ry Rx) as a quaternion [x, y, z, w]. */
export function quaternionOf([rx, ry, rz]) {
  const [sx, cx] = [Math.sin(rx / 2), Math.cos(rx / 2)];
  const [sy, cy] = [Math.sin(ry / 2), Math.cos(ry / 2)];
  const [sz, cz] = [Math.sin(rz / 2), Math.cos(rz / 2)];
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/**
 * The keyvalues2 writer. An element is { type, id, name, attrs: [[key, kind, value]] }; an "element" attribute's
 * value is an element (written in place) or another's id, an "element_array"'s a list of either. The ids are made
 * from `seed` and a count, so the same input writes the same file.
 */
function writer(seed) {
  let count = 0;
  const id = () => {
    const h = createHash("md5").update(`${seed}/${count++}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  };
  const element = (type, name, attrs = []) => ({ type, id: id(), name, attrs });
  // an element's lines added one by one: a mesh's are hundreds of thousands, more than push(...lines) may take
  // (Half-Life's loader.mdl overflowed the stack)
  const append = (lines, more) => {
    for (const line of more) lines.push(line);
  };
  const write = (el, tab = "") => {
    const lines = [
      `${tab}${quoted(el.type)}`,
      `${tab}{`,
      `${tab}\t"id" "elementid" ${quoted(el.id)}`,
      `${tab}\t"name" "string" ${quoted(el.name)}`,
    ];
    for (const [key, kind, value] of el.attrs) {
      if (kind === "element") {
        if (value && typeof value === "object") {
          lines.push(`${tab}\t${quoted(key)} ${quoted(value.type)}`);
          append(lines, write(value, `${tab}\t`).slice(1));
        } else lines.push(`${tab}\t${quoted(key)} "element" ${quoted(value ?? "")}`);
      } else if (kind === "element_array") {
        lines.push(`${tab}\t${quoted(key)} "element_array"`, `${tab}\t[`);
        value.forEach((v, i) => {
          const comma = i < value.length - 1 ? "," : "";
          if (typeof v === "object") {
            const inner = write(v, `${tab}\t\t`);
            inner[inner.length - 1] += comma;
            append(lines, inner);
          } else lines.push(`${tab}\t\t"element" ${quoted(v)}${comma}`);
        });
        lines.push(`${tab}\t]`);
      } else if (kind.endsWith("_array")) {
        lines.push(`${tab}\t${quoted(key)} ${quoted(kind)}`, `${tab}\t[`);
        value.forEach((v, i) => lines.push(`${tab}\t\t${quoted(v)}${i < value.length - 1 ? "," : ""}`));
        lines.push(`${tab}\t]`);
      } else lines.push(`${tab}\t${quoted(key)} ${quoted(kind)} ${quoted(value)}`);
    }
    lines.push(`${tab}}`);
    return lines;
  };
  return { element, write };
}

/** A bone's place, { p: [x, y, z], q: [x, y, z, w] }, as a DmeTransform. */
const transformOf = (w, name, { p, q }) =>
  w.element("DmeTransform", name, [
    ["position", "vector3", vec(p)],
    ["orientation", "quaternion", vec(q)],
    ["scale", "float", "1"],
  ]);
const identity = (w, name) => transformOf(w, name, { p: [0, 0, 0], q: [0, 0, 0, 1] });
/** z up and forwardParity 1: s&box's own axes, nothing turned (see above). */
const AXES = [
  ["upAxis", "int", "3"],
  ["forwardParity", "int", "1"],
  ["coordSys", "int", "0"],
];

/** The skeleton: a DmeModel, its joints a tree under it, each with its transform at `rest`. */
function skeletonOf(w, name, bones, rest, more = []) {
  const joints = bones.map((bone, i) => w.element("DmeJoint", bone.name, [["transform", "element", transformOf(w, bone.name, rest[i])], ["visible", "bool", "1"]])); // prettier-ignore
  joints.forEach((joint, i) =>
    joint.attrs.push([
      "children",
      "element_array",
      bones.flatMap((b, k) => (b.parent === i ? [joints[k]] : [])),
    ]),
  );
  const model = w.element("DmeModel", name, [
    ["transform", "element", identity(w, name)],
    ["visible", "bool", "1"],
    ["children", "element_array", [...bones.flatMap((b, k) => (b.parent < 0 ? [joints[k]] : [])), ...more]],
    ["jointList", "element_array", joints.map((j) => j.id)],
    ["upAxis", "string", "Z"],
    ["axisSystem", "element", w.element("DmeAxisSystem", "axisSystem", AXES)],
  ]);
  return { model, joints };
}

/** A list that keeps each value once, by a key: add returns its index. */
function keptOnce() {
  const list = [];
  const at = new Map();
  const add = (key, value) => {
    if (!at.has(key)) {
      at.set(key, list.length);
      list.push(value);
    }
    return at.get(key);
  };
  return { list, add };
}

/** The text of a mesh's DMX (with triangles) or an animation's (without). */
export function dmxOf({ bones: given, frames: six, triangles = [] }, { fps = 30, name = "smak" } = {}) {
  if (!given?.length) throw new Error("dmxOf: bones, one at least");
  if (!six?.length) throw new Error("dmxOf: frames, one at least (a mesh's rest)");
  if (!(fps > 0)) throw new Error(`dmxOf: fps more than 0, not ${fps}`);
  const bones = given.map((bone) => ({ ...bone, name: boneNameOf(bone.name) }));
  const frames = six.map((frame) =>
    frame.map(([x, y, z, rx, ry, rz]) => ({ p: [x, y, z], q: quaternionOf([rx, ry, rz]) })),
  );
  const w = writer(name);
  const head = "<!-- dmx encoding keyvalues2 4 format model 22 -->";
  if (triangles.length) {
    // each corner's position (with its bones), normal and u v, each kept once; a face set for each material,
    // its corners' numbers and -1 after each triangle
    const positions = keptOnce();
    const normals = keptOnce();
    const uvs = keptOnce();
    const links = (c) => (c.links?.length ? c.links : [[c.bone, 1]]);
    const jointCount = Math.max(1, ...triangles.flatMap((t) => t.corners.map((c) => links(c).length)));
    const indices = { p: [], n: [], uv: [] };
    const faces = new Map();
    for (const tri of triangles) {
      const face = faces.get(tri.material) ?? [];
      for (const c of tri.corners) {
        face.push(indices.p.length);
        const l = links(c);
        indices.p.push(positions.add(`${vec(c.p)}|${l.flat().join(",")}`, { p: c.p, l }));
        indices.n.push(normals.add(vec(c.n), c.n));
        indices.uv.push(uvs.add(vec(c.uv), c.uv));
      }
      face.push(-1);
      faces.set(tri.material, face);
    }
    const weights = [];
    const joints = [];
    for (const { l } of positions.list)
      for (let k = 0; k < jointCount; k++) {
        weights.push(num(l[k]?.[1] ?? 0));
        joints.push(String(l[k]?.[0] ?? 0));
      }
    const bind = w.element("DmeVertexData", "bind", [
      [
        "vertexFormat",
        "string_array",
        ["position$0", "normal$0", "texcoord$0", "blendweights$0", "blendindices$0"],
      ],
      ["jointCount", "int", String(jointCount)],
      ["flipVCoordinates", "bool", "1"],
      ["position$0", "vector3_array", positions.list.map((v) => vec(v.p))],
      ["position$0Indices", "int_array", indices.p.map(String)],
      ["normal$0", "vector3_array", normals.list.map(vec)],
      ["normal$0Indices", "int_array", indices.n.map(String)],
      ["texcoord$0", "vector2_array", uvs.list.map(vec)],
      ["texcoord$0Indices", "int_array", indices.uv.map(String)],
      ["blendweights$0", "float_array", weights],
      ["blendindices$0", "int_array", joints],
    ]);
    const faceSets = [...faces].map(([material, face]) =>
      w.element("DmeFaceSet", material, [
        ["faces", "int_array", face.map(String)],
        ["material", "element", w.element("DmeMaterial", material, [["mtlName", "string", material]])],
      ]),
    );
    const mesh = w.element("DmeMesh", name, [
      ["visible", "bool", "1"],
      ["currentState", "element", bind.id],
      ["baseStates", "element_array", [bind]],
      ["deltaStates", "element_array", []],
      ["faceSets", "element_array", faceSets],
    ]);
    const dag = w.element("DmeDag", name, [["transform", "element", identity(w, name)], ["shape", "element", mesh], ["visible", "bool", "1"]]); // prettier-ignore
    const { model } = skeletonOf(w, name, bones, frames[0], [dag]);
    const root = w.element("DmElement", "root", [
      ["model", "element", model],
      ["skeleton", "element", model.id],
    ]);
    return `${head}\n${w.write(root).join("\n")}\n`;
  }
  // an animation: each bone's position and orientation at each frame, keyed on its joint's transform
  const { model, joints } = skeletonOf(w, name, bones, frames[0]);
  const times = frames.map((_, f) => (f / fps).toFixed(4));
  const channel = (joint, i, what) => {
    const position = what === "position";
    const log = position ? "DmeVector3Log" : "DmeQuaternionLog";
    const layer = w.element(`${log}Layer`, `${what} log`, [
      ["times", "time_array", times],
      ["curvetypes", "int_array", []],
      [
        "values",
        position ? "vector3_array" : "quaternion_array",
        frames.map((frame) => vec(position ? frame[i].p : frame[i].q)),
      ],
    ]);
    return w.element("DmeChannel", `${bones[i].name}_${position ? "p" : "o"}`, [
      ["fromElement", "element", ""],
      ["fromAttribute", "string", ""],
      ["fromIndex", "int", "0"],
      ["toElement", "element", joint.attrs[0][2].id],
      ["toAttribute", "string", what],
      ["toIndex", "int", "0"],
      ["mode", "int", "3"],
      [
        "log",
        "element",
        w.element(log, `${what} log`, [
          ["layers", "element_array", [layer]],
          ["curveinfo", "element", ""],
          ["usedefaultvalue", "bool", "0"],
          ["defaultvalue", position ? "vector3" : "quaternion", position ? "0 0 0" : "0 0 0 1"],
        ]),
      ],
    ]);
  };
  const clip = w.element("DmeChannelsClip", name, [
    [
      "timeFrame",
      "element",
      w.element("DmeTimeFrame", "timeFrame", [
        ["start", "time", "0.0000"],
        ["duration", "time", ((frames.length - 1) / fps).toFixed(4)],
        ["offset", "time", "0.0000"],
        ["scale", "float", "1"],
      ]),
    ],
    ["color", "color", "0 0 0 0"],
    ["text", "string", ""],
    ["mute", "bool", "0"],
    ["trackGroups", "element_array", []],
    ["displayScale", "float", "1"],
    [
      "channels",
      "element_array",
      joints.flatMap((joint, i) => [channel(joint, i, "position"), channel(joint, i, "orientation")]),
    ],
    ["frameRate", "float", num(fps)],
  ]);
  const root = w.element("DmElement", "root", [
    ["skeleton", "element", model],
    [
      "animationList",
      "element",
      w.element("DmeAnimationList", "animationList", [["animations", "element_array", [clip]]]),
    ],
  ]);
  return `${head}\n${w.write(root).join("\n")}\n`;
}
