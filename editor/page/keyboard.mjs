// The editor's page: the keys of the keyboard (editor/README.md lists them for the person).

import { $, fail, state } from "/page/state.mjs";
import { actions } from "/page/actions.mjs";
import { keyRun } from "/page/adjust.mjs";

const toggleBox = (id) => {
  $(id).checked = !$(id).checked;
  state.dirty = true;
};
/** What a key does when no box is being typed in and neither Ctrl nor Alt is down. `shift`: Shift is. */
const plainKeys = (shift) => ({
  " ": actions.play,
  arrowleft: shift ? actions.prevKey : actions.prev,
  arrowright: shift ? actions.nextKey : actions.next,
  home: actions.first,
  end: actions.last,
  r: () => actions.mode("rotate"),
  g: () => actions.mode("move"),
  k: actions.key,
  delete: actions.unkey,
  escape: () => actions.bone(-1),
  1: () => actions.cam("first"),
  2: () => actions.cam("orbit"),
  b: () => toggleBox("showBones"),
  o: () => toggleBox("showOnion"),
  f: actions.both,
  v: actions.second,
});
/**
 * What a key does with Ctrl (or the Mac's command key) down, but for Ctrl+S, which also works while typing.
 */
const ctrlKeys = (shift) => ({
  z: shift ? actions.redo : actions.undo,
  y: actions.redo,
  c: actions.copy,
  v: shift ? actions.pasteMirror : actions.paste,
});
window.addEventListener("keydown", (event) => {
  if (!state.ready) return;
  const target = event.target;
  const typing =
    /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) && target.type !== "checkbox" && target.type !== "range";
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (ctrl && key === "s") {
    event.preventDefault();
    return void actions.save();
  }
  // a slider that has the keyboard is moved by these, as anywhere: they are not the timeline's then
  const sliding = target.type === "range" && /^(Arrow|Home$|End$|Page|Escape$)/.test(event.key);
  if (typing || sliding) {
    if (event.key === "Escape") target.blur();
    else if (sliding) keyRun();
    return;
  }
  const run = (action) => {
    event.preventDefault();
    Promise.resolve(action()).catch(fail);
  };
  if (ctrl) {
    const action = ctrlKeys(event.shiftKey)[key];
    if (action) run(action);
    return;
  }
  if (event.altKey) return;
  const action = plainKeys(event.shiftKey)[key];
  if (action) run(action);
});
