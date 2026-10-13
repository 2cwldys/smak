// The editor's page: an edit made. Every one is a patch (core.mjs) sent to the server, which makes it on the
// project file and answers with the project as it now is and the patch that takes the edit back: that is the
// undo.

import * as core from "/core.mjs";
import { fail, state, status } from "/page/state.mjs";
import { api } from "/page/server.mjs";
import { atFrame, ensureBase, recompute, refreshTextures, spreadFor } from "/page/model.mjs";
import { renderAll } from "/page/panes.mjs";

async function send(patch) {
  state.busy++;
  try {
    return await api("patch", { model: state.modelId }, { set: patch.set, what: patch.what, by: "person" });
  } finally {
    state.busy--;
  }
}
/** An edit made: sent to the server, kept for undoing. */
export async function commit(op) {
  if (!op?.set?.length) {
    status(op?.what ?? "nothing to change");
    return;
  }
  try {
    const answer = await send(op);
    state.undo.push({ what: op.what, set: answer.inverse });
    state.redo = [];
    state.project = answer.project;
    status(op.what);
  } catch (error) {
    fail(error);
  }
  await afterProject();
}
/** The last edit of one pile (undo or redo) taken back, and put on the other. `word`: "undo" or "redo". */
export async function unredo(from, to, word) {
  const step = from.pop();
  if (!step) return;
  try {
    const answer = await send({ set: step.set, what: `${word}: ${step.what}` });
    to.push({ what: step.what, set: answer.inverse });
    state.project = answer.project;
    status(`${word}: ${step.what}`);
  } catch (error) {
    fail(error);
  }
  await afterProject();
}
/** The project has changed (by an edit here, or from outside): everything that shows it is made again. */
export async function afterProject() {
  state.live = null;
  state.pendingOp = null;
  const anims = core.animList(state.project, state.ctx);
  if (!anims.some((anim) => anim.n === state.animNumber)) state.animNumber = anims[0].n;
  await ensureBase(state.animNumber);
  recompute();
  refreshTextures();
  renderAll();
}
/** What `make` returns, or null with its error said in the line at the top. */
export const tryOp = (make) => {
  try {
    return make();
  } catch (error) {
    fail(error);
    return null;
  }
};
export const edit = (make) => {
  const op = tryOp(make);
  return op ? commit(op) : null;
};
export function setKey(values) {
  state.playing = false;
  state.frame = atFrame();
  return edit(() =>
    core.opKey(
      state.project,
      state.ctx,
      state.animNumber,
      state.bone,
      state.frame,
      values,
      spreadFor(state.bone),
    ),
  );
}

/** A copy of the animation's events, to change and hand to core.opEvents. */
export const eventsCopy = () => state.anim.events.map((event) => ({ ...event }));
/**
 * core's `op...` for the animation in hand: opFor(core.opKey, bone, frame, ...) is core.opKey(project, ctx,
 * n, ...).
 */
export const opFor = (make, ...rest) => make(state.project, state.ctx, state.animNumber, ...rest);
export const textureName = () => state.scene.textures[state.tex].name;
