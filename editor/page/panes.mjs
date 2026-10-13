// The editor's page: what is written into it as HTML. The lists on the left (bodies, animations, skeleton),
// the tabs on the right (Pose, Animation, Events, Textures, Save), and smak's own picture beside the view.

import * as core from "/core.mjs";
import { $, DEG, esc, hexOf, state, view } from "/page/state.mjs";
import { texShown, texUrl } from "/page/server.mjs";
import { atFrame, bodyNumber, boneKeys, mixed, spreadFor } from "/page/model.mjs";
import { pairAdjust } from "/page/adjust.mjs";

const TABS = [
  ["pose", "Pose"],
  ["anim", "Animation"],
  ["events", "Events"],
  ["textures", "Textures"],
  ["save", "Save"],
];
/**
 * The `<select>`s that choose a bodypart's submodel: `kind` is "pick" for the first view, "pick2" for the
 * second.
 */
export const bodySelects = (kind, picks, hint) =>
  state.scene.bodyparts
    .map((bodypart, i) => {
      const options = bodypart.models
        .map((model, k) => {
          const selected = k === picks[i] ? " selected" : "";
          const empty = model.tris ? "" : " (empty)";
          return `<option value="${k}"${selected}>${esc(bodypart.name)} ${k * bodypart.base}: ${esc(model.name)}${empty}</option>`;
        })
        .join("");
      return `<select data-set="${kind}:${i}" title="${esc(bodypart.name)}: ${hint}">${options}</select>`;
    })
    .join("");

// ── the lists ──────────────────────────────────────────────────────────────
// the skeleton's list: pixels before a root's name, and more for each step down the tree
const TREE_PAD = 10;
const TREE_INDENT = 9;
// a bone with more keys than this has their count marked; with fewer it is only noted
const FEW_KEYS = 2;
/** ` disabled` for a button that has nothing to do, nothing otherwise. */
const disabledUnless = (usable) => (usable ? "" : " disabled");

export function renderBodies() {
  const skins = state.scene.skins;
  const skinSelect =
    skins.length > 1
      ? `<select data-set="skin" title="Skin">${skins.map((_, k) => `<option value="${k}">skin ${k}</option>`).join("")}</select>`
      : "";
  $("bodies").innerHTML =
    bodySelects("pick", state.picks, "which submodel is shown (its body number)") + skinSelect;
}
function renderAnims() {
  const row = (anim) => {
    const classes = `row${anim.n === state.animNumber ? " sel" : ""}${anim.outside ? " off" : ""}`;
    const action = anim.outside
      ? 'title="kept in another file: cannot be read"'
      : `data-act="anim:${anim.n}"`;
    const facts = `${anim.frames} at ${+anim.fps.toFixed(2)}${anim.loops ? " loop" : ""}`;
    const mark = anim.added
      ? ' <span class="mark">new</span>'
      : anim.edited
        ? ' <span class="mark">edited</span>'
        : "";
    return `<div class="${classes}" ${action}>${anim.n} <b>${esc(anim.name)}</b> <small>${facts}</small>${mark}</div>`;
  };
  $("anims").innerHTML = core.animList(state.project, state.ctx).map(row).join("");
}
export function renderTree() {
  const find = $("boneFilter").value.trim().toLowerCase();
  const row = (bone, i) => {
    if (find && !bone.name.toLowerCase().includes(find)) return "";
    const keys = state.anim.keys[bone.name];
    const count = keys ? Object.keys(keys).length : 0;
    const classes = `row${i === state.bone ? " sel" : ""}`;
    // a filtered list is flat: the bones between a match and its root are not shown
    const pad = TREE_PAD + (find ? 0 : state.depth[i] * TREE_INDENT);
    const mark =
      count > FEW_KEYS
        ? ` <span class="mark">${count >= state.anim.count ? "all" : count}</span>`
        : count
          ? " <small>" + count + "</small>"
          : "";
    return `<div class="${classes}" data-act="bone:${i}" style="padding-left:${pad}px" title="bone ${i}">${esc(bone.name)}${mark}</div>`;
  };
  $("tree").innerHTML = state.ctx.bones.map(row).join("");
  $("tree").querySelector(".sel")?.scrollIntoView({ block: "nearest" });
}

// ── the panes on the right ─────────────────────────────────────────────────
// how many of a bone's keys the Pose tab lists before "..."
const KEYS_LISTED = 40;
// how many lines of the project's log the Save tab shows, newest first
const LOG_SHOWN = 25;
// what "Thin the keys" keeps a bone within unless told: degrees of turn, units of place
export const THIN_DEGREES = 0.5;
export const THIN_UNITS = 0.02;
// the longest name the file holds for an animation, and the longest text for an event
const ANIM_NAME_MAX = 31;
const EVENT_TEXT_MAX = 63;
// a texture's flags, as the Textures tab names them
const TEXTURE_FLAGS = [
  [1, "flat"],
  [2, "chrome"],
  [4, "full bright"],
  [32, "additive (a glow)"],
  [64, "masked (index 255 is a hole)"],
];
export const NO_TINT = [255, 255, 255];

/** The three buttons that copy and paste a whole pose. `titles`: with the keys that do the same. */
function poseButtons(titles) {
  const pasteOff = disabledUnless(state.copiedPose);
  return [
    `<button data-act="copy"${titles ? ' title="Ctrl+C"' : ""}>Copy pose</button>`,
    `<button data-act="paste"${titles ? ' title="Ctrl+V"' : ""}${pasteOff}>Paste pose</button>`,
    `<button data-act="pasteMirror"${titles ? ' title="Left and right changed over (Ctrl+Shift+V)"' : ""}${pasteOff}>Paste mirrored</button>`,
  ].join("");
}
/** The Pose tab with no bone in hand: how to take one. */
function poseTabEmpty() {
  return `<h3>Pose</h3><p>Click a part of the model, a joint of the skeleton, or a name in the list on the left: that is the bone you pose.</p><p class="dim">Then drag a ring to turn it (or <kbd>G</kbd> and an arrow to move it). That sets a key for that bone at the frame the timeline is on.</p>
      <div class="btns">${poseButtons(false)}</div>`;
}
/** The Pose tab's line on the keys of the bone in hand. */
function keyNote(keys) {
  const count = keys.frames.length;
  const listed = `${keys.frames.slice(0, KEYS_LISTED).join(", ")}${count > KEYS_LISTED ? "..." : ""}`;
  const has = keys.touched
    ? keys.dense
      ? `A key on <b>every frame</b> (${count}).`
      : `<b>${count} keys</b>: ${listed}`
    : `As the file has it: a key on <b>every frame</b> (${count}).`;
  const advice = keys.dense
    ? ' <span class="dim">A change here is spread over the frames about it; to shape the motion by hand from a few keys, thin them.</span>'
    : "";
  return `<p id="keyNote">${has}${advice}</p>`;
}
function poseTab() {
  if (state.bone < 0) return poseTabEmpty();
  const bones = state.ctx.bones;
  const bone = bones[state.bone];
  const keys = boneKeys(state.bone);
  const keyHere = keys.frames.includes(atFrame());
  const otherSide = core.mirrorMap(bones)[state.bone];
  const mixes = mixed();
  const warning = mixes
    ? `<p class="err">This animation is ${mixes} that the game mixes (a player's aim up and down): it is not posed here. Its speed, looping and events can be changed; <i>Duplicate at the end</i> (Animation tab) gives a copy to pose.</p>`
    : "";
  const hangsOn = bone.parent >= 0 ? `on ${esc(bones[bone.parent].name)}` : "a root";
  const mirrored = otherSide !== state.bone ? `; other side: ${esc(bones[otherSide].name)}` : "";
  // the six values of a key: places 0 to 2, turns 3 to 5
  const boxes = (indices, step) =>
    indices.map((i) => `<td><input type="number" step="${step}" data-val="${i}"></td>`).join("");
  const spreadHint =
    "Carry the change, fading out, onto this bone's other keys this many frames either side. Empty: by itself (a bone with a key on every frame gets a sixth of the animation; a bone with few keys gets none). 0: this frame only.";
  const keyButtons = [
    `<button data-act="key" title="Fix the bone as it is now at this frame (K)">Key here</button>`,
    `<button data-act="unkey" title="Remove this frame's key: the bone is interpolated here (Delete)"${disabledUnless(keyHere && keys.frames.length > 1)}>Remove key</button>`,
    `<button data-act="thinBone" title="Keep the fewest keys that give this bone's motion back">Thin this bone</button>`,
    `<button data-act="revertBone"${disabledUnless(keys.touched)} title="Drop every key of this bone: it plays the original's frames again">Bone as original</button>`,
  ].join("");
  return `${warning}<h3>Bone ${state.bone}</h3><p><b>${esc(bone.name)}</b> <small>${hangsOn}${mirrored}</small></p>
      <div class="btns"><button data-act="mode:rotate" class="${state.mode === "rotate" ? "on" : ""}">Turn (R)</button><button data-act="mode:move" class="${state.mode === "move" ? "on" : ""}">Move (G)</button><button data-act="bone:-1">Let go (Esc)</button></div>
      <table><tr><th></th><th class="x">x</th><th class="y">y</th><th class="z">z</th></tr>
        <tr><td>turn, degrees</td>${boxes([3, 4, 5], "1")}</tr>
        <tr><td>place, units</td>${boxes([0, 1, 2], "0.1")}</tr></table>
      <p><label title="${spreadHint}">spread <input type="number" min="0" step="1" data-set="spread" value="${esc(state.spread)}" placeholder="auto ${spreadFor(state.bone)}"> frames</label></p>
      ${keyNote(keys)}
      <div class="btns">${keyButtons}</div>
      <h3>Whole pose</h3><div class="btns">${poseButtons(true)}</div>
      <p class="dim">Drag a ring: a turn about the bone's own axis of that colour. <kbd>Shift</kbd> steps by 5 degrees. The arrows move it along its parent's axes.</p>`;
}
function animTab() {
  const anim = state.anim;
  const source = state.ctx.seqs[anim.baseN];
  const keyed = Object.values(anim.keys).filter((keys) => Object.keys(keys).length);
  const total = keyed.reduce((sum, keys) => sum + Object.keys(keys).length, 0);
  const apart =
    anim.count === anim.base.length ? core.poseError(state.ctx.bones, anim.base, state.frames) : null;
  const origin = anim.added
    ? `new, begun as a copy of ${anim.baseN} ${esc(source.name)}`
    : `in the file: ${source.frames} frames at ${+source.fps.toFixed(2)}`;
  const seconds = (Math.max(1, anim.count - 1) / anim.fps).toFixed(2);
  const lengthWarning =
    anim.count !== source.frames && !anim.added
      ? `<p class="warn">The game may time things by this animation's length (${source.frames} frames in the file).</p>`
      : "";
  const keysLine = keyed.length
    ? `${keyed.length} of ${state.ctx.bones.length} bones have keys of their own, ${total} in all; the others play the original's frames.`
    : "Untouched: every bone plays the original's frames, which is a key on every frame.";
  const where = apart && apart.units > 1e-6 ? ` (frame ${apart.frame}, ${esc(apart.bone)})` : "";
  const apartLine = apart
    ? `Furthest from the original now: <b>${apart.units.toFixed(3)} units</b>, ${apart.degrees.toFixed(2)} degrees${where}.`
    : "Its length differs from the original's: no comparison.";
  const copyName = esc((anim.name + "_b").slice(0, ANIM_NAME_MAX));
  return `<h3>Animation ${anim.n}</h3><p><b>${esc(anim.name)}</b> <small>${origin}</small></p>
      <table><tr><td>frames</td><td><input type="number" id="aFrames" min="1" step="1" value="${anim.count}"> <button data-act="stretch" title="The whole animation, its keys and events, stretched or squeezed to this many frames">Stretch</button></td></tr>
        <tr><td>frames a second</td><td><input type="number" min="1" step="1" data-set="fps" value="${+anim.fps.toFixed(3)}"> <small>${seconds} s long</small></td></tr>
        <tr><td>looping</td><td><input type="checkbox" data-set="loops"${anim.loops ? " checked" : ""}></td></tr>
        <tr><td>between keys</td><td><select data-set="interp"><option value="smooth"${anim.smooth ? " selected" : ""}>a curve through them</option><option value="linear"${anim.smooth ? "" : " selected"}>straight</option></select></td></tr></table>
      ${lengthWarning}
      <h3>Keys</h3><p>${keysLine}</p>
      <p>${apartLine}</p>
      <p>Thin within <input type="number" id="thinRot" min="0" step="0.25" value="${THIN_DEGREES}"> degrees, <input type="number" id="thinPos" min="0" step="0.01" value="${THIN_UNITS}"> units</p>
      <div class="btns"><button data-act="thin" title="Every bone keeps the fewest keys that give its motion back within that">Thin the keys</button><button data-act="revertAnim"${disabledUnless(anim.entry && !anim.added)} title="Forget everything the project says of this animation">Animation as original</button></div>
      <p class="warn">${esc(state.thinNote)}</p>
      <h3>Duplicate</h3><p><input type="text" id="dupName" maxlength="${ANIM_NAME_MAX}" value="${copyName}"> <button data-act="dup" title="The same animation again under this name, after the last one: the others keep their numbers">Duplicate at the end</button></p>
      <p class="dim">Animations are never removed or moved: the game plays them by number.</p>`;
}
function eventsTab() {
  const anim = state.anim;
  const row = (event, i) =>
    [
      `<tr class="${i === state.selectedEvent ? "sel" : ""}">`,
      `<td><input type="number" min="0" max="${anim.count - 1}" step="1" value="${event.frame}" data-ev="${i}:frame"></td>`,
      `<td><input type="number" step="1" value="${event.event}" data-ev="${i}:event" style="width:58px"></td>`,
      `<td><input type="text" maxlength="${EVENT_TEXT_MAX}" value="${esc(event.options)}" data-ev="${i}:options"></td>`,
      `<td><button data-act="evGo:${i}" title="Go to its frame">go</button><button data-act="evDel:${i}" title="Remove it">x</button></td></tr>`,
    ].join("");
  return `<h3>Events of ${esc(anim.name)}</h3><p class="dim">What the animation sets off at a frame: a sound, a flash. The game's code knows them by number: 5004 plays the sound named in the text, on the client.</p>
      <table class="ev"><tr><th>frame</th><th>event</th><th>text</th><th></th></tr>${anim.events.map(row).join("")}</table>
      ${anim.events.length ? "" : "<p>None.</p>"}<div class="btns"><button data-act="evAdd">Add one at frame ${atFrame()}</button><button data-act="evRevert"${disabledUnless(anim.entry?.events && !anim.added)}>Events as original</button></div>
      <p class="dim">On the timeline: drag a flag to move it, double click the events row to add one.</p>`;
}
/** One adjustment of the Textures tab: a slider and, beside it, a box for the same number. */
function adjustRow(key, low, high, label, value) {
  return `<tr><td>${label}</td><td><input type="range" min="${low}" max="${high}" step="1" value="${value}" data-adj="${key}" title="Drag it, or click it and step with the arrow keys"> <input type="number" min="${low}" max="${high}" step="1" value="${value}" data-num="${key}" title="The same value, to type: ${low} to ${high}"></td></tr>`;
}
/**
 * The Textures tab's list of textures: those worn by what is shown first, each marked when the project
 * changes it.
 */
function textureSelect() {
  const textures = state.scene.textures;
  const order = [...textures.keys()].sort((a, b) => state.worn.has(b) - state.worn.has(a) || a - b);
  const option = (number) => {
    const entry = state.project.textures?.[number];
    const changed = entry?.file || Object.keys(entry?.adjust ?? {}).length ? " (changed)" : "";
    const selected = number === state.tex ? " selected" : "";
    return `<option value="${number}"${selected}>${state.worn.has(number) ? "* " : ""}${number} ${esc(textures[number].name)}${changed}</option>`;
  };
  return `<select data-set="tex" style="max-width:100%">${order.map(option).join("")}</select>`;
}
/**
 * The Textures tab's line on which colours the adjustments apply to, and the rows that belong to a selection.
 */
function selectionParts(select) {
  if (!select)
    return {
      heading: "Whole picture, through its palette",
      line: `<p id="selLine">All colours. <span class="dim">Click a pixel of the picture above to adjust only the colours like it.</span></p>`,
      rows: "",
      help: "",
    };
  const hex = hexOf(select.colour);
  const which = select.invert ? "Every colour <b>but</b> those like" : "Only the colours like";
  return {
    heading: "The chosen colours, through the palette",
    line: `<p id="selLine" data-pick="${select.colour.join()}"><span class="chip" style="background:${hex}"></span> ${which} <b>${hex}</b>. <label title="The colours left alone are dimmed in the picture above; the model is drawn as it is"><input type="checkbox" data-set="mask"${state.showMask ? " checked" : ""}> shown above</label></p>`,
    rows: `${adjustRow("tolerance", 0, 100, "how like", select.tolerance ?? 0)}<tr><td>inverse</td><td><label title="The adjustments apply to every colour but the chosen ones"><input type="checkbox" data-adj="invert"${select.invert ? " checked" : ""}> every colour but those</label></td></tr>`,
    help: " <i>How like</i>: 0 is that colour alone; about 20 takes in its lighter and darker shades; its hue counts for more than its brightness.",
  };
}
function texturesTab() {
  const number = state.tex;
  const texture = state.scene.textures[number];
  if (!texture) return "<h3>Textures</h3><p>This model has none inside it.</p>";
  const entry = state.project.textures?.[number] ?? {};
  const adjust = entry.adjust ?? {};
  const flags = TEXTURE_FLAGS.filter(([flag]) => texture.flags & flag)
    .map(([, name]) => name)
    .join(", ");
  const slider = (key, low, high, label) => adjustRow(key, low, high, label, adjust[key] ?? 0);
  const tintHex = hexOf(adjust.tint ?? NO_TINT);
  const selection = selectionParts(adjust.select);
  // the adjustments made, but for the choice of colours, in words
  const made = Object.entries(adjust)
    .filter(([key]) => key !== "select")
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
  const facts = `${texture.width}x${texture.height}${flags ? `, ${flags}` : ""}${state.worn.has(number) ? ", worn by what is shown" : ", not worn by what is shown"}${entry.file ? `; replaced by ${esc(entry.file)}` : ""}`;
  const onTop =
    entry.file && made
      ? `<p class="warn" id="onTop">The picture that replaced it has adjustments on top (${esc(made)}): the model wears it adjusted, and <i>Export PNG</i> gives it adjusted. Painted and dropped back, that export would be adjusted a second time: export it <i>without adjustments</i> to paint on, or take them off. <button data-act="texReset">No adjustments</button></p>`
      : "";
  const exportPlain = made
    ? `<a href="${texUrl(number, null, { as: "png", plain: 1 })}" download id="exportPlain"><button title="The picture before its adjustments: the one to paint on and drop back while the adjustments stand">PNG without adjustments</button></a>`
    : "";
  const exports = [
    `<a href="${texUrl(number, null, { as: "png" })}" download><button title="As the model wears it: with its adjustments">Export PNG</button></a>`,
    `<a href="${texUrl(number, null, { as: "bmp" })}" download><button title="8 bits with its palette, index for index">Export BMP</button></a>`,
    exportPlain,
    `<button data-act="texUnfile"${disabledUnless(entry.file)}>Original picture</button>`,
  ].join("");
  const sliders = [
    slider("brightness", -100, 100, "brightness"),
    slider("contrast", -100, 100, "contrast"),
    slider("saturation", -100, 100, "colour"),
    slider("hue", -180, 180, "hue"),
    slider("tintAmount", 0, 100, "tint"),
  ].join("");
  return `<h3>Texture</h3>${textureSelect()}
      <p><small>${facts}</small></p>
      <label><input type="checkbox" data-set="uv"${state.showUv ? " checked" : ""}> the triangles that wear it</label>
      <img id="texImg" class="pick" alt="" title="Click a colour of it: the adjustments below then apply only to the colours like that one" src="${texShown(null)}">
      <div id="drop">Drop a PNG or BMP here to replace it, or <input type="file" id="texFile" accept=".png,.bmp" style="width:190px"></div>
      ${onTop}
      <div class="btns">${exports}</div>
      <h3>${selection.heading}</h3>
      ${selection.line}
      <table>${selection.rows}${sliders}
        <tr><td>tint colour</td><td><input type="color" value="${tintHex}" data-adj="tint" style="padding:0;width:44px;height:22px"> <input type="text" value="${tintHex}" data-hex maxlength="7" spellcheck="false" title="The same colour as hex digits, to type: #rrggbb"></td></tr></table>
      <div class="btns"><button data-act="texReset"${disabledUnless(Object.keys(adjust).length)}>No adjustments</button><button data-act="selAll"${disabledUnless(adjust.select)} title="The adjustments apply to the whole picture again">All colours</button></div>
      <p class="dim">A replacement of any size is brought down to 256 colours; the model's corners follow its size. No painting here.${selection.help}</p>`;
}
function saveTab() {
  const saved = state.saved;
  const project = state.project;
  const log = [...(project.log ?? [])].reverse().slice(0, LOG_SHOWN);
  const items = (list, cls) => list.map((text) => `<li class="${cls}">${esc(text)}</li>`).join("");
  let report = "";
  if (saved) {
    const bad = saved.errors.length;
    const verdict = bad ? "Written, with errors: the game may not load it." : "Written and checked.";
    const lines = `${items(saved.errors, "err")}${items(saved.warnings, "warn")}${items(saved.notes, "warn")}${items(saved.facts, "dim")}`;
    report = `<p class="${bad ? "err" : "fine"}">${verdict} <small>${esc(saved.out)}, ${saved.bytes} bytes, checked for ${saved.engine}</small></p><ul>${lines}</ul>`;
  }
  const history = log.length
    ? `<ul>${log.map((line) => `<li><small>${line.rev} ${esc(line.by)}</small> ${esc(line.what)}</li>`).join("")}</ul>`
    : '<p class="dim">Nothing yet.</p>';
  return `<h3>Save</h3><p>The project is baked onto the <b>original</b> model every time and written beside the project. The original is never written over.</p>
      <table><tr><td>engine</td><td><select data-set="engine"><option value="xash"${project.engine !== "goldsrc" ? " selected" : ""}>Xash3D</option><option value="goldsrc"${project.engine === "goldsrc" ? " selected" : ""}>GoldSrc (Half-Life's own)</option></select></td></tr>
        <tr><td>file</td><td><input type="text" data-set="output" value="${esc(project.output)}" style="width:210px"></td></tr></table>
      <div class="btns"><button data-act="save" class="go">Save model (Ctrl+S)</button></div>
      ${report}
      <h3>Project</h3><p><small>${esc(state.scene.projectPath)}<br>revision ${project.rev}; source ${esc(project.source.path)}</small></p>
      <h3>Who did what</h3>${history}`;
}
const panes = { pose: poseTab, anim: animTab, events: eventsTab, textures: texturesTab, save: saveTab };

/**
 * The box of the texture's adjustments that has the keyboard, as a selector that finds it again after the
 * pane is drawn anew; null when no such box has it.
 */
function heldAdjustBox() {
  const active = document.activeElement;
  const data = active && $("pane").contains(active) ? active.dataset : {};
  if (data.adj) return `[data-adj="${data.adj}"]`;
  if (data.num) return `[data-num="${data.num}"]`;
  if (data.hex !== undefined) return "[data-hex]";
  return null;
}
export function renderPane() {
  $("tabs").innerHTML = TABS.map(
    ([key, name]) =>
      `<button data-act="tab:${key}" class="${key === state.tab ? "on" : ""}">${name}</button>`,
  ).join("");
  // a box of the texture's adjustments that has the keyboard keeps it through the redraw, and, while an edit
  // of it is still on its way to the server, its value
  const held = heldAdjustBox();
  const value = document.activeElement?.value;
  const scroll = $("right").scrollTop;
  $("pane").innerHTML = (panes[state.tab] ?? panes.pose)();
  $("right").scrollTop = scroll;
  state.shownFrame = -1;
  const again = held && $("pane").querySelector(held);
  if (again) {
    if ((state.busy || state.keying) && again.value !== value) {
      again.value = value;
      pairAdjust(again);
    }
    again.focus();
  }
}
export function renderAll() {
  renderAnims();
  renderTree();
  renderPane();
  $("undo").disabled = !state.undo.length;
  $("redo").disabled = !state.redo.length;
  $("undo").title = state.undo.length
    ? `Undo: ${state.undo[state.undo.length - 1].what} (Ctrl+Z)`
    : "Nothing to undo";
  $("camFirst").className = view.cam.mode === "first" ? "on" : "";
  $("camOrbit").className = view.cam.mode === "orbit" ? "on" : "";
  $("frame").max = state.anim.count - 1;
  $("of").textContent = `of ${state.anim.count - 1}`;
  state.dirty = true;
  compareSoon();
}
/** What changes with the frame alone: the numbers of the bone in hand, the frame's box, the play button. */
export function renderFrame() {
  const frame = atFrame();
  $("play").textContent = state.playing ? "Pause" : "Play";
  if (document.activeElement !== $("frame")) $("frame").value = frame;
  if (state.shownFrame === frame && !state.live) return;
  state.shownFrame = frame;
  if (state.tab === "pose" && state.bone >= 0) {
    const values = state.frames[frame][state.bone];
    for (const box of $("pane").querySelectorAll("[data-val]"))
      if (document.activeElement !== box) {
        const i = Number(box.dataset.val);
        box.value = i < 3 ? +values[i].toFixed(3) : +(values[i] / DEG).toFixed(2);
      }
  }
  if (state.tab === "events") {
    const addButton = $("pane").querySelector('[data-act="evAdd"]');
    if (addButton) addButton.textContent = `Add one at frame ${frame}`;
  }
}

// how long after the last change smak's picture is asked for again, in milliseconds
const COMPARE_DELAY_MS = 300;
// the size smak's picture is asked at before the view has been drawn once
const COMPARE_WIDTH = 640;
const COMPARE_HEIGHT = 480;
let compareTimer = 0;
/** The address of smak's picture of the frame shown, from the camera in use. */
function compareUrl() {
  const cam = view.cam;
  const first = cam.mode === "first";
  const orbit = first
    ? {}
    : { target: cam.target.map((v) => +v.toFixed(4)).join(), dist: +cam.dist.toFixed(4) };
  const params = {
    model: state.modelId,
    anim: state.animNumber,
    frame: atFrame(),
    body: bodyNumber(),
    skin: state.skin,
    view: first ? "first" : "orbit",
    w: Math.round(view.cssW ?? COMPARE_WIDTH),
    h: Math.round(view.cssH ?? COMPARE_HEIGHT),
    fov: view.camera().hfov,
    yaw: cam.yaw,
    pitch: cam.pitch,
    ...orbit,
    ...(view.both ? { both: 1 } : {}),
    v: state.project.rev,
  };
  return `/api/render?${new URLSearchParams(params)}`;
}
/**
 * smak's picture asked for again, a moment after the last thing that changes it: the frame, the body, the
 * project, the camera (where it stands, what it turns about, how near), the size of the view. From the camera
 * in use, whichever it is.
 */
export function compareSoon() {
  const shown = $("showCompare").checked;
  if ($("cmp").hidden === shown) {
    $("cmp").hidden = !shown;
    state.dirty = true;
  }
  if (!shown || !state.anim) return;
  clearTimeout(compareTimer);
  compareTimer = setTimeout(() => {
    state.cmpN++;
    $("cmpImg").src = compareUrl();
  }, COMPARE_DELAY_MS);
}
