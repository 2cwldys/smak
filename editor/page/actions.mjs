// The editor's page: what its buttons, selects and boxes do. A button says what it does in `data-act`, a
// select or a box in `data-set`, and one listener on the document for each finds the function here.

import * as core from "/core.mjs";
import { $, DEG, fail, state, status, view } from "/page/state.mjs";
import { api } from "/page/server.mjs";
import {
  atFrame,
  boneKeys,
  loadGeometry,
  loadSecond,
  openModel,
  selectAnim,
  valuesNow,
} from "/page/model.mjs";
import { commit, edit, eventsCopy, opFor, setKey, textureName, tryOp, unredo } from "/page/edits.mjs";
import { compareSoon, renderAll, renderPane, renderTree, THIN_DEGREES, THIN_UNITS } from "/page/panes.mjs";
import { adjustNow, commitAdjust, upload, writeAdjust } from "/page/adjust.mjs";

// a new event when the animation has none to go by: the client plays a sound
export const SOUND_EVENT = 5004;
const NEW_EVENT_SOUND = "weapons/swingsmall.wav";

/** To a frame, stopped there. */
export function go(frame) {
  state.playing = false;
  state.frame = Math.max(0, Math.min(state.anim.count - 1, Math.round(frame)));
  state.dirty = true;
  compareSoon();
}
/** The keys thinned, of every bone or of those named, and how far the result is from what it was said. */
async function thin(bones) {
  const rot = Number($("thinRot")?.value ?? THIN_DEGREES);
  const pos = Number($("thinPos")?.value ?? THIN_UNITS);
  const was = state.frames;
  const op = tryOp(() => opFor(core.opThin, { rot, pos, bones }));
  if (!op) return;
  await commit(op);
  const apart = core.poseError(state.ctx.bones, was, state.frames);
  const where = apart.units > 1e-6 ? ` (frame ${apart.frame}, ${apart.bone})` : "";
  state.thinNote = `${op.before} keys to ${op.after}. The thinned animation is at most ${apart.units.toFixed(3)} units and ${apart.degrees.toFixed(2)} degrees from what it was${where}.`;
  status(state.thinNote);
  renderPane();
}

/**
 * What a click on anything with `data-act="name:argument"` does, by name; the keyboard calls the same. The
 * tests call them as `window.ed.ACT`.
 */
export const actions = {
  tab: (name) => {
    state.tab = name;
    renderPane();
  },
  anim: (number) => selectAnim(Number(number)).catch(fail),
  bone: (index) => {
    state.bone = Number(index);
    renderTree();
    renderPane();
    state.dirty = true;
  },
  mode: (mode) => {
    state.mode = mode;
    renderPane();
    state.dirty = true;
  },
  cam: (mode) => {
    view.cam.mode = mode;
    renderAll();
  },
  undo: () => unredo(state.undo, state.redo, "undo"),
  redo: () => unredo(state.redo, state.undo, "redo"),

  // the timeline's buttons
  play: () => {
    state.playing = !state.playing;
    if (state.playing && state.frame >= state.anim.count - 1) state.frame = 0;
    if (!state.playing) {
      state.frame = atFrame();
      compareSoon();
    }
    state.dirty = true;
  },
  first: () => go(0),
  last: () => go(state.anim.count - 1),
  prev: () => go(atFrame() - 1),
  next: () => go(atFrame() + 1),
  prevKey: () => {
    if (state.bone < 0) return go(atFrame() - 1);
    const before = boneKeys(state.bone).frames.filter((frame) => frame < atFrame());
    go(before.length ? before[before.length - 1] : 0);
  },
  nextKey: () => {
    if (state.bone < 0) return go(atFrame() + 1);
    const after = boneKeys(state.bone).frames.find((frame) => frame > atFrame());
    go(after ?? state.anim.count - 1);
  },

  // keys and poses
  key: () => state.bone >= 0 && edit(() => opFor(core.opKey, state.bone, atFrame(), valuesNow(), 0)),
  unkey: () => state.bone >= 0 && edit(() => opFor(core.opDeleteKey, state.bone, atFrame())),
  revertBone: () => state.bone >= 0 && edit(() => opFor(core.opDeleteKey, state.bone, "all")),
  revertAnim: () =>
    commit({
      what: `${state.anim.name} as the original`,
      set: [{ path: ["anims", state.animNumber], value: null }],
    }),
  thinBone: () => thin([state.ctx.bones[state.bone].name]),
  thin: () => thin(),
  copy: () => {
    state.copiedPose = state.frames[atFrame()].map((values) => values.slice());
    status(`pose of frame ${atFrame()} copied`);
    renderPane();
  },
  paste: () => state.copiedPose && edit(() => opFor(core.opPaste, atFrame(), state.copiedPose)),
  pasteMirror: () =>
    state.copiedPose &&
    edit(() => opFor(core.opPaste, atFrame(), core.mirrorPose(state.ctx.bones, state.copiedPose))),

  // the Animation tab
  stretch: () => edit(() => opFor(core.opSettings, { frames: Number($("aFrames").value) })),
  dup: async () => {
    const op = tryOp(() => opFor(core.opDuplicate, $("dupName").value));
    if (!op) return;
    await commit(op);
    await selectAnim(op.n);
  },

  // events: `evAdd` is also called by a double click on the timeline, with the frame under it
  evAdd: (_argument, _button, frame = atFrame()) => {
    const events = eventsCopy();
    const last = events[events.length - 1];
    events.push({
      frame,
      event: last?.event ?? SOUND_EVENT,
      type: 0,
      options: last?.event === SOUND_EVENT || !last ? NEW_EVENT_SOUND : "",
    });
    state.tab = "events";
    return edit(() => opFor(core.opEvents, events));
  },
  evDel: (index) => {
    const events = eventsCopy();
    events.splice(Number(index), 1);
    state.selectedEvent = -1;
    return edit(() => opFor(core.opEvents, events));
  },
  evGo: (index) => {
    state.selectedEvent = Number(index);
    go(state.anim.events[index].frame);
    renderPane();
  },
  evRevert: () =>
    commit({
      what: `events of ${state.anim.name} as the original`,
      set: [{ path: ["anims", state.animNumber, "events"], value: null }],
    }),

  // the Textures tab
  texUnfile: () =>
    commit({
      what: `texture ${textureName()}: the original picture`,
      set: [{ path: ["textures", state.tex, "file"], value: null }],
    }),
  texReset: () =>
    commit({
      what: `texture ${textureName()}: no adjustments`,
      set: [{ path: ["textures", state.tex, "adjust"], value: null }],
    }),
  selAll: () => {
    const adjust = adjustNow();
    delete adjust.select;
    return writeAdjust(adjust);
  },

  // the boxes at the top, from the keyboard
  both: () => {
    $("showBoth").checked = view.both = !view.both;
    state.dirty = true;
    compareSoon();
  },
  second: () => {
    $("showSecond").checked = !$("showSecond").checked;
    return loadSecond().then(compareSoon);
  },

  save: async () => {
    status("baking and checking...");
    state.tab = "save";
    try {
      state.saved = await api("bake", { model: state.modelId }, {});
      const { out, errors, warnings } = state.saved;
      status(`saved ${out}: ${errors.length} errors, ${warnings.length} warnings`, errors.length > 0);
    } catch (error) {
      fail(error);
    }
    renderPane();
  },
};

/** The bodypart a `data-set="pick:3"` select chooses for. */
const bodypartOf = (select) => Number(select.dataset.set.split(":")[1]);
/** What a change of anything with `data-set="name"` does, by name: handed its value and the element. */
const setters = {
  pick: async (value, select) => {
    state.picks[bodypartOf(select)] = Number(value);
    await loadGeometry();
    renderPane();
    compareSoon();
  },
  skin: async (value) => {
    state.skin = Number(value);
    await loadGeometry();
    await loadSecond();
    compareSoon();
  },
  pick2: async (value, select) => {
    state.picks2[bodypartOf(select)] = Number(value);
    await loadSecond();
  },
  mask: (_value, box) => {
    state.showMask = box.checked;
    renderPane();
  },
  spread: (value) => {
    state.spread = value;
  },
  fps: (value) => edit(() => opFor(core.opSettings, { fps: Number(value) })),
  loops: (_value, box) => edit(() => opFor(core.opSettings, { loops: box.checked })),
  interp: (value) => edit(() => opFor(core.opSettings, { interp: value })),
  tex: (value) => {
    state.tex = Number(value);
    renderPane();
  },
  uv: (_value, box) => {
    state.showUv = box.checked;
    renderPane();
  },
  engine: (value) => commit({ what: `engine: ${value}`, set: [{ path: ["engine"], value }] }),
  output: (value) => commit({ what: `output: ${value}`, set: [{ path: ["output"], value: value.trim() }] }),
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-act]");
  if (!button || button.disabled || !state.scene) return;
  const [name, argument] = button.dataset.act.split(":");
  Promise.resolve(actions[name]?.(argument, button)).catch(fail);
});
/** A number typed in the Pose tab (`data-val`: which of the key's six values): a key with it. */
function poseBoxChanged(box) {
  const values = valuesNow();
  const i = Number(box.dataset.val);
  values[i] = i < 3 ? Number(box.value) : Number(box.value) * DEG;
  setKey(values);
}
/** A box of the Events tab changed (`data-ev="index:field"`). */
function eventBoxChanged(box) {
  const [index, field] = box.dataset.ev.split(":");
  const events = eventsCopy();
  events[Number(index)][field] = field === "options" ? box.value : Number(box.value);
  state.selectedEvent = -1;
  edit(() => opFor(core.opEvents, events));
}
document.addEventListener("change", (event) => {
  const el = event.target;
  const data = el.dataset;
  if (!state.scene) return;
  if (data.set) return void Promise.resolve(setters[data.set.split(":")[0]]?.(el.value, el)).catch(fail);
  if (data.val !== undefined && state.bone >= 0) return void poseBoxChanged(el);
  if (data.ev) return void eventBoxChanged(el);
  if (data.adj || data.num || data.hex !== undefined) {
    // a slider stepped with the keys is written once, when the keys stop
    if (!(state.keying && el.type === "range")) commitAdjust(el);
    return;
  }
  if (el.id === "texFile" && el.files[0]) return void upload(el.files[0]);
  if (el.id === "model") return void openModel(el.value).catch(fail);
  if (el.id === "frame") return go(Number(el.value));
  // the boxes at the top. smak's picture: from the camera in use, whichever it is
  if (el.id === "showCompare") renderAll();
  if (el.id === "showLinear") view.linear = el.checked;
  if (el.id === "showBoth") {
    view.both = el.checked;
    compareSoon();
  }
  if (el.id === "showSecond") loadSecond().then(compareSoon).catch(fail);
  state.dirty = true;
});
$("boneFilter").addEventListener("input", renderTree);
