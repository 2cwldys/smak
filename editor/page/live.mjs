// The editor's page: taking up what somebody else did. Once a second the server is asked what changed: the
// project (an agent's edit from a terminal), the model's file (a script wrote it anew), the folder of models.

import * as core from "/core.mjs";
import { $, esc, query, state, status, view } from "/page/state.mjs";
import { api } from "/page/server.mjs";
import { loadGeometry, loadSecond, openModel, recompute, selectAnim } from "/page/model.mjs";
import { afterProject } from "/page/edits.mjs";
import { renderAll, renderBodies } from "/page/panes.mjs";

// how often the server is asked whether anything changed, in milliseconds
const POLL_MS = 1000;
// how long the mark at the top right says what changed before it goes back to "live", in milliseconds
const NEWS_SHOWN_MS = 4000;

const clock = () => new Date().toLocaleTimeString();
/**
 * The mark at the top right: "" (live), "new" (something was taken up: `what`), or "off" (the server is
 * away).
 */
function showLive(mark, what) {
  const el = $("live");
  el.className = mark;
  el.textContent = mark === "off" ? "server away" : (what ?? "live");
  if (mark === "new")
    setTimeout(() => {
      if (el.className === "new") {
        el.className = "";
        el.textContent = `live, last change ${what.replace(/^.* at /, "")}`;
      }
    }, NEWS_SHOWN_MS);
}
/**
 * The list of models asked for and put in the select at the top left; the ones with a project are starred.
 */
export async function fillModels() {
  const answer = await api("models");
  state.folder = answer.folder;
  state.firstModel = answer.first;
  $("model").innerHTML = answer.models
    .map((model) => `<option value="${esc(model.id)}">${esc(model.id)}${model.project ? " *" : ""}</option>`)
    .join("");
  if (state.modelId) $("model").value = state.modelId;
  return answer.models;
}
/**
 * The model to open first of a list: the one the address names, else the one the server was started on, else
 * the first.
 */
export function firstChoice(models, alsoStartedOn) {
  const has = (id) => models.some((model) => model.id === id);
  if (has(query.get("model"))) return query.get("model");
  if (alsoStartedOn && has(state.firstModel)) return state.firstModel;
  return models[0].id;
}
/** Whether picks kept from before still name submodels the model has. */
const picksFit = (picks, now) =>
  picks.length === now.length && picks.every((pick, i) => pick < state.scene.bodyparts[i].models.length);
/**
 * The model read again from its file, changed under the page (a script wrote it anew): the place in it kept,
 * and the undo.
 */
async function reopen() {
  const kept = {
    animNumber: state.animNumber,
    frame: state.frame,
    bone: state.bone >= 0 ? state.ctx.bones[state.bone].name : null,
    picks: state.picks.slice(),
    picks2: state.picks2.slice(),
    cam: { ...view.cam, target: [...view.cam.target] },
    undo: state.undo,
    redo: state.redo,
    tex: state.tex,
  };
  await openModel(state.modelId);
  if (picksFit(kept.picks, state.picks)) {
    state.picks = kept.picks;
    renderBodies();
    await loadGeometry();
  }
  if (picksFit(kept.picks2, state.picks2)) {
    state.picks2 = kept.picks2;
    await loadSecond();
  }
  if (core.animList(state.project, state.ctx).some((anim) => anim.n === kept.animNumber))
    await selectAnim(kept.animNumber);
  state.frame = Math.min(kept.frame, state.anim.count - 1);
  state.bone = kept.bone ? state.ctx.bones.findIndex((bone) => bone.name === kept.bone) : -1;
  if (state.scene.textures[kept.tex]) state.tex = kept.tex;
  Object.assign(view.cam, kept.cam);
  state.undo = kept.undo;
  state.redo = kept.redo;
  recompute();
  renderAll();
}
// a turn of the poll that is still waiting for its answers when the next is due: that next one is skipped
let polling = false;
/**
 * One turn of the poll: the server is asked for the project's revision, the model file's stamp and the list
 * of models' signature, and what differs from what the page has is taken up. Not while an edit is on its way,
 * a bone is being dragged or a model is opening.
 */
async function poll() {
  if (polling || state.busy || state.drag || (state.modelId && !state.ready)) return;
  polling = true;
  try {
    const now = await api("rev", state.modelId ? { model: state.modelId } : {});
    if ($("live").className === "off") showLive("");
    if (now.list !== state.listSignature) {
      const hadList = state.listSignature !== undefined;
      state.listSignature = now.list;
      const models = await fillModels();
      if (!state.modelId && models.length) {
        await openModel(firstChoice(models, false));
        showLive("new", `a model appeared at ${clock()}`);
        return;
      }
      if (hadList) showLive("new", `the list of models changed at ${clock()}`);
    }
    if (!state.ready || state.busy) return;
    if (now.src === null) {
      status(`${state.modelId} is no longer in the folder: what is shown is the file as it was`, true);
      return;
    }
    if (now.src !== state.scene.stamp) {
      await reopen();
      status(`${state.modelId} was written anew on the disk: read again`);
      showLive("new", `the model's file changed at ${clock()}`);
      return;
    }
    if (now.rev === state.project.rev) return;
    state.project = await api("project", { model: state.modelId });
    const last = state.project.log?.[state.project.log.length - 1];
    await afterProject();
    status(
      `changed from outside${last ? ` by ${last.by}: ${last.what}` : ""} (revision ${state.project.rev})`,
    );
    showLive("new", `revision ${state.project.rev} by ${last?.by ?? "another"} at ${clock()}`);
  } catch {
    // the server is away, or the model unreadable for a moment: the next turn tries again
    showLive("off");
  } finally {
    polling = false;
  }
}
export const startPolling = () => setInterval(poll, POLL_MS);
