// The editor's page: the timeline under the view. The frames, the events' flags and the keys drawn on its
// canvas, and the mouse on it: a frame gone to, a key or an event dragged to another frame.

import * as core from "/core.mjs";
import { $, clearCanvas, pointIn, state, track, trackContext } from "/page/state.mjs";
import { boneKeys } from "/page/model.mjs";
import { edit, eventsCopy, opFor } from "/page/edits.mjs";
import { renderPane } from "/page/panes.mjs";
import { actions, go, SOUND_EVENT } from "/page/actions.mjs";

// The track from the top: a ruler, a row of events' flags, then the keys. In CSS pixels.
// the space left and right of the first and last frame
const TRACK_PAD = 10;
// where the ruler ends and the events' row begins, and where that ends and the keys begin
const RULER_BOTTOM = 18;
const EVENTS_BOTTOM = 44;
// the row of the held bone's diamonds: its middle below EVENTS_BOTTOM, and the band about it that takes the
// mouse
const DIAMOND_ROW = 24;
const DIAMOND_BAND = [12, 38];
// a frame's number is written at steps that leave it this many pixels at least
const LABEL_ROOM_PX = 34;
const LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100, 200];
const LABEL_STEP_MOST = 500;
// a flag is taken by a press within this of its pole at least, or on its pennant (this wide, this far down
// the row)
const FLAG_REACH_PX = 7;
const FLAG_WIDTH = 12;
const FLAG_HEIGHT = 14;

/** How wide one frame is on the track. */
const frameWidth = () => (track.clientWidth - 2 * TRACK_PAD) / state.anim.count;
/** The middle of a frame on the track, and the frame under an x. */
const frameX = (frame) =>
  TRACK_PAD + ((frame + 0.5) * (track.clientWidth - 2 * TRACK_PAD)) / state.anim.count;
const frameAtX = (x) =>
  Math.max(0, Math.min(state.anim.count - 1, Math.floor((x - TRACK_PAD) / frameWidth())));

/** The ruler's ticks and numbers, and the two rows' grounds and names. */
function drawRuler(ctx, width, height, cell) {
  const count = state.anim.count;
  ctx.font = "10px system-ui";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#262b33";
  ctx.fillRect(0, RULER_BOTTOM, width, EVENTS_BOTTOM - RULER_BOTTOM);
  ctx.fillStyle = "#1d2127";
  ctx.fillRect(0, EVENTS_BOTTOM, width, height - EVENTS_BOTTOM);
  const every = LABEL_STEPS.find((step) => step * cell >= LABEL_ROOM_PX) ?? LABEL_STEP_MOST;
  for (let frame = 0; frame < count; frame++) {
    const x = frameX(frame);
    const minor = frame % every;
    ctx.fillStyle = minor ? "#3a414b" : "#6c7684";
    // the small ticks are left out when the frames are too close for them
    if (cell >= 3 || !minor) ctx.fillRect(Math.round(x), minor ? 12 : 6, 1, minor ? 6 : 12);
    if (!minor) {
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText(frame, x + 3, 7);
    }
  }
  ctx.fillStyle = "#6c7684";
  ctx.fillText("events", 4, RULER_BOTTOM + 6);
  const whose = state.bone >= 0 ? `keys: ${state.ctx.bones[state.bone].name}` : "keys: all bones";
  ctx.fillText(whose, 4, EVENTS_BOTTOM + 7);
}
/** The keys of every bone that has its own: a tick at each frame, taller with more bones. */
function drawKeyCounts(ctx, height, cell) {
  const count = state.anim.count;
  const bonesKeyed = new Array(count).fill(0);
  let any = false;
  for (const keys of Object.values(state.anim.keys)) {
    const frames = Object.keys(keys);
    if (frames.length) any = true;
    for (const frame of frames) if (frame < count) bonesKeyed[frame]++;
  }
  if (!any) {
    ctx.fillStyle = "#8a93a0";
    ctx.fillText(
      "every frame is a key, as the file has it: pose a bone and the change is spread about the frame, or thin the keys (Animation) to shape it from a few",
      110,
      EVENTS_BOTTOM + 7,
    );
  }
  for (let frame = 0; frame < count; frame++)
    if (bonesKeyed[frame]) {
      const tall = Math.min(14, 3 + bonesKeyed[frame]);
      ctx.fillStyle = "#7d6f45";
      ctx.fillRect(
        frameX(frame) - Math.max(1, Math.min(3, cell / 2 - 1)),
        height - 4 - tall,
        Math.max(2, Math.min(6, cell - 2)),
        tall,
      );
    }
}
/** The keys of the bone in hand: a diamond each, the one being dragged where the mouse has it. */
function drawBoneKeys(ctx, cell) {
  const keys = boneKeys(state.bone);
  const y = EVENTS_BOTTOM + DIAMOND_ROW;
  const half = Math.max(2.5, Math.min(6, cell * 0.45));
  const moving = state.trackDrag?.kind === "key" ? state.trackDrag : null;
  for (const frame of keys.frames) {
    const x = frameX(moving && frame === moving.from ? moving.to : frame);
    ctx.fillStyle = keys.touched ? (keys.dense ? "#b9963c" : "#ffd766") : "#77808c";
    ctx.beginPath();
    ctx.moveTo(x, y - half - 1);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half + 1);
    ctx.lineTo(x - half, y);
    ctx.fill();
  }
}
/** The events: a flag each with its sound's name (and its number when it is not the usual one). */
function drawEvents(ctx, width) {
  const dragged = state.trackDrag?.kind === "event" ? state.trackDrag : null;
  state.anim.events.forEach((event, i) => {
    const frame = dragged && dragged.index === i ? dragged.to : event.frame;
    const x = frameX(frame);
    const number = event.event === SOUND_EVENT ? "" : event.event + " ";
    const text = `${number}${String(event.options).split("/").pop()}`;
    ctx.fillStyle = i === state.selectedEvent ? "#ffd766" : "#69b7e8";
    ctx.fillRect(x - 1, RULER_BOTTOM + 2, 2, EVENTS_BOTTOM - RULER_BOTTOM - 4);
    ctx.beginPath();
    ctx.moveTo(x, RULER_BOTTOM + 3);
    ctx.lineTo(x + 9, RULER_BOTTOM + 8);
    ctx.lineTo(x, RULER_BOTTOM + 13);
    ctx.fill();
    // the names take turns on two lines, and the last ones are kept inside the track
    const textX = Math.min(x + 12, width - ctx.measureText(text).width - 4);
    ctx.fillText(text, textX, RULER_BOTTOM + (i % 2 ? 19 : 8));
  });
}
/** The red line at the frame shown. */
function drawPlayhead(ctx, height) {
  const x = frameX(state.frame);
  ctx.fillStyle = "#ff5a4d";
  ctx.fillRect(x - 1, 0, 2, height);
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x, 9);
  ctx.fill();
}
export function drawTimeline() {
  const ctx = trackContext;
  const anim = state.anim;
  // measured before the canvas is given its pixels, as the rest is laid out by it
  const cell = (track.clientWidth - 2 * TRACK_PAD) / anim.count;
  const { width, height } = clearCanvas(track, ctx);
  drawRuler(ctx, width, height, cell);
  drawKeyCounts(ctx, height, cell);
  if (state.bone >= 0) drawBoneKeys(ctx, cell);
  drawEvents(ctx, width);
  drawPlayhead(ctx, height);
  const seconds = (Math.max(1, anim.count - 1) / anim.fps).toFixed(2);
  $("tlNote").textContent = `${anim.name}: ${anim.count} frames at ${+anim.fps.toFixed(2)}, ${seconds} s`;
}
/** The event whose flag is under a point of the track, or -1. */
function flagAt(x, y) {
  if (y < RULER_BOTTOM || y >= EVENTS_BOTTOM) return -1;
  const reach = Math.max(FLAG_REACH_PX, frameWidth() / 2 + 1);
  return state.anim.events.findIndex((event) => {
    const pole = frameX(event.frame);
    const onPennant = x > pole && x < pole + FLAG_WIDTH && y < RULER_BOTTOM + FLAG_HEIGHT;
    return Math.abs(pole - x) < reach || onPennant;
  });
}
track.addEventListener("pointerdown", (event) => {
  if (!state.ready) return;
  track.setPointerCapture(event.pointerId);
  const [x, y] = pointIn(track, event);
  const frame = frameAtX(x);
  const flag = flagAt(x, y);
  const onDiamonds = y >= EVENTS_BOTTOM + DIAMOND_BAND[0] && y < EVENTS_BOTTOM + DIAMOND_BAND[1];
  if (flag >= 0) {
    state.trackDrag = { kind: "event", index: flag, to: state.anim.events[flag].frame };
    state.selectedEvent = flag;
  } else if (onDiamonds && state.bone >= 0 && boneKeys(state.bone).frames.includes(frame)) {
    state.trackDrag = { kind: "key", from: frame, to: frame };
    go(frame);
  } else {
    state.trackDrag = { kind: "scrub" };
    go(frame);
  }
  state.dirty = true;
});
track.addEventListener("pointermove", (event) => {
  const drag = state.trackDrag;
  if (!drag) return;
  const frame = frameAtX(pointIn(track, event)[0]);
  if (drag.kind === "scrub") go(frame);
  else drag.to = frame;
  state.dirty = true;
});
track.addEventListener("pointerup", () => {
  const drag = state.trackDrag;
  state.trackDrag = null;
  state.dirty = true;
  if (!drag) return;
  if (drag.kind === "event") {
    if (drag.to !== state.anim.events[drag.index].frame) {
      const events = eventsCopy();
      events[drag.index].frame = drag.to;
      state.selectedEvent = -1;
      edit(() => opFor(core.opEvents, events));
    } else {
      // a click on a flag, not a drag: it is opened in the Events tab
      state.tab = "events";
      go(drag.to);
      renderPane();
    }
  }
  if (drag.kind === "key" && drag.to !== drag.from) {
    // `edit` gives nothing back when the key cannot be moved: that is said in the line at the top
    const moved = edit(() => opFor(core.opMoveKey, state.bone, drag.from, drag.to));
    if (moved) moved.then(() => go(drag.to));
  }
});
track.addEventListener("dblclick", (event) => {
  const [x, y] = pointIn(track, event);
  if (y >= RULER_BOTTOM && y < EVENTS_BOTTOM) actions.evAdd(null, null, frameAtX(x));
});
