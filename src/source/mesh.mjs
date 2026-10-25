// A Source model's triangles: its vertices from the .vvd, how they are joined from the .vtx, and which model and
// mesh each belongs to from the .mdl (readSourceMdl).
//
//   readVvd(bytes)                     { checksum, lods, vertices: [{ p, n, uv, bones: [[bone, weight]] }] } (LOD 0)
//   readVtx(bytes)                     { checksum, bodyparts: [models: [meshes: [triangles: [vertex x3]]]] } (LOD 0)
//   sourceTriangles(mdl, vvd, vtx)     [{ bodypart, model, mesh, material, corners: [vertex x3] }], in model space
//
// THE FILES (the SDK's studio.h and optimize.h, version 4 and 7).
// - .vvd: a header, then every vertex of every model one after another (mstudiovertex_t, 48 bytes: three bone
//   weights, three bones, how many, the position, the normal, u v), then their tangents. When the model has
//   levels of detail, LOD 0's vertices are found through its fixups: runs of the table that LOD 0 keeps.
// - .vtx: for each bodypart, model, level of detail and mesh, strip groups; each a list of its own vertices
//   (each naming a vertex of its mesh, origMeshVertID) and of indices into them, three a triangle.
// A corner's vertex in the .vvd is: its model's first (the .mdl's) + its mesh's first + origMeshVertID.
// The three bodyparts' files must be one model's: their checksums are the .mdl's.

const VVD_ID = "IDSV";
// vertexFileHeader_t
const VVD = { id: 0, version: 4, checksum: 8, numLODs: 12, numLODVertexes: 16, numFixups: 48, fixupTableStart: 52, vertexDataStart: 56 }; // prettier-ignore
// mstudiovertex_t
const VERTEX = { weight: 0, bone: 12, numbones: 15, pos: 16, normal: 28, uv: 40, sizeof: 48 };
// vertexFileFixup_t
const FIXUP = { lod: 0, sourceVertexID: 4, numVertexes: 8, sizeof: 12 };

// optimize.h, packed (FileHeader_t, BodyPartHeader_t, ModelHeader_t, ModelLODHeader_t, MeshHeader_t,
// StripGroupHeader_t, StripHeader_t, Vertex_t)
const VTX = { version: 0, checksum: 16, numLODs: 20, numBodyParts: 28, bodyPartOffset: 32 };
const VTX_VERSION = 7;
const PART = { numModels: 0, modelOffset: 4, sizeof: 8 };
const MODEL = { numLODs: 0, lodOffset: 4, sizeof: 8 };
const LOD = { numMeshes: 0, meshOffset: 4, sizeof: 12 };
const MESH = { numStripGroups: 0, stripGroupHeaderOffset: 4, sizeof: 9 };
const GROUP = { numVerts: 0, vertOffset: 4, numIndices: 8, indexOffset: 12, numStrips: 16, stripOffset: 20, sizeof: 25 }; // prettier-ignore
const STRIP = { numIndices: 0, indexOffset: 4, numVerts: 8, vertOffset: 12, flags: 18, sizeof: 27 };
const VTX_VERTEX = { origMeshVertID: 4, sizeof: 9 };
/** A strip's flags: its indices are a list of triangles, or a strip of them. */
const STRIP_IS_TRILIST = 1;
const STRIP_IS_TRISTRIP = 2;

const vec = (bytes, at, n) => Array.from({ length: n }, (_, i) => bytes.readFloatLE(at + i * 4));

/** The vertices of a .vvd, at its finest level of detail. */
export function readVvd(bytes) {
  if (bytes.toString("latin1", 0, 4) !== VVD_ID) throw new Error("not a .vvd (no IDSV)");
  const count = bytes.readInt32LE(VVD.numLODVertexes);
  const dataAt = bytes.readInt32LE(VVD.vertexDataStart);
  const vertexAt = (i) => {
    const at = dataAt + i * VERTEX.sizeof;
    const n = bytes[at + VERTEX.numbones];
    return {
      p: vec(bytes, at + VERTEX.pos, 3),
      n: vec(bytes, at + VERTEX.normal, 3),
      uv: vec(bytes, at + VERTEX.uv, 2),
      bones: Array.from({ length: n }, (_, k) => [bytes[at + VERTEX.bone + k], bytes.readFloatLE(at + VERTEX.weight + k * 4)]),
    };
  };
  const fixups = bytes.readInt32LE(VVD.numFixups);
  let vertices;
  if (!fixups) vertices = Array.from({ length: count }, (_, i) => vertexAt(i));
  else {
    vertices = [];
    const table = bytes.readInt32LE(VVD.fixupTableStart);
    for (let f = 0; f < fixups; f++) {
      const at = table + f * FIXUP.sizeof;
      if (bytes.readInt32LE(at + FIXUP.lod) < 0) continue;
      const from = bytes.readInt32LE(at + FIXUP.sourceVertexID);
      for (let i = 0; i < bytes.readInt32LE(at + FIXUP.numVertexes); i++) vertices.push(vertexAt(from + i));
    }
  }
  return { checksum: bytes.readInt32LE(VVD.checksum), lods: bytes.readInt32LE(VVD.numLODs), vertices };
}

/**
 * The triangles of a .vtx at its finest level of detail: for each bodypart, each model, each mesh, its triangles
 * as three numbers each, a vertex of that mesh (origMeshVertID).
 */
export function readVtx(bytes) {
  const version = bytes.readInt32LE(VTX.version);
  if (version !== VTX_VERSION) throw new Error(`a .vtx of version ${version}, where ${VTX_VERSION} is read`);
  const list = (at, count, offset, size, read) =>
    Array.from({ length: bytes.readInt32LE(at + count) }, (_, i) => read(at + bytes.readInt32LE(at + offset) + i * size));
  const bodyparts = list(0, VTX.numBodyParts, VTX.bodyPartOffset, PART.sizeof, (part) =>
    list(part, PART.numModels, PART.modelOffset, MODEL.sizeof, (model) => {
      // LOD 0 only
      if (!bytes.readInt32LE(model + MODEL.numLODs)) return [];
      const lod = model + bytes.readInt32LE(model + MODEL.lodOffset);
      return list(lod, LOD.numMeshes, LOD.meshOffset, MESH.sizeof, (mesh) => {
        const triangles = [];
        list(mesh, MESH.numStripGroups, MESH.stripGroupHeaderOffset, GROUP.sizeof, (group) => {
          const verts = group + bytes.readInt32LE(group + GROUP.vertOffset);
          const indices = group + bytes.readInt32LE(group + GROUP.indexOffset);
          const meshVertex = (index) => bytes.readUInt16LE(verts + bytes.readUInt16LE(indices + index * 2) * VTX_VERTEX.sizeof + VTX_VERTEX.origMeshVertID); // prettier-ignore
          list(group, GROUP.numStrips, GROUP.stripOffset, STRIP.sizeof, (strip) => {
            const first = bytes.readInt32LE(strip + STRIP.indexOffset);
            const count = bytes.readInt32LE(strip + STRIP.numIndices);
            const flags = bytes[strip + STRIP.flags];
            if (flags & STRIP_IS_TRISTRIP)
              for (let i = 0; i + 2 < count; i++) {
                const tri = [first + i, first + i + 1, first + i + 2].map(meshVertex);
                triangles.push(i % 2 ? [tri[1], tri[0], tri[2]] : tri);
              }
            else if (flags & STRIP_IS_TRILIST || !flags)
              for (let i = 0; i + 2 < count; i += 3) triangles.push([first + i, first + i + 1, first + i + 2].map(meshVertex));
          });
        });
        return triangles;
      });
    }),
  );
  return { checksum: bytes.readInt32LE(VTX.checksum), bodyparts };
}

/**
 * Every triangle of a Source model at rest, in model space: { bodypart, model, mesh (numbers), material (its
 * number among the .mdl's materials, in the first skin family), corners: [{ p, n, uv, bones }] x3 }, in the
 * order the .vtx gives them. `mdl` as readSourceMdl gives it; `vvd`, `vtx` as readVvd and readVtx do.
 */
export function sourceTriangles(mdl, vvd, vtx) {
  const triangles = [];
  mdl.bodyparts.forEach((part, b) =>
    part.models.forEach((model, m) =>
      model.meshes.forEach((mesh, k) => {
        for (const tri of vtx.bodyparts[b]?.[m]?.[k] ?? [])
          triangles.push({
            bodypart: b,
            model: m,
            mesh: k,
            material: mdl.skins[0]?.[mesh.material] ?? mesh.material,
            corners: tri.map((v) => vvd.vertices[model.firstVertex + mesh.firstVertex + v]),
          });
      }),
    ),
  );
  return triangles;
}
