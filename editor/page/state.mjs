// The editor's page: what it knows at this moment (`state`), the 3D view and the two canvases drawn on in 2D, and
// the small things every other part uses. It imports none of the other parts, so that all of them can import it.

import * as core from "/core.mjs";
import { createView } from "/page/view.mjs";

export const $ = (id) => document.getElementById(id);
// The page's address: ?model=...&anim=...&frame=... (index.html lists them all). Read when the first model
// opens.
export const query = new URLSearchParams(location.search);
export const DEG = core.DEG;
const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
/** Text made safe to put into HTML. */
export const esc = (text) => String(text).replace(/[&<>"]/g, (char) => HTML_ENTITIES[char]);
// two points: one less the other, and their dot product
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** [r, g, b] as "#rrggbb". */
export const hexOf = (colour) => "#" + colour.map((v) => v.toString(16).padStart(2, "0")).join("");

/** Everything the page knows at this moment. The tests read it as `window.ed.S`. */
export const state = {
  // the model that is open, as the server described it, and its project
  modelId: null,
  scene: null,
  project: null,
  // what core.mjs wants to know of the source model: { bones, seqs, base(n) }
  ctx: null,
  // each bone's depth in the tree, for the list's indent
  depth: [],
  // the source animations' frames, by number, as they are fetched
  baseFrames: new Map(),
  // the shapes fetched, by "bodypart/submodel"
  geometry: new Map(),
  // the folder of models and the model the server was started on
  folder: null,
  firstModel: null,
  // true until the first model has opened: the address's choices apply to that one only
  firstOpen: true,
  // false while a model is being opened
  ready: false,

  // what is shown: the submodel picked of each bodypart, the skin, and the textures those shapes wear
  picks: [],
  skin: 0,
  worn: new Set(),
  // the second view's body and what it wears
  picks2: [],
  worn2: new Set(),
  // the pictures loaded, by texture number, and what the project said of each when its picture was asked for
  textureImages: new Map(),
  textureKeys: new Map(),

  // the animation in hand: its number, what the project says it is (core.animOf), and its frames baked
  animNumber: 0,
  anim: null,
  frames: [],
  // the frame shown (between two while playing), and every bone's matrix there
  frame: 0,
  playing: false,
  world: [],
  // where each joint is on the canvas, as the overlay last drew them
  joints: [],

  // the bone in hand (-1: none), how it is posed ("rotate" or "move"), and the spread typed ("": by itself)
  bone: -1,
  mode: "rotate",
  spread: "",
  // the handles drawn about the bone in hand, the one under the mouse, and the drag in progress in the 3D
  // view
  giz: null,
  hoverAxis: -1,
  drag: null,
  // a pose being dragged: the project as it would be, and the patch that makes it so
  live: null,
  pendingOp: null,
  // the pose copied with Ctrl+C
  copiedPose: null,

  // the tab on the right, and what it shows
  tab: query.get("tab") ?? "pose",
  // the frame the Pose tab's numbers were last written for
  shownFrame: -1,
  selectedEvent: -1,
  thinNote: "",
  // the Textures tab: the number of its texture (`tex`), whether its triangles are drawn over it, whether a
  // selection by colour is shown
  tex: Number(query.get("tex") ?? -1),
  showUv: query.get("uv") === "1",
  showMask: true,
  // what the last "Save model" answered
  saved: null,
  // the drag in progress on the timeline
  trackDrag: null,

  // the person's own edits, each with the patch that takes it back
  undo: [],
  redo: [],
  // how many calls that change the project are on their way to the server
  busy: 0,
  // a slider is being stepped with the keyboard, and its value is not written yet
  keying: false,

  // the picture needs drawing again; the size of the view it was last drawn at
  dirty: true,
  lastWidth: -1,
  lastHeight: -1,
  // how often smak's picture was asked for
  cmpN: 0,
  // the list of models as the server last signed it (undefined until the first answer)
  listSignature: undefined,
};
export const view = createView($("gl"));
export const over = $("over");
export const overlayContext = over.getContext("2d");
export const track = $("track");
export const trackContext = track.getContext("2d");

/** The line at the top right: what was just done, or, in red (`bad`), what went wrong. */
export function status(text, bad = false) {
  $("status").textContent = text;
  $("status").className = bad ? "bad" : "";
  $("status").title = text;
}
/** An error said in the line at the top, and in the browser's console with its trace. */
export const fail = (error) => {
  console.error(error);
  status(error.message, true);
};

// ── the two canvases drawn on in 2D: the layer over the 3D view, and the timeline ──
// a canvas has as many pixels as it is shown at, and no more than twice as many on a dense screen
const MAX_PIXEL_RATIO = 2;
/** A canvas given the pixels of the size it is shown at, and wiped: that size, in CSS pixels. */
export function clearCanvas(canvas, context) {
  const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { width, height };
}
/** Where a mouse event is on a canvas: [x, y] in CSS pixels from its top left. */
export function pointIn(canvas, event) {
  const box = canvas.getBoundingClientRect();
  return [event.clientX - box.left, event.clientY - box.top];
}
