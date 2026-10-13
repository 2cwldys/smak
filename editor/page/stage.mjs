// The editor's page: the layer over the 3D picture. The skeleton and the handles of the bone in hand drawn on
// it, and the mouse: a handle dragged poses the bone, a drag elsewhere moves the camera, a click takes a
// bone.

import * as core from "/core.mjs";
import {
  $,
  clearCanvas,
  DEG,
  dot,
  over,
  overlayContext,
  pointIn,
  state,
  status,
  sub,
  view,
} from "/page/state.mjs";
import { atFrame, frameOrbit, mixed, mixedSay, recompute, spreadFor, valuesNow } from "/page/model.mjs";
import { commit, opFor, tryOp } from "/page/edits.mjs";
import { compareSoon } from "/page/panes.mjs";
import { actions } from "/page/actions.mjs";

// the handles' colours: x red, y green, z blue
const AXIS_COLOURS = ["#ff6b6b", "#6bd96b", "#6b9cff"];
const AXIS_NAMES = "xyz";
// a root bone is moved along the model's own axes
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
// the handles: their radius on the screen in pixels, and how many straight pieces a ring is drawn in
const GIZMO_RADIUS_PX = 62;
const RING_SEGMENTS = 48;
// how near the mouse has to be, in pixels, to take a handle; to take a joint with a click
const HANDLE_REACH_PX = 9;
const JOINT_REACH_PX = 11;
// a press that moves further than this, in pixels, is a drag of the camera and not a click
const CLICK_SLACK_PX = 4;
// the orbit camera: degrees a pixel of drag, how steeply it may look, how fast the wheel zooms, how near and
// far
const ORBIT_DEGREES_PER_PX = 0.4;
const PITCH_LIMIT = 89;
const ZOOM_PER_WHEEL_UNIT = 0.0012;
const NEAREST_DIST = 2;
const FARTHEST_DIST = 4000;
// with Shift a turn goes in steps of 5 degrees and a move in quarters of a unit
const TURN_STEP_DEGREES = 5;
const MOVE_STEPS_PER_UNIT = 4;
// the 4:3 frame of the game's screen is marked when the view is wider than that by more than this
const FRAME_SLACK = 0.01;

/**
 * The handles about the bone in hand, as they are on the screen now: { centre (in the model's space), sc (the
 * same on the screen), radius (units), axes (three unit vectors), parts (for each axis the points of its
 * ring, or the tail and tip of its arrow) }. A turn is about the bone's own axes, a move along its parent's.
 */
function gizmoOf() {
  if (state.bone < 0) return null;
  const matrix = state.world[state.bone];
  const centre = [matrix[3], matrix[7], matrix[11]];
  const sc = view.project(centre);
  if (!sc) return null;
  const radius = GIZMO_RADIUS_PX * view.unitsPerPixel(centre);
  const bone = state.ctx.bones[state.bone];
  const frame = state.mode === "rotate" ? matrix : bone.parent >= 0 ? state.world[bone.parent] : IDENTITY;
  // the frame's three columns
  const axes = [0, 1, 2].map((k) => [frame[k], frame[4 + k], frame[8 + k]]);
  const parts = axes.map((axis, k) => {
    if (state.mode !== "rotate") {
      const tip = view.project(centre.map((v, j) => v + radius * axis[j]));
      return tip ? [sc, tip] : [];
    }
    // a ring about this axis lies in the plane of the other two
    const u = axes[(k + 1) % 3];
    const v = axes[(k + 2) % 3];
    const points = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * 2 * Math.PI;
      const onRing = centre.map((c, j) => c + radius * (Math.cos(angle) * u[j] + Math.sin(angle) * v[j]));
      const point = view.project(onRing);
      if (point) points.push(point);
    }
    return points;
  });
  return { centre, sc, radius, axes, parts };
}
/** How far a point is from the stretch between two others, on the screen. */
function distToSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared
    ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - a[0] - dx * along, point[1] - a[1] - dy * along);
}
/** The handle under a point of the screen: its axis (0, 1, 2), or -1. */
function gizmoHit(x, y) {
  let nearest = HANDLE_REACH_PX;
  let axis = -1;
  state.giz?.parts.forEach((points, k) => {
    for (let i = 0; i + 1 < points.length; i++) {
      const dist = distToSegment([x, y], points[i], points[i + 1]);
      if (dist < nearest) {
        nearest = dist;
        axis = k;
      }
    }
  });
  return axis;
}
/** The game's 4:3 screen marked in a first-person view that is wider. */
function drawGameFrame(ctx, width, height) {
  if (!(view.cam.mode === "first" && width / height > 4 / 3 + FRAME_SLACK)) return;
  const frameWidth = (height * 4) / 3;
  const left = (width - frameWidth) / 2;
  ctx.strokeStyle = "#ffffff30";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.strokeRect(left, -1, frameWidth, height + 2);
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff50";
  ctx.font = "11px system-ui";
  ctx.fillText("4:3", left + 4, height - 6);
}
/**
 * The skeleton: a line from each joint to its parent's and a dot on each, the bone in hand white, keyed bones
 * gold.
 */
function drawSkeleton(ctx) {
  const bones = state.ctx.bones;
  const keyed = bones.map((bone) => {
    const keys = state.anim.keys[bone.name];
    return Boolean(keys && Object.keys(keys).length);
  });
  ctx.lineWidth = 1.5;
  bones.forEach((bone, i) => {
    const joint = state.joints[i];
    const parent = bone.parent >= 0 ? state.joints[bone.parent] : null;
    if (!joint || !parent) return;
    ctx.strokeStyle = i === state.bone ? "#ffffff" : keyed[i] ? "#e2c47acc" : "#c8d2e080";
    ctx.beginPath();
    ctx.moveTo(parent[0], parent[1]);
    ctx.lineTo(joint[0], joint[1]);
    ctx.stroke();
  });
  state.joints.forEach((joint, i) => {
    if (!joint) return;
    ctx.fillStyle = i === state.bone ? "#ffffff" : keyed[i] ? "#e2c47a" : "#c8d2e0b0";
    ctx.beginPath();
    ctx.arc(joint[0], joint[1], i === state.bone ? 4.5 : 2.6, 0, 7);
    ctx.fill();
  });
}
/** The handles of the bone in hand (the one dragged or under the mouse thicker), and its name beside them. */
function drawGizmo(ctx, gizmo) {
  gizmo.parts.forEach((points, k) => {
    if (points.length < 2) return;
    const hot = state.drag?.axis === k || (!state.drag && state.hoverAxis === k);
    ctx.strokeStyle = AXIS_COLOURS[k];
    ctx.lineWidth = hot ? 5 : 2.5;
    ctx.globalAlpha = state.drag && !hot ? 0.25 : 1;
    ctx.beginPath();
    points.forEach((point, i) => (i ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])));
    ctx.stroke();
    if (state.mode !== "rotate") {
      const tip = points[1];
      ctx.fillStyle = AXIS_COLOURS[k];
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], hot ? 7 : 5, 0, 7);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  const [x, y] = gizmo.sc;
  const name = state.ctx.bones[state.bone].name;
  ctx.font = "12px system-ui";
  const nameWidth = ctx.measureText(name).width;
  ctx.fillStyle = "#000a";
  ctx.fillRect(x + 10, y - 22, nameWidth + 10, 17);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, x + 15, y - 9);
}
/**
 * Everything drawn over the 3D picture. It also notes where the joints and the handles are, for the mouse.
 */
export function drawOverlay() {
  const ctx = overlayContext;
  const { width, height } = clearCanvas(over, ctx);
  ctx.lineCap = "round";
  drawGameFrame(ctx, width, height);
  state.joints = state.world.map((matrix) => view.project([matrix[3], matrix[7], matrix[11]]));
  if ($("showBones").checked) drawSkeleton(ctx);
  state.giz = gizmoOf();
  if (state.giz) drawGizmo(ctx, state.giz);
}

/** A handle taken: what the drag needs to know of where it began. */
function beginBoneDrag(axis, x, y) {
  state.playing = false;
  state.frame = atFrame();
  const startValues = valuesNow();
  const gizmo = state.giz;
  // an axis that points at the eye turns the other way round on the screen
  const toward = dot(gizmo.axes[axis], sub(view.basis.eye, gizmo.centre)) > 0;
  const unitTip =
    state.mode === "rotate" ? null : view.project(gizmo.centre.map((c, j) => c + gizmo.axes[axis][j]));
  state.drag = {
    kind: state.mode,
    axis,
    startValues,
    startTurn: core.qOf(startValues[3], startValues[4], startValues[5]),
    toward,
    lastAngle: Math.atan2(y - gizmo.sc[1], x - gizmo.sc[0]),
    turned: 0,
    x,
    y,
    // a move: what one unit along the axis is on the screen, in pixels
    unitOnScreen: unitTip ? [unitTip[0] - gizmo.sc[0], unitTip[1] - gizmo.sc[1]] : null,
    spread: spreadFor(state.bone),
  };
}
over.addEventListener("contextmenu", (event) => event.preventDefault());
over.addEventListener("pointerdown", (event) => {
  if (!state.ready) return;
  over.setPointerCapture(event.pointerId);
  const [x, y] = pointIn(over, event);
  const axis = event.button === 0 ? gizmoHit(x, y) : -1;
  if (axis >= 0 && mixed()) {
    mixedSay();
    state.drag = null;
    return;
  }
  if (axis >= 0) beginBoneDrag(axis, x, y);
  else
    state.drag = {
      kind: "cam",
      x,
      y,
      lastX: x,
      lastY: y,
      moved: false,
      pan: event.button !== 0 || event.shiftKey,
    };
});
/** The camera turned, or slid, by a drag that has come to x, y. */
function dragCamera(drag, x, y) {
  if (Math.hypot(x - drag.x, y - drag.y) > CLICK_SLACK_PX) drag.moved = true;
  if (drag.moved && view.cam.mode === "orbit") {
    const cam = view.cam;
    const dx = x - drag.lastX;
    const dy = y - drag.lastY;
    if (drag.pan) {
      const basis = view.basis;
      const units = view.unitsPerPixel(cam.target);
      cam.target = cam.target.map((v, k) => v - basis.right[k] * dx * units + basis.up[k] * dy * units);
    } else {
      cam.yaw -= dx * ORBIT_DEGREES_PER_PX;
      cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dy * ORBIT_DEGREES_PER_PX));
    }
    state.dirty = true;
  }
  drag.lastX = x;
  drag.lastY = y;
}
/**
 * The bone's six values with a ring dragged to x, y: turned about its own axis by the angle gone round the
 * centre.
 */
function turnedValues(drag, x, y, inSteps) {
  const angle = Math.atan2(y - state.giz.sc[1], x - state.giz.sc[0]);
  // the step since the last move, the short way round, so that a drag past half a turn goes on counting
  let step = angle - drag.lastAngle;
  step -= 2 * Math.PI * Math.round(step / (2 * Math.PI));
  drag.turned += step;
  drag.lastAngle = angle;
  let turn = drag.toward ? -drag.turned : drag.turned;
  if (inSteps) turn = Math.round(turn / (TURN_STEP_DEGREES * DEG)) * TURN_STEP_DEGREES * DEG;
  const axis = [0, 0, 0];
  axis[drag.axis] = 1;
  drag.note = `${(turn / DEG).toFixed(1)} degrees about ${AXIS_NAMES[drag.axis]}`;
  const [px, py, pz] = drag.startValues;
  return [px, py, pz, ...core.eulerOfQ(core.qMul(drag.startTurn, core.qAxis(axis, turn)))];
}
/**
 * The bone's six values with an arrow dragged to x, y: moved along its axis as far as the mouse went along
 * it.
 */
function movedValues(drag, x, y, inSteps) {
  const [ux, uy] = drag.unitOnScreen;
  let units = ((x - drag.x) * ux + (y - drag.y) * uy) / Math.max(1e-6, ux ** 2 + uy ** 2);
  if (inSteps) units = Math.round(units * MOVE_STEPS_PER_UNIT) / MOVE_STEPS_PER_UNIT;
  const values = drag.startValues.slice();
  values[drag.axis] += units;
  drag.note = `${units.toFixed(2)} units along ${AXIS_NAMES[drag.axis]}`;
  return values;
}
over.addEventListener("pointermove", (event) => {
  const [x, y] = pointIn(over, event);
  const drag = state.drag;
  if (!drag) {
    const axis = gizmoHit(x, y);
    if (axis !== state.hoverAxis) {
      state.hoverAxis = axis;
      state.dirty = true;
    }
    over.style.cursor = axis >= 0 ? "grab" : "default";
    return;
  }
  if (drag.kind === "cam") return dragCamera(drag, x, y);
  const values =
    drag.kind === "rotate"
      ? turnedValues(drag, x, y, event.shiftKey)
      : movedValues(drag, x, y, event.shiftKey);
  // the pose is shown as it would be; it is written when the mouse is let go
  const op = tryOp(() => opFor(core.opKey, state.bone, state.frame, values, drag.spread));
  if (!op) return;
  state.pendingOp = op;
  state.live = core.applyPatch(state.project, op.set).project;
  recompute();
  const spreadNote = drag.spread ? `, spread over ${drag.spread} frames either side` : "";
  status(`${state.ctx.bones[state.bone].name}: ${drag.note}${spreadNote}`);
});
/**
 * The bone a click at x, y means: the nearest joint of the skeleton when it is shown, else the model's part
 * there.
 */
function boneAt(x, y) {
  let nearest = JOINT_REACH_PX;
  let bone = -1;
  if ($("showBones").checked)
    state.joints.forEach((joint, i) => {
      if (!joint) return;
      const dist = Math.hypot(joint[0] - x, joint[1] - y);
      if (dist < nearest) {
        nearest = dist;
        bone = i;
      }
    });
  return bone < 0 ? view.pick(x, y) : bone;
}
over.addEventListener("pointerup", (event) => {
  const drag = state.drag;
  state.drag = null;
  state.dirty = true;
  if (!drag) return;
  if (drag.kind !== "cam") {
    if (state.pendingOp) commit(state.pendingOp);
    return;
  }
  // the camera was turned or slid: smak's picture follows when the drag ends
  if (drag.moved) compareSoon();
  if (drag.moved || event.button !== 0) return;
  const [x, y] = pointIn(over, event);
  actions.bone(boneAt(x, y));
});
over.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (view.cam.mode === "orbit") {
      const dist = view.cam.dist * Math.exp(event.deltaY * ZOOM_PER_WHEEL_UNIT);
      view.cam.dist = Math.max(NEAREST_DIST, Math.min(FARTHEST_DIST, dist));
      state.dirty = true;
      compareSoon();
    }
  },
  { passive: false },
);
// A double click on the model (Orbit): the camera turns and zooms about that point from then on, so a close
// look at a chest or a helmet's face needs no sliding after the zoom. Beside the model: about its middle
// again, at the distance it opened with.
over.addEventListener("dblclick", (event) => {
  if (!state.ready) return;
  if (view.cam.mode !== "orbit")
    return status(
      "the first person camera is the game's own and stays where it is: Orbit (2) turns about a point",
    );
  const point = view.hit(...pointIn(over, event)).point;
  if (point) {
    view.cam.target = point;
    status(
      `the camera turns about the point under the mouse now (${point.map((v) => +v.toFixed(1)).join(", ")}); a double click beside the model: about its middle again`,
    );
  } else {
    frameOrbit();
    status("the camera turns about the model's middle again, at the distance it opened with");
  }
  state.dirty = true;
  compareSoon();
});
