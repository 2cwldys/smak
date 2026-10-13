// The two ways a new shape gets into the game: a whole model written from triangles (buildMdl), and a new
// piece put in the place of one that an existing model already shows (swapMesh), which keeps that model's
// bones, animations, events and attachments, so the game goes on using it as it did.
//
// A piece is what the workshop and the kits make: { tris, image }. A triangle is three corners
// { p: [x, y, z], uv: [u, v] (0..1, from the picture's top left) } and, where the piece hangs from more than
// one bone, `bone`.
import { writeMdl, readMdl, replaceMesh, emptyMesh, boneMatrices, mul34, inverse34 } from "./mdl.mjs";
import { meshOf } from "./mesh.mjs";
import { HANDS, measure, frameOf, bestTurn } from "./fit.mjs";
import { into, out, box, uniq } from "./vec.mjs";

/**
 * A whole model from triangles.
 *   name       what the file calls itself ("mygun.mdl")
 *   bones      [{ name, parent (-1 for a root; a parent comes before its children), pos, rot }]; one bone,
 *              "root", unless told
 *   bodyparts  [{ name, models: [{ name, meshes: [{ tris, texture }] }] }]
 *              tris: corners { p (where it is in the model, the bones at rest), uv, bone (a bone's name or
 *              number; the first unless told) }
 *              texture: { name, width, height, pixels, palette, flags } (see image.mjs: indexed, masked,
 *              textureFrom); meshes that give a texture of the same name share it
 *   sequences  [{ name, fps, loops, frames: [for each frame, for each bone, [x, y, z, about x, about y,
 *              about z]] }]; one, "idle", holding the bones at rest, unless told
 *   smooth     faces meeting at less than this many degrees share a normal (40)
 *   ownNormals true: a corner that carries `n` (a normal of its own, in the model's space like `p`) keeps
 *              it, in place of the one worked out from the faces: see `meshOf` (false: `n` is not read)
 * It has no hit boxes, attachments or events: enough for a thing that is carried, worn, dropped or stood
 * somewhere. A weapon's first-person model needs those: start from the one the game has and use swapMesh.
 */
export function buildMdl({
  name,
  bones = [{ name: "root", parent: -1 }],
  bodyparts,
  sequences,
  smooth = 40,
  ownNormals = false,
}) {
  // each bone's matrix at rest, and its inverse: from the model's space into the bone's
  const rest = boneMatrices(bones);
  const intoBone = rest.map(inverse34);
  const textures = [];
  const boneNumber = (which) => {
    const i =
      typeof which === "number" ? which : which === undefined ? 0 : bones.findIndex((b) => b.name === which);
    if (!bones[i]) throw new Error(`${name}: no bone ${which}`);
    return i;
  };
  // the number of a texture in the model's list, which it joins when none there has its name
  const skinOf = (texture) => {
    let i = textures.findIndex((t) => t.name === texture.name);
    if (i < 0) i = textures.push(texture) - 1;
    return i;
  };
  const cornerOnBone = (corner) => {
    const bone = boneNumber(corner.bone);
    return {
      p: corner.p,
      uv: corner.uv,
      bone,
      to: intoBone[bone],
      group: corner.group,
      smooth: corner.smooth,
      n: ownNormals ? corner.n : undefined,
    };
  };
  const parts = bodyparts.map((bodypart) => ({
    name: bodypart.name,
    models: bodypart.models.map((model) => {
      // a submodel's meshes share one list of points: each mesh's are numbered on from the ones before
      const verts = [];
      const vertBones = [];
      const meshes = [];
      for (const given of model.meshes) {
        const mesh = meshOf(
          null,
          given.tris.map((tri) => tri.map(cornerOnBone)),
          given.texture,
          0,
          smooth,
        );
        const firstVert = verts.length;
        verts.push(...mesh.verts);
        vertBones.push(...mesh.vertBones);
        meshes.push({
          skin: skinOf(given.texture),
          norms: mesh.norms,
          normBones: mesh.normBones,
          tris: mesh.tris.map((tri) => tri.map(([vert, norm, s, t]) => [firstVert + vert, norm, s, t])),
        });
      }
      return { name: model.name, verts, vertBones, meshes };
    }),
  }));
  const still = bones.map((bone) => [...(bone.pos ?? [0, 0, 0]), ...(bone.rot ?? [0, 0, 0])]);
  return writeMdl({
    name,
    bones,
    sequences: sequences ?? [{ name: "idle", fps: 10, loops: true, frames: [still] }],
    textures,
    bodyparts: parts,
  });
}

/**
 * A fit that leaves the piece the size it was drawn at: the fit's scaling undone about the piece's lowest-x
 * end (the middle of that end of its box), so that end stays where the fit put it.
 */
function atOwnSize(fit, tris) {
  const b = box(uniq(tris));
  const hold = fit.at([b.mn[0], (b.mn[1] + b.mx[1]) / 2, (b.mn[2] + b.mx[2]) / 2]);
  const { at, k } = fit;
  return { ...fit, k: 1, at: (p) => at(p).map((v, a) => hold[a] + (v - hold[a]) / k) };
}
/**
 * How much more a step along a piece's length counts than one across it, when its nearest corner is looked
 * for.
 */
const ALONG_WEIGHT = 3;
/** The bone of the corner (of `corners`: { p, bone }) nearest a point, or `otherwise` when there are none. */
function boneNearest(corners, point, otherwise) {
  let bone = otherwise;
  let least = Infinity;
  for (const corner of corners) {
    const distance =
      ALONG_WEIGHT * Math.abs(corner.p[0] - point[0]) +
      Math.abs(corner.p[1] - point[1]) +
      Math.abs(corner.p[2] - point[2]);
    if (distance < least) {
      least = distance;
      bone = corner.bone;
    }
  }
  return bone;
}

/**
 * Returns a copy of a model with a new piece where one of its submodels shows an old one.
 *   body     the number the game gives the model to show that submodel (of the first bodypart)
 *   pick     (mesh) -> true for the meshes that are the old piece (default: all but the hands' and arms',
 *            told by their texture's name)
 *   piece    { tris, haft, rig, bones } as the kits make it
 *   texture  the piece's picture as a texture (indexed(piece.image, "name.bmp"))
 *   place    "fit" (default): the piece is drawn in its own axes, at any size (+x its length, +y its width,
 *              +z its thickness), and is laid over the old one: same length, same place, and of the four ways
 *              of turning it the one whose outline follows the old one's best
 *            "bone": its points are already where they must be, in the space of the bone that carries the old
 *              piece
 *   size     "old" (default): the piece is stretched to the old one's length, whatever size it was drawn at
 *            "own": it was drawn in the game's units and keeps its size; the end it starts at (its lowest x:
 *              the grip, the butt) stays where the old one's was, so the hand still holds it
 * The first of the old meshes takes the new piece; the others are left without triangles. A corner goes on
 * the bone that carried the old piece, unless the piece says otherwise: `rig: "nearest"` gives each corner
 * the bone of the old piece's nearest corner (what bent goes on bending), and `bones: [, "name", ...]` sends
 * the corners of `part` n to that bone.
 * Returns { mdl, report }: `report.left` is what is left between the two outlines, in units (small is good).
 */
export function swapMesh(
  src,
  {
    body = 0,
    pick = (mesh) => !HANDS.test(mesh.texture.name),
    piece,
    texture,
    place = "fit",
    size = "old",
    name = "",
  },
) {
  // `bone`: the one that carries the old piece; `original`: the old piece's triangles in that bone's space
  const { info, j: modelNumber, model, meshes, rest, bone, original } = measure(src, body, pick, name);

  // the fit: from the piece's space to the old piece's own axes (`frame`), or none when placed by bone
  const laid = place === "fit";
  const frame = laid ? frameOf(original) : null;
  const inAxes = laid
    ? original.map((tri) => tri.map((c) => ({ p: into(frame, c.p), mesh: c.mesh, bone: c.bone })))
    : original;
  let fit = laid
    ? bestTurn(piece.tris, inAxes, piece.haft)
    : { k: 1, name: "as given", left: 0, at: (p) => p };
  if (laid && size === "own") fit = atOwnSize(fit, piece.tris);

  // the bone of each corner: the piece's `bones` by the corner's `part` (part 0 is the carrying bone), or
  // with `rig: "nearest"` the bone of the old piece's nearest corner
  const partBones = (piece.bones ?? []).map((boneName, i) => (i ? info.bones.indexOf(boneName) : bone));
  const theirCorners = piece.rig === "nearest" ? inAxes.flat() : null;
  const tris = piece.tris.map((tri) =>
    tri.map((corner) => {
      const fitted = fit.at(corner.p);
      const p = laid ? out(frame, fitted) : fitted;
      const itsBone = theirCorners ? boneNearest(theirCorners, fitted, bone) : (partBones[corner.part] ?? -1);
      // `p` is in the carrying bone's space: a corner on another bone is told how to get from there to its
      // own
      return itsBone >= 0 && itsBone !== bone
        ? {
            p,
            uv: corner.uv,
            bone: itsBone,
            to: mul34(inverse34(rest[itsBone]), rest[bone]),
            group: corner.group,
            smooth: corner.smooth,
          }
        : { p, uv: corner.uv, group: corner.group, smooth: corner.smooth };
    }),
  );

  const mesh = meshOf(original, tris, texture, bone);
  const first = { bodypart: 0, model: modelNumber, mesh: meshes[0].k };
  let mdl = replaceMesh(src, first, mesh, texture);
  for (const { k } of meshes.slice(1)) mdl = emptyMesh(mdl, { bodypart: 0, model: modelNumber, mesh: k });

  const newBox = box(uniq(tris));
  const oldBox = box(uniq(original));
  return {
    mdl,
    report: {
      model: model.name,
      bone: info.bones[bone],
      bones: [...new Set(mesh.vertBones)].map((b) => info.bones[b]),
      was: original.length,
      now: tris.length,
      verts: mesh.verts.length,
      scale: fit.k,
      turn: fit.name,
      left: fit.left,
      boxOff: Math.max(
        ...[0, 1, 2].flatMap((a) => [
          Math.abs(newBox.mn[a] - oldBox.mn[a]),
          Math.abs(newBox.mx[a] - oldBox.mx[a]),
        ]),
      ),
      textures: readMdl(mdl).textures.length,
    },
  };
}
