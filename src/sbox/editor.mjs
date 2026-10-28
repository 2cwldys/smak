// s&box's editor driven while it runs, through sbox-cli (`sbox/bin/managed/sbox-cli.exe`, which comes with s&box):
// its tools called, C# run inside it, a project's editor opened and closed.
//
//   sboxCall(project, tool, args, { sbox, timeout })   -> what the tool answered (JSON read, else its text)
//   runCsharp(project, code, { sbox, timeout })         -> what the code returned
//   editorFor(project, { sbox, wait })                  -> { opened, close() }: the project's editor, opened if none is
//   compileAssets(project, paths, { sbox })             -> the paths the editor's asset_compile could not compile
//   compileFailures(answered, paths)                     the same, read from call_tools' answers
//
// sbox-cli talks to an editor over a local named pipe, never the network. `--call` connects, calls one tool and
// disconnects; the editor keeps running. It finds the editor by the project the call is made from (`cwd`), so a
// call never reaches another project's editor. An editor this opens (`--project`) is owned by the sbox-cli that
// opened it, and closes, unsaved work and all, when that one's input is closed: close() does that. One the person
// had open is attached to and left open.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { findSbox } from "./compile.mjs";

/** How long one call may take, and how long an editor may take to open, in milliseconds. */
const CALL_TIMEOUT = 300_000;
const OPEN_TIMEOUT = 300_000;

/** sbox-cli's path in s&box's folder. */
export const sboxCli = (sbox) => join(sbox ?? findSbox(), "bin", "managed", "sbox-cli.exe");

/** The folder of a project: the one with its .sbproj. Throws when `project` is not one. */
export function projectFolder(project) {
  const folder = resolve(project);
  const isFolder = existsSync(folder) && statSync(folder).isDirectory();
  if (!isFolder || !readdirSync(folder).some((f) => f.endsWith(".sbproj")))
    throw new Error(`${project}: not an s&box project (no .sbproj in it). Make one with sbox-cli --new "Title" --template addon.minimal`); // prettier-ignore
  return folder;
}

/** One call: sbox-cli exits 0 when the tool answered, 2 when the tool reported an error, 1 when it could not connect. */
function call(project, tool, args, { sbox, timeout = CALL_TIMEOUT } = {}) {
  const result = spawnSync(sboxCli(sbox), ["--call", tool, JSON.stringify(args ?? {})], {
    cwd: projectFolder(project),
    encoding: "utf8",
    timeout,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    out: result.stdout ?? "",
    err: `${result.stderr ?? ""}${result.error ? result.error.message : ""}`,
  };
}

/** What a tool answered: its JSON read, else its text. Throws its words when it failed or nothing answered. A call
 * that found no editor is made once more, 3 s later: over the 210 models of Half-Life's check, one call of an editor
 * that kept running found none. */
export function sboxCall(project, tool, args, options) {
  let { status, out, err } = call(project, tool, args, options);
  if (status === 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
    ({ status, out, err } = call(project, tool, args, options));
  }
  if (status === 1) throw new Error(`no s&box editor answered for ${project}: ${err.trim() || out.trim()}`);
  if (status !== 0) throw new Error(`${tool}: ${(err || out).trim()}`);
  try {
    return JSON.parse(out);
  } catch {
    return out.trim();
  }
}

/** C# run inside the editor (an async method body; see sbox-cli's run_csharp), passed by a file. */
export function runCsharp(project, code, options) {
  const folder = mkdtempSync(join(tmpdir(), "smak-sbox-"));
  try {
    const file = join(folder, "probe.cs");
    writeFileSync(file, code);
    return sboxCall(project, "run_csharp", { path: file.replace(/\\/g, "/") }, options);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * The project's editor: the one open on it (left open after), else one opened for the run, which close() closes.
 * Resolves once it answers.
 */
export async function editorFor(project, { sbox, wait = OPEN_TIMEOUT } = {}) {
  const folder = projectFolder(project);
  if (call(folder, "editor_status", {}, { sbox, timeout: 60_000 }).status === 0)
    return { opened: false, close: async () => {} };
  const child = spawn(sboxCli(sbox), ["--project", folder], {
    cwd: folder,
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });
  let said = "";
  child.stderr.on("data", (chunk) => (said += chunk));
  let gone = false;
  child.on("exit", () => (gone = true));
  const close = async () => {
    if (gone) return;
    child.stdin.end();
    for (let waited = 0; !gone && waited < 30_000; waited += 250) await sleep(250);
    if (!gone) child.kill();
  };
  const started = Date.now();
  while (Date.now() - started < wait) {
    if (gone) throw new Error(`the s&box editor did not open for ${folder}: ${said.trim()}`);
    if (/connected\./.test(said) && call(folder, "editor_status", {}, { sbox, timeout: 60_000 }).status === 0)
      return { opened: true, close };
    await sleep(1000);
  }
  await close();
  throw new Error(`the s&box editor did not answer within ${Math.round(wait / 1000)} s for ${folder}`);
}

/** Which of `paths` the editor's asset_compile answers (call_tools', in order) say did not compile. */
export function compileFailures(answered, paths) {
  const text = typeof answered === "string" ? answered : JSON.stringify(answered);
  const said = [...text.matchAll(/\\?"Success\\?"\s*:\s*(true|false)/g)].map((m) => m[1] === "true");
  if (said.length !== paths.length) return paths.filter((p) => !text.includes(p)).concat(said.length < paths.length ? [`(${paths.length - said.length} not answered)`] : []); // prettier-ignore
  return paths.filter((_, k) => !said[k]);
}

/** `paths` (assets of the project) compiled by the editor in one call; returns those it could not compile. */
export function compileAssets(project, paths, options) {
  if (!paths.length) return [];
  const answered = sboxCall(project, "call_tools", { calls: paths.map((path) => ({ name: "asset_compile", arguments: { path } })) }, options); // prettier-ignore
  return compileFailures(answered, paths);
}
