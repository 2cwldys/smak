// The editor's page: what is shown, and every edit turned into a patch (core.mjs) that the server makes on
// the project file. The page keeps nothing of its own but what is on the screen: the project is the file, and
// when an agent changes it from a terminal the page takes the new one up within a second.
//
// This is where the page starts. Its parts, each a module beside this one, served as they are (no build
// step):
//   state.mjs      what the page knows at this moment, the 3D view and the canvases, the line at the top
//   server.mjs     the calls to the server
//   model.mjs      a model opened: its shapes, its textures, the animation in hand and its frames
//   edits.mjs      an edit sent as a patch, and undo
//   panes.mjs      the lists on the left and the tabs on the right, as HTML
//   actions.mjs    what the buttons, selects and boxes do
//   adjust.mjs     the Textures tab: adjustments tried and written, a picture dropped
//   stage.mjs      the layer over the 3D picture: skeleton, handles, the mouse
//   timeline.mjs   the timeline: drawn, and the mouse on it
//   keyboard.mjs   the keys
//   live.mjs       the poll that takes up what an agent or a script changed
//   view.mjs       the 3D picture itself (WebGL2)
// What is left here is the loop that draws every frame of the screen, and the start.
import * as core from "/core.mjs";
import { $, fail, over, state, status, view } from "/page/state.mjs";
import { api } from "/page/server.mjs";
import { atFrame, bodyNumber, boneKeys, openModel, poseAt, secondView, selectAnim } from "/page/model.mjs";
import { commit } from "/page/edits.mjs";
import { compareSoon, renderFrame } from "/page/panes.mjs";
import { actions, go } from "/page/actions.mjs";
import { drawOverlay } from "/page/stage.mjs";
import { drawTimeline } from "/page/timeline.mjs";
import { fillModels, firstChoice, startPolling } from "/page/live.mjs";
// these two are loaded for the listeners they register
import "/page/adjust.mjs";
import "/page/keyboard.mjs";

// ── every frame of the screen ──────────────────────────────────────────────
// a frame of the screen that took longer than this (the tab was hidden) moves the animation on by this much
// only
const LONGEST_STEP_S = 0.1;
// the onion skin of a bone with a key on every frame: this many frames before and after
const ONION_FRAMES = 3;
const ONION_BEFORE = [0.35, 0.6, 1, 0.3];
const ONION_AFTER = [1, 0.62, 0.3, 0.3];

/**
 * The animation moved on by `seconds` of the clock, at the speed chosen; it stops at its end unless it loops.
 */
function advance(seconds) {
  state.frame += seconds * state.anim.fps * Number($("speed").value);
  const count = state.anim.count;
  if ($("loop").checked) {
    if (state.frame >= count) state.frame %= count;
  } else if (state.frame >= count - 1) {
    state.frame = count - 1;
    state.playing = false;
  }
  state.dirty = true;
}
/**
 * The onion skin: the pose at the held bone's key before (blue) and after (orange), or a few frames either
 * way.
 */
function onionGhosts() {
  if (!$("showOnion").checked || state.playing) return [];
  const frame = atFrame();
  const keys = state.bone >= 0 ? boneKeys(state.bone) : null;
  const sparse = keys && !keys.dense;
  const before = sparse ? [...keys.frames].reverse().find((f) => f < frame) : frame - ONION_FRAMES;
  const after = sparse ? keys.frames.find((f) => f > frame) : frame + ONION_FRAMES;
  const ghosts = [];
  if (before !== undefined && before >= 0) ghosts.push({ pose: poseAt(before).world, colour: ONION_BEFORE });
  if (after !== undefined && after < state.anim.count)
    ghosts.push({ pose: poseAt(after).world, colour: ONION_AFTER });
  return ghosts;
}
/**
 * The lines of text over the views: what is shown, and a warning when a change would touch one frame only.
 */
function writeTags() {
  const anim = state.anim;
  const frame = state.playing ? state.frame.toFixed(1) : atFrame();
  const camera = view.cam.mode === "first" ? "first person, as the game shows it" : "orbit";
  const sides = view.both ? "  /  both sides of every triangle" : "";
  $("tag").textContent =
    `${state.modelId}  /  ${anim.n} ${anim.name}  /  frame ${frame} of ${anim.count - 1}  /  ${camera}${sides}`;
  const keys = state.bone >= 0 ? boneKeys(state.bone) : null;
  $("hint").textContent =
    state.bone >= 0 && keys.dense && state.spread === "0"
      ? "This bone has a key on every frame and spread is 0: only this frame will change."
      : "";
}
/** The second view drawn at the same pose, with the same choices as the first. */
function drawSecond() {
  const second = secondView();
  if (!second || $("view2").hidden) return;
  second.linear = view.linear;
  second.both = view.both;
  second.draw(state.world);
  const body = bodyNumber(state.picks2);
  const same = body === bodyNumber() ? " (the same as the first: choose another above)" : "";
  $("tag2").textContent = `second body: ${body}${same}`;
}
/** Everything on the screen that follows the pose, drawn again. */
function drawAll() {
  state.world = poseAt(state.playing ? state.frame : atFrame()).world;
  view.draw(state.world, onionGhosts());
  drawOverlay();
  drawTimeline();
  renderFrame();
  drawSecond();
  writeTags();
}
let lastTick = performance.now();
function tick(now) {
  const seconds = Math.min(LONGEST_STEP_S, (now - lastTick) / 1000);
  lastTick = now;
  if (state.ready && state.anim) {
    if (state.playing) advance(seconds);
    const sized = over.clientWidth !== state.lastWidth || over.clientHeight !== state.lastHeight;
    if (state.dirty || sized) {
      state.dirty = false;
      state.lastWidth = over.clientWidth;
      state.lastHeight = over.clientHeight;
      // smak's picture is asked for at the view's size
      if (sized) compareSoon();
      drawAll();
    }
  }
  requestAnimationFrame(tick);
}

// ── the start ──────────────────────────────────────────────────────────────
startPolling();
const models = await fillModels();
// the page's parts, for the tests and for a look from the browser's console
window.ed = {
  S: state,
  view,
  core,
  ACT: actions,
  go,
  commit,
  selectAnim,
  openModel,
  api,
  get view2() {
    return secondView();
  },
};
requestAnimationFrame(tick);
if (models.length) openModel(firstChoice(models, true)).catch(fail);
else status(`no .mdl files in ${state.folder}`, true);
