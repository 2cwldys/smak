// The editor's page: a model opened, its shapes and textures fetched, and the animation in hand worked out
// from the project (core.mjs) into the frames that are drawn.

import * as core from "/core.mjs";
import { createView } from "/page/view.mjs";
import { $, query, state, status, sub, view } from "/page/state.mjs";
import { api, texUrl } from "/page/server.mjs";
import { bodySelects, renderAll, renderBodies } from "/page/panes.mjs";

// the second view, made when it is first asked for
let view2 = null;

// ── opening ────────────────────────────────────────────────────────────────
// the boxes at the top that the address can tick: its word, the box's id
const ADDRESS_BOXES = [
  ["bones", "showBones"],
  ["onion", "showOnion"],
  ["compare", "showCompare"],
  ["smooth", "showLinear"],
  ["both", "showBoth"],
  ["second", "showSecond"],
];
/**
 * A body number the address names (`body`, `body2`), for the first model opened only; null when it names
 * none.
 */
const bodyFromAddress = (word) => (state.firstOpen && query.has(word) ? Number(query.get(word)) : null);
/** The submodel of each bodypart that a body number shows. */
const picksOfBody = (scene, body) =>
  scene.bodyparts.map((bodypart) => Math.floor(body / bodypart.base) % bodypart.models.length);
/** The first submodel of each bodypart that has triangles: many models keep a blank one at body 0. */
const picksWithShape = (scene) =>
  scene.bodyparts.map((bodypart) =>
    Math.max(
      0,
      bodypart.models.findIndex((model) => model.tris > 0),
    ),
  );

export async function openModel(id) {
  state.ready = false;
  status(`opening ${id}`);
  const scene = await api("open", { model: id });
  Object.assign(state, {
    modelId: id,
    scene,
    project: scene.project,
    baseFrames: new Map(),
    geometry: new Map(),
    textureKeys: new Map(),
    textureImages: new Map(),
    worn2: new Set(),
    undo: [],
    redo: [],
    live: null,
    pendingOp: null,
    bone: -1,
    saved: null,
    skin: 0,
    thinNote: "",
  });
  state.ctx = {
    bones: scene.bones,
    seqs: scene.seqs,
    base: (number) => {
      const frames = state.baseFrames.get(number);
      if (!frames) throw new Error(`the frames of animation ${number} are not here yet`);
      return frames;
    },
  };
  state.depth = [];
  scene.bones.forEach((bone, i) => {
    state.depth[i] = bone.parent < 0 ? 0 : state.depth[bone.parent] + 1;
  });
  const body = bodyFromAddress("body");
  const body2 = bodyFromAddress("body2");
  state.picks = body !== null ? picksOfBody(scene, body) : picksWithShape(scene);
  // the second view begins on the same body
  state.picks2 = body2 !== null ? picksOfBody(scene, body2) : state.picks.slice();
  // a weapon in the hands as the player sees it, anything else from outside
  view.cam.mode = scene.viewModel ? "first" : "orbit";
  $("model").value = id;
  renderBodies();
  await loadGeometry();

  const anims = core.animList(state.project, state.ctx);
  const wanted =
    state.firstOpen && query.has("anim")
      ? core.animAt(state.project, state.ctx, query.get("anim"))
      : (anims.find((anim) => !anim.outside)?.n ?? 0);
  await selectAnim(wanted);
  if (state.firstOpen) applyAddress(scene);
  await loadSecond();
  state.firstOpen = false;

  if (state.tex < 0 || !scene.textures[state.tex]) state.tex = [...state.worn][0] ?? 0;
  frameOrbit();
  renderAll();
  const notes = scene.notes.length ? `; ${scene.notes.join("; ")}` : "";
  status(
    `${id}: ${scene.bones.length} bones, ${scene.seqs.length} animations, ${scene.textures.length} textures${notes}`,
  );
  state.ready = true;
}
/**
 * What the address asks for beyond the model, its body and its animation: the frame, the bone, the camera,
 * the boxes.
 */
function applyAddress(scene) {
  if (query.has("frame")) state.frame = Math.min(state.anim.count - 1, Number(query.get("frame")));
  if (query.has("bone")) {
    const wanted = query.get("bone").toLowerCase();
    state.bone = scene.bones.findIndex((bone) => bone.name.toLowerCase() === wanted);
  }
  if (query.has("cam")) view.cam.mode = query.get("cam") === "first" ? "first" : "orbit";
  for (const [word, boxId] of ADDRESS_BOXES) if (query.has(word)) $(boxId).checked = query.get(word) === "1";
  view.both = $("showBoth").checked;
}
export const bodyNumber = (picks = state.picks) =>
  state.scene.bodyparts.reduce((sum, bodypart, i) => sum + picks[i] * bodypart.base, 0);
/** The shapes of a body (a submodel of each bodypart), each with the texture the skin gives it. */
async function meshesOf(picks) {
  const meshes = [];
  for (const [i] of state.scene.bodyparts.entries()) {
    const key = `${i}/${picks[i]}`;
    if (!state.geometry.has(key)) {
      const answer = await api("geometry", { model: state.modelId, bp: i, sub: picks[i] });
      state.geometry.set(key, answer.meshes);
    }
    const skin = state.scene.skins[state.skin] ?? state.scene.skins[0] ?? [];
    for (const mesh of state.geometry.get(key)) {
      const number = skin[mesh.skinref];
      const texture = state.scene.textures[number];
      meshes.push({ ...mesh, tex: texture ? { n: number, ...texture } : null });
    }
  }
  return meshes;
}
const wornBy = (meshes) => new Set(meshes.filter((mesh) => mesh.tex).map((mesh) => mesh.tex.n));
export async function loadGeometry() {
  const meshes = await meshesOf(state.picks);
  view.setMeshes(meshes);
  state.worn = wornBy(meshes);
  await refreshTextures();
  state.dirty = true;
}
/**
 * The second view: another body of the same model beside the first, from the same camera at the same pose.
 * For looking only.
 */
export async function loadSecond() {
  const shown = $("showSecond").checked;
  $("view2").hidden = !shown;
  state.dirty = true;
  if (!shown) {
    view2?.setMeshes([]);
    state.worn2 = new Set();
    return;
  }
  if (!view2) {
    view2 = createView($("gl2"));
    // one camera for the two
    view2.cam = view.cam;
  }
  const meshes = await meshesOf(state.picks2);
  view2.setMeshes(meshes);
  state.worn2 = wornBy(meshes);
  for (const number of state.worn2)
    if (state.textureImages.has(number))
      view2.setTexture(number, state.textureImages.get(number), state.scene.textures[number].flags);
  $("bodies2").innerHTML = bodySelects("pick2", state.picks2, "which submodel the second view shows");
  await refreshTextures();
  state.dirty = true;
}
export const secondView = () => view2;
/**
 * The pictures of the textures the shown shapes wear, fetched again where the project now says something else
 * of them. `trial` ({ number, adjust }): that texture with these adjustments, not yet written, as a slider
 * moves.
 */
export function refreshTextures(trial) {
  const shown = [...new Set([...state.worn, ...state.worn2])];
  return Promise.all(
    shown.map((number) => {
      const adjust = trial?.number === number ? trial.adjust : null;
      const key = JSON.stringify(state.project.textures?.[number] ?? null) + JSON.stringify(adjust);
      if (state.textureKeys.get(number) === key) return null;
      state.textureKeys.set(number, key);
      return new Promise((done) => {
        const image = new Image();
        image.onload = () => {
          // a later call may have asked for another picture of it meanwhile: only the last one asked for is
          // worn
          if (state.textureKeys.get(number) === key) {
            const flags = state.scene.textures[number].flags;
            state.textureImages.set(number, image);
            view.setTexture(number, image, flags);
            if (state.worn2.has(number)) view2?.setTexture(number, image, flags);
            state.dirty = true;
          }
          done();
        };
        image.onerror = done;
        image.src = texUrl(number, adjust, { t: Date.now() });
      });
    }),
  );
}
/**
 * The source frames an animation stands on (its own, or those of the one it copies), fetched if they are not
 * here.
 */
export async function ensureBase(number) {
  const base = number >= state.scene.seqs.length ? state.project.anims?.[number]?.copyOf : number;
  if (base !== undefined && !state.baseFrames.has(base)) {
    const answer = await api("seq", { model: state.modelId, n: base });
    state.baseFrames.set(base, answer.frames);
  }
}
/**
 * How many animations the game mixes into this one (a player's aim up and down); none for most. Such a one is
 * not posed here.
 */
export function mixed() {
  const seqs = state.scene.seqs;
  const number = state.animNumber;
  return number < seqs.length && seqs[number].blends > 1 ? seqs[number].blends : 0;
}
export const mixedSay = () =>
  status(
    `${state.anim.name} is ${mixed()} animations that the game mixes: its motion is not changed here (its speed, looping and events can be). Duplicate it in the Animation tab to pose a copy`,
    true,
  );
export async function selectAnim(number) {
  await ensureBase(number);
  state.animNumber = number;
  state.frame = 0;
  state.playing = false;
  state.selectedEvent = -1;
  state.thinNote = "";
  recompute();
  renderAll();
  if (state.ready && mixed()) mixedSay();
}
/**
 * The animation in hand worked out again from the project (or from the pose being dragged), and its frames
 * baked.
 */
export function recompute() {
  state.anim = core.animOf(state.live ?? state.project, state.ctx, state.animNumber);
  state.frames = core.bakeAnim(state.anim, state.ctx);
  state.frame = Math.max(0, Math.min(state.frame, state.anim.count - 1));
  state.dirty = true;
}
// two frames are mixed only when the moment is further than this from the first
const BETWEEN_FRAMES = 1e-6;
/** The pose at a moment (a frame, or between two, as the engine mixes them). */
export function poseAt(frame) {
  const count = state.frames.length;
  const first = Math.max(0, Math.min(count - 1, Math.floor(frame)));
  const share = frame - first;
  const second = first + 1 < count ? first + 1 : $("loop").checked ? 0 : first;
  const from = state.frames[first];
  const to = state.frames[second];
  const values = share > BETWEEN_FRAMES ? from.map((v, bone) => core.mix(v, to[bone], share)) : from;
  return { values, world: core.worldOf(state.ctx.bones, values) };
}
// Orbit's opening frame: every 7th corner is measured, the eye stands 1.7 diagonals of the model's box away
// and never nearer than 10 units; a model with no corners is taken as a box 20 across
const ORBIT_CORNER_STEP = 7;
const ORBIT_DIAGONALS = 1.7;
const ORBIT_NEAREST = 10;
const EMPTY_HALF_BOX = 10;
/** The orbit camera put where the whole model, as its first frame stands it, is in the picture. */
export function frameOrbit() {
  const world = poseAt(0).world;
  let low = [1e9, 1e9, 1e9];
  let high = [-1e9, -1e9, -1e9];
  for (const mesh of view.meshes)
    for (let i = 0; i < mesh.count; i += ORBIT_CORNER_STEP) {
      const corner = [mesh.src[i * 3], mesh.src[i * 3 + 1], mesh.src[i * 3 + 2]];
      const point = core.mpt(world[mesh.bone[i]], corner);
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], point[axis]);
        high[axis] = Math.max(high[axis], point[axis]);
      }
    }
  if (low[0] > high[0]) {
    low = [-EMPTY_HALF_BOX, -EMPTY_HALF_BOX, -EMPTY_HALF_BOX];
    high = [EMPTY_HALF_BOX, EMPTY_HALF_BOX, EMPTY_HALF_BOX];
  }
  view.cam.target = low.map((v, axis) => (v + high[axis]) / 2);
  view.cam.dist = Math.max(ORBIT_NEAREST, Math.hypot(...sub(high, low)) * ORBIT_DIAGONALS);
}

// ── keys of the bone in hand ───────────────────────────────────────────────
// an animation of more than this many frames with a key on each is "dense": a change is spread about its
// frame
const DENSE_ABOVE = 2;
// the spread chosen by itself for a dense bone: a sixth of the animation either side, 3 frames at least
const AUTO_SPREAD_SHARE = 6;
const AUTO_SPREAD_LEAST = 3;
/**
 * A bone's keys in the animation in hand: { frames (in order), touched (the project has keys of its own for
 * it), dense (a key on every frame) }. A bone the project says nothing of has the file's: a key on every
 * frame.
 */
export function boneKeys(bone) {
  const count = state.anim.count;
  const keys = state.anim.keys[state.ctx.bones[bone].name];
  if (keys && Object.keys(keys).length) {
    const frames = Object.keys(keys)
      .map(Number)
      .sort((x, y) => x - y);
    return { frames, touched: true, dense: frames.length >= count && count > DENSE_ABOVE };
  }
  return { frames: Array.from({ length: count }, (_, i) => i), touched: false, dense: count > DENSE_ABOVE };
}
/** How many frames either side a change of this bone is carried: what was typed, or by itself. */
export function spreadFor(bone) {
  if (state.spread !== "") return Math.max(0, Number(state.spread) || 0);
  if (!boneKeys(bone).dense) return 0;
  return Math.max(AUTO_SPREAD_LEAST, Math.round(state.anim.count / AUTO_SPREAD_SHARE));
}
export const atFrame = () => Math.round(state.frame);
export const valuesNow = (bone = state.bone) =>
  core.valuesAt(state.project, state.ctx, state.animNumber, bone, atFrame());
