// The editor's page: its calls to the server (editor/serve.mjs), and the addresses of the pictures it serves.

import { state } from "/page/state.mjs";

/**
 * One call of the server's API: `params` in the address, `body` (JSON, or a file's bytes) posted. Throws what
 * it refuses.
 */
export async function api(name, params = {}, body) {
  const posted =
    body === undefined
      ? undefined
      : { method: "POST", body: body instanceof ArrayBuffer ? body : JSON.stringify(body) };
  const response = await fetch(`/api/${name}?${new URLSearchParams(params)}`, posted);
  const answer = await response.json();
  if (answer.error) throw new Error(answer.error);
  return answer;
}
/**
 * The address of a texture's picture (`adjust`: with these adjustments instead of the project's). Its `v`
 * changes when the project says something else of the texture, so the browser asks again.
 */
export function texUrl(number, adjust, extra = {}) {
  const entry = state.project.textures?.[number];
  const params = {
    model: state.modelId,
    i: number,
    ...(adjust ? { adjust: JSON.stringify(adjust) } : {}),
    ...extra,
    v: `${state.project.rev}.${JSON.stringify(entry ?? 0).length}`,
  };
  return `/api/texture?${new URLSearchParams(params)}`;
}
/**
 * The Textures tab's picture: with the triangles that wear it if asked, and its selection by colour shown
 * over it (`adjust`: as it would be with these).
 */
export function texShown(adjust, extra = {}) {
  const selects = (adjust ?? state.project.textures?.[state.tex]?.adjust)?.select;
  return texUrl(state.tex, adjust, {
    ...(state.showUv ? { uv: 1 } : {}),
    ...(selects && state.showMask ? { mask: 1 } : {}),
    ...extra,
  });
}
