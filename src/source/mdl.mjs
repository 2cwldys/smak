// Source's studio models (.mdl, versions 44 to 49: Half-Life 2, Garry's Mod) read: what is in one, from its
// header and tables. Its triangles are in the .vvd and .vtx beside it (mesh.mjs).
//
//   readSourceMdl(bytes)   { version, name, bones, sequences, materials, cdmaterials, skins, bodyparts,
//                           attachments, hitboxes, flags, eyes, hull, view }
//
// Each table is one struct of the SDK's studio.h (2013), under its name there, with where its fields are in
// bytes from the struct's start. A name is kept apart from its struct and found by an offset counted from the
// struct's own start (`sz...index`), unlike GoldSrc's, which keeps a name inside.

const STUDIO_ID = "IDST";
const VERSIONS = [44, 45, 46, 47, 48, 49];

// studiohdr_t
const HDR = {
  id: 0,
  version: 4,
  checksum: 8,
  name: 12, // char[64]
  length: 76,
  eyeposition: 80,
  illumposition: 92,
  hull_min: 104,
  hull_max: 116,
  view_bbmin: 128,
  view_bbmax: 140,
  flags: 152,
  numbones: 156,
  boneindex: 160,
  numbonecontrollers: 164,
  bonecontrollerindex: 168,
  numhitboxsets: 172,
  hitboxsetindex: 176,
  numlocalanim: 180,
  localanimindex: 184,
  numlocalseq: 188,
  localseqindex: 192,
  numtextures: 204,
  textureindex: 208,
  numcdtextures: 212,
  cdtextureindex: 216,
  numskinref: 220,
  numskinfamilies: 224,
  skinindex: 228,
  numbodyparts: 232,
  bodypartindex: 236,
  numlocalattachments: 240,
  localattachmentindex: 244,
};
// mstudiobone_t
const BONE = { sznameindex: 0, parent: 4, pos: 32, quat: 44, rot: 60, flags: 160, sizeof: 216 };
// mstudioseqdesc_t
const SEQ = { szlabelindex: 4, szactivitynameindex: 8, flags: 12, activity: 16, actweight: 20, numevents: 24, eventindex: 28, numblends: 56, sizeof: 212 }; // prettier-ignore
// mstudioevent_t: the frame as a fraction of the animation (cycle), and the event's name or number in its text
const EVENT = { cycle: 0, event: 4, type: 8, options: 12, szeventindex: 76, sizeof: 80 };
// mstudiotexture_t
const TEXTURE = { sznameindex: 0, flags: 4, sizeof: 64 };
// mstudiobodyparts_t
const BODYPART = { sznameindex: 0, nummodels: 4, base: 8, modelindex: 12, sizeof: 16 };
// mstudiomodel_t: `vertexindex` is where its vertices begin in the .vvd's, in bytes of mstudiovertex_t (48)
const MODEL = { name: 0, nummeshes: 72, meshindex: 76, numvertices: 80, vertexindex: 84, sizeof: 148 };
// mstudiomesh_t: `vertexoffset` is its first vertex among its model's
const MESH = { material: 0, numvertices: 8, vertexoffset: 12, sizeof: 116 };
/** sizeof(mstudiovertex_t), by which a model's vertexindex counts. */
const VVD_VERTEX = 48;
// mstudioattachment_t
const ATTACHMENT = { sznameindex: 0, localbone: 8, local: 12, sizeof: 92 };
// mstudiohitboxset_t and mstudiobbox_t
const HITBOXSET = { sznameindex: 0, numhitboxes: 4, hitboxindex: 8, sizeof: 12 };
const BBOX = { bone: 0, group: 4, bbmin: 8, bbmax: 20, sizeof: 68 };

/** A zero-ended name at a place in the file. */
const textAt = (bytes, at, most = 256) => {
  const end = bytes.indexOf(0, at);
  return bytes.toString("latin1", at, end < 0 || end - at > most ? at + most : end);
};
const vec3At = (bytes, at) => [0, 1, 2].map((i) => bytes.readFloatLE(at + i * 4));
const int32 = (bytes, at) => bytes.readInt32LE(at);
/** A table of `count` structs at `index` (from `base`), each read by `read(at, i)`. */
const tableOf = (bytes, count, index, sizeof, read, base = 0) =>
  Array.from({ length: int32(bytes, count) }, (_, i) => read(base + int32(bytes, index) + i * sizeof, i));

/**
 * What a Source model is made of, from its .mdl alone: { version, name, flags, eyes, hull: [min, max],
 * view: [min, max], bones: [{ name, parent, pos, rot }], sequences: [{ name, activity, actweight, flags,
 * events: [{ cycle, event, options }], blends }], materials (each texture's name, as its VMT is named under one
 * of cdmaterials), cdmaterials (the folders under materials/ they are looked for in), skins (each family's
 * texture numbers by reference), bodyparts: [{ name, base, models: [{ name, vertices, firstVertex (its first in the
 * .vvd), meshes: [{ material, vertices, firstVertex (among its model's) }] }] }],
 * attachments: [{ name, bone, pos }], hitboxes: [{ set, bone, group, min, max }] }.
 */
export function readSourceMdl(bytes) {
  if (bytes.toString("latin1", 0, 4) !== STUDIO_ID) throw new Error("not a studio model (no IDST)");
  const version = int32(bytes, HDR.version);
  if (!VERSIONS.includes(version))
    throw new Error(`a studio model of version ${version}: Source's are ${VERSIONS[0]} to ${VERSIONS.at(-1)} (GoldSrc's 10)`);
  const nameOf = (at, field) => textAt(bytes, at + int32(bytes, at + field));

  const bones = tableOf(bytes, HDR.numbones, HDR.boneindex, BONE.sizeof, (at) => ({
    name: nameOf(at, BONE.sznameindex),
    parent: int32(bytes, at + BONE.parent),
    pos: vec3At(bytes, at + BONE.pos),
    rot: vec3At(bytes, at + BONE.rot),
  }));
  const sequences = tableOf(bytes, HDR.numlocalseq, HDR.localseqindex, SEQ.sizeof, (at) => ({
    name: nameOf(at, SEQ.szlabelindex),
    activity: nameOf(at, SEQ.szactivitynameindex),
    actweight: int32(bytes, at + SEQ.actweight),
    flags: int32(bytes, at + SEQ.flags),
    blends: int32(bytes, at + SEQ.numblends),
    events: Array.from({ length: int32(bytes, at + SEQ.numevents) }, (_, i) => {
      const event = at + int32(bytes, at + SEQ.eventindex) + i * EVENT.sizeof;
      return {
        cycle: bytes.readFloatLE(event + EVENT.cycle),
        event: int32(bytes, event + EVENT.event),
        options: textAt(bytes, event + EVENT.options, 64),
        name: int32(bytes, event + EVENT.szeventindex) ? nameOf(event, EVENT.szeventindex) : "",
      };
    }),
  }));
  const materials = tableOf(bytes, HDR.numtextures, HDR.textureindex, TEXTURE.sizeof, (at) => nameOf(at, TEXTURE.sznameindex));
  const cdmaterials = tableOf(bytes, HDR.numcdtextures, HDR.cdtextureindex, 4, (at) => textAt(bytes, int32(bytes, at)));
  const refs = int32(bytes, HDR.numskinref);
  const skins = Array.from({ length: int32(bytes, HDR.numskinfamilies) }, (_, family) =>
    Array.from({ length: refs }, (_, ref) => bytes.readInt16LE(int32(bytes, HDR.skinindex) + (family * refs + ref) * 2)),
  );
  const bodyparts = tableOf(bytes, HDR.numbodyparts, HDR.bodypartindex, BODYPART.sizeof, (at) => ({
    name: nameOf(at, BODYPART.sznameindex),
    base: int32(bytes, at + BODYPART.base),
    models: Array.from({ length: int32(bytes, at + BODYPART.nummodels) }, (_, i) => {
      const model = at + int32(bytes, at + BODYPART.modelindex) + i * MODEL.sizeof;
      return {
        name: textAt(bytes, model + MODEL.name, 64),
        vertices: int32(bytes, model + MODEL.numvertices),
        firstVertex: int32(bytes, model + MODEL.vertexindex) / VVD_VERTEX,
        meshes: Array.from({ length: int32(bytes, model + MODEL.nummeshes) }, (_, k) => {
          const mesh = model + int32(bytes, model + MODEL.meshindex) + k * MESH.sizeof;
          return {
            material: int32(bytes, mesh + MESH.material),
            vertices: int32(bytes, mesh + MESH.numvertices),
            firstVertex: int32(bytes, mesh + MESH.vertexoffset),
          };
        }),
      };
    }),
  }));
  const attachments = tableOf(bytes, HDR.numlocalattachments, HDR.localattachmentindex, ATTACHMENT.sizeof, (at) => ({
    name: nameOf(at, ATTACHMENT.sznameindex),
    bone: int32(bytes, at + ATTACHMENT.localbone),
    // the matrix's last column: where it is in its bone's space
    pos: [0, 1, 2].map((row) => bytes.readFloatLE(at + ATTACHMENT.local + (row * 4 + 3) * 4)),
  }));
  const hitboxes = tableOf(bytes, HDR.numhitboxsets, HDR.hitboxsetindex, HITBOXSET.sizeof, (set) =>
    Array.from({ length: int32(bytes, set + HITBOXSET.numhitboxes) }, (_, i) => {
      const box = set + int32(bytes, set + HITBOXSET.hitboxindex) + i * BBOX.sizeof;
      return {
        set: nameOf(set, HITBOXSET.sznameindex),
        bone: int32(bytes, box + BBOX.bone),
        group: int32(bytes, box + BBOX.group),
        min: vec3At(bytes, box + BBOX.bbmin),
        max: vec3At(bytes, box + BBOX.bbmax),
      };
    }),
  ).flat();
  return {
    version,
    name: textAt(bytes, HDR.name, 64),
    flags: int32(bytes, HDR.flags),
    eyes: vec3At(bytes, HDR.eyeposition),
    hull: [vec3At(bytes, HDR.hull_min), vec3At(bytes, HDR.hull_max)],
    view: [vec3At(bytes, HDR.view_bbmin), vec3At(bytes, HDR.view_bbmax)],
    bones,
    sequences,
    materials,
    cdmaterials,
    skins,
    bodyparts,
    attachments,
    hitboxes,
  };
}
