// The editor's page: the Textures tab at work. A texture's adjustments (brightness, contrast, colour, hue,
// tint, and the colours they apply to) read from the tab's boxes, tried, and written to the project; a
// picture dropped on it.

import { $, fail, hexOf, state, status } from "/page/state.mjs";
import { api, texShown } from "/page/server.mjs";
import { refreshTextures } from "/page/model.mjs";
import { afterProject, commit, textureName } from "/page/edits.mjs";
import { NO_TINT, renderPane } from "/page/panes.mjs";

// Tried as the slider moves or a value is typed, written when it is let go or the box is left.

// how long after the last movement of a slider the trial picture is asked for, in milliseconds
const TRIAL_DELAY_MS = 120;
// how long the keys have to be still before a slider stepped with them is written, in milliseconds
const KEY_RUN_MS = 600;
// how like the clicked colour a colour has to be, when a selection is first made (see core.colourGap)
const DEFAULT_TOLERANCE = 20;
// a click on the very edge of the picture still names a pixel inside it
const LAST_PIXEL = 0.999999;

/**
 * The adjustments as the Textures tab's boxes have them now: what `textures[n].adjust` of the project would
 * be.
 */
export function adjustNow() {
  const adjust = {};
  const pane = $("pane");
  const pick = pane.querySelector("[data-pick]");
  for (const box of pane.querySelectorAll("[data-adj]")) {
    const key = box.dataset.adj;
    if (key === "tolerance" || key === "invert") continue;
    if (box.type === "color") {
      // "#rrggbb" to [r, g, b]; white is no tint
      const tint = [1, 3, 5].map((at) => parseInt(box.value.slice(at, at + 2), 16));
      if (tint.some((v) => v !== 255)) adjust.tint = tint;
    } else if (Number(box.value)) adjust[key] = Number(box.value);
  }
  // the colours they apply to, when not all: the one chosen, how like it, and whether it is the others that
  // are meant
  if (pick)
    adjust.select = {
      colour: pick.dataset.pick.split(",").map(Number),
      tolerance: Number(pane.querySelector('[data-adj="tolerance"]').value),
      ...(pane.querySelector('[data-adj="invert"]').checked ? { invert: true } : {}),
    };
  return adjust;
}
/** Adjustments in words, for the line at the top and the project's log. */
const adjustSay = (adjust) =>
  Object.entries(adjust)
    .map(([key, value]) =>
      key === "select"
        ? `${value.invert ? "all but" : "only"} the colours within ${value.tolerance} of ${value.colour.join(",")}`
        : `${key} ${value}`,
    )
    .join(", ");
/**
 * The two boxes of one adjustment made alike from the one just changed: a slider and its number, the colour
 * and its hex digits. False while what is typed is not a value.
 */
export function pairAdjust(box) {
  const pane = $("pane");
  const data = box.dataset;
  if (data.num) {
    // a number typed: its slider follows, rounded and kept within its range
    const slider = pane.querySelector(`[data-adj="${data.num}"]`);
    const typed = Number(box.value);
    if (!slider || box.value.trim() === "" || isNaN(typed)) return false;
    slider.value = Math.max(Number(slider.min), Math.min(Number(slider.max), Math.round(typed)));
  } else if (data.hex !== undefined) {
    // hex digits typed (three or six, with or without #): the colour box follows
    const digits = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(box.value.trim());
    const colourBox = pane.querySelector('[data-adj="tint"]');
    if (!digits || !colourBox) return false;
    const six = digits[1].length === 3 ? digits[1].replace(/./g, "$&$&") : digits[1];
    colourBox.value = "#" + six.toLowerCase();
  } else if (box.type === "color") {
    const hexBox = pane.querySelector("[data-hex]");
    if (hexBox) hexBox.value = box.value;
  } else {
    const numberBox = pane.querySelector(`[data-num="${data.adj}"]`);
    if (numberBox) numberBox.value = box.value;
  }
  return true;
}
let trialTimer = 0;
// the adjustments on their way to the server, as writeAdjust's key; null when none are
let adjustSent = null;
document.addEventListener("input", (event) => {
  const data = event.target.dataset ?? {};
  if (!data.adj && !data.num && data.hex === undefined) return;
  if (!pairAdjust(event.target)) return;
  const adjust = adjustNow();
  clearTimeout(trialTimer);
  trialTimer = setTimeout(() => {
    refreshTextures({ number: state.tex, adjust });
    const picture = $("texImg");
    if (picture && !state.showUv) picture.src = texShown(adjust, { t: Date.now() });
  }, TRIAL_DELAY_MS);
});
/** The adjustments written as the boxes have them. `box`: the one just changed, if one was. */
export function commitAdjust(box) {
  // a typed value is taken as the slider or the colour box took it (rounded, kept within its range); what is
  // not a value is put back
  if (box && box.dataset.hex !== undefined && !pairAdjust(box)) {
    // hex digits that cannot be read: nothing is written and the tint is the project's again (the colour box
    // may have followed a shorter reading on the way, #c08 of #c0804), and the line at the top says so and
    // stays
    const text = box.value;
    const back = hexOf(state.project.textures?.[state.tex]?.adjust?.tint ?? NO_TINT);
    clearTimeout(trialTimer);
    renderPane();
    refreshTextures();
    status(`"${text}" is not a colour (six hex digits, as #c08040): the tint stays ${back}`, true);
    return null;
  }
  if (box && !pairAdjust(box))
    status(
      `${box.value || "nothing"} is not ${box.dataset.num ? "a number" : "a colour: six hex digits, as #c08040"}`,
      true,
    );
  if (box?.dataset.num)
    box.value = $("pane").querySelector(`[data-adj="${box.dataset.num}"]`)?.value ?? box.value;
  else if (box && box.dataset.hex !== undefined)
    box.value = $("pane").querySelector('[data-adj="tint"]')?.value ?? box.value;
  return writeAdjust(adjustNow());
}
/**
 * A texture's adjustments written to the project, unless it says the same already. A new choice of colours is
 * answered with how much of the picture it takes.
 */
export function writeAdjust(adjust) {
  const number = state.tex;
  const name = textureName();
  const keyOf = (adjustments) => JSON.stringify([number, Object.entries(adjustments ?? {}).sort()]);
  const key = keyOf(adjust);
  const was = state.project.textures?.[number]?.adjust;
  // what the project says already, or is being told: one change is one line of its log
  if (key === (adjustSent ?? keyOf(was))) return null;
  adjustSent = key;
  const chosen = adjust.select && JSON.stringify(adjust.select) !== JSON.stringify(was?.select ?? null);
  return commit({
    what: `texture ${name} adjusted: ${adjustSay(adjust) || "back to none"}`,
    set: [
      { path: ["textures", number, "name"], value: name },
      { path: ["textures", number, "adjust"], value: Object.keys(adjust).length ? adjust : null },
    ],
  })
    .then(() => (chosen ? selectionSay() : null))
    .finally(() => {
      if (adjustSent === key) adjustSent = null;
    });
}
/** The line at the top says how much of the picture the project's selection takes. */
async function selectionSay() {
  const taken = await api("pixel", { model: state.modelId, i: state.tex, u: 0, v: 0 });
  const select = state.project.textures?.[state.tex]?.adjust?.select;
  if (!select) return;
  const which = select.invert ? "every colour but those" : "the colours";
  const share = ((100 * taken.pixels) / taken.of).toFixed(1);
  status(
    `texture ${textureName()}: the adjustments apply to ${which} within ${select.tolerance} of ${hexOf(select.colour)}: ${taken.taken} of the ${taken.used} colours the picture uses, ${share}% of its pixels`,
  );
}
/**
 * A colour chosen by a click on the texture's picture (`u`, `v`: where, 0 to 1): the adjustments apply to the
 * colours like it. Read from the picture before its adjustments.
 */
async function pickColour(u, v) {
  const pixel = await api("pixel", { model: state.modelId, i: state.tex, u, v });
  if (pixel.hole) return status("that pixel is a hole of a masked texture: it has no colour to choose", true);
  const adjust = adjustNow();
  const was = adjust.select;
  adjust.select = {
    colour: pixel.colour,
    tolerance: was?.tolerance ?? DEFAULT_TOLERANCE,
    ...(was?.invert ? { invert: true } : {}),
  };
  return writeAdjust(adjust) ?? status(`the colours like ${hexOf(pixel.colour)} are the ones chosen already`);
}
$("pane").addEventListener("click", (event) => {
  if (event.target.id !== "texImg" || !state.scene) return;
  const box = event.target.getBoundingClientRect();
  pickColour(
    Math.min(LAST_PIXEL, Math.max(0, (event.clientX - box.left) / box.width)),
    Math.min(LAST_PIXEL, Math.max(0, (event.clientY - box.top) / box.height)),
  ).catch(fail);
});
// A run of key presses on one slider is one change: the browser reports a change at every press, and each
// would be a revision and a line of the log. The picture follows every press (the trial above); the project
// is written when the keys have been still for a moment, or the slider is left.
let keyRunTimer = 0;
const keysDone = () => {
  if (!state.keying) return null;
  clearTimeout(keyRunTimer);
  state.keying = false;
  return commitAdjust();
};
export const keyRun = () => {
  state.keying = true;
  clearTimeout(keyRunTimer);
  keyRunTimer = setTimeout(keysDone, KEY_RUN_MS);
};
document.addEventListener("focusout", (event) => {
  if (event.target.type === "range") keysDone();
});
/**
 * A picture dropped or chosen for the texture in the tab: sent to the server, which keeps it beside the
 * project.
 */
export async function upload(file) {
  try {
    state.busy++;
    const params = { model: state.modelId, i: state.tex, name: file.name };
    const answer = await api("upload", params, await file.arrayBuffer());
    state.undo.push({ what: `texture replaced from ${file.name}`, set: answer.inverse });
    state.redo = [];
    state.project = answer.project;
    const adjust = answer.project.textures?.[state.tex]?.adjust ?? {};
    const onTop = adjustSay(Object.fromEntries(Object.entries(adjust).filter(([key]) => key !== "select")));
    const warning = onTop
      ? `; its adjustments still apply on top of the new picture (${onTop}): "No adjustments" takes them off`
      : "";
    status(`texture ${textureName()} replaced from ${file.name}${warning}`, Boolean(onTop));
  } catch (error) {
    fail(error);
  } finally {
    state.busy--;
  }
  await afterProject();
}
$("right").addEventListener("dragover", (event) => {
  if (state.tab === "textures") {
    event.preventDefault();
    $("drop")?.classList.add("over");
  }
});
$("right").addEventListener("dragleave", () => $("drop")?.classList.remove("over"));
$("right").addEventListener("drop", (event) => {
  if (state.tab !== "textures") return;
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) upload(file);
});
