// Garry's Mod driven from outside while it runs, as stevenlafl's TS port does (tools/rcon.mjs, probe.mjs,
// map/shoot.mjs): console commands over Source's RCON, Lua probes that answer PASS or FAIL from inside the
// game, and a screenshot from a spot.
//
// The game must take RCON: a dedicated server always does; a listen server only when GMod is started with
// -usercon (and +rcon_password). It answers on the machine's LAN address, not on 127.0.0.1, so every IPv4
// address of the machine is tried in turn. Several commands sent at once trip GMod's guard against floods
// ("tried to get banned using HTTP"): Lua longer than a line goes in a file under garrysmod/lua/, run by
// lua_openscript, and its answer comes back through garrysmod/data/.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findGmod } from "./compile.mjs";

export const RCON_PORT = 27015;
export const RCON_PASSWORD_VARIABLE = "SMAK_RCON_PASSWORD";
const AUTH = 3;
const EXEC = 2;
const AUTH_RESPONSE = 2;
// the built-in probes, by name (`smak gmod-probe map`)
export const PROBES_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "probes");

/** The addresses RCON is looked for on: SMAK_RCON_HOST when set, else 127.0.0.1 and every LAN IPv4 address. */
export function rconHosts({ env = process.env } = {}) {
  if (env.SMAK_RCON_HOST) return [env.SMAK_RCON_HOST];
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
  return ["127.0.0.1", ...lan];
}

function packet(id, type, body) {
  const text = Buffer.from(body, "utf8");
  const out = Buffer.alloc(14 + text.length);
  out.writeInt32LE(10 + text.length, 0);
  out.writeInt32LE(id, 4);
  out.writeInt32LE(type, 8);
  text.copy(out, 12);
  return out;
}

/** One RCON session on one address: the commands sent `gap` ms apart, their replies joined. */
function rconAt(host, port, password, commands, { timeout, gap }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    let buffer = Buffer.alloc(0);
    let authed = false;
    let next = 0;
    let said = "";
    const stop = (error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve(said);
    };
    socket.setTimeout(timeout, () =>
      stop(Object.assign(new Error(`RCON on ${host}:${port} timed out`), { code: "ETIMEDOUT" })),
    );
    socket.on("error", stop);
    socket.on("connect", () => socket.write(packet(1, AUTH, password)));
    const send = () => {
      if (next >= commands.length) return void setTimeout(() => stop(), gap);
      socket.write(packet(100 + next, EXEC, commands[next++]));
      setTimeout(send, gap);
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readInt32LE(0)) {
        const size = buffer.readInt32LE(0);
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.toString("utf8", 12, 4 + size - 2);
        buffer = buffer.subarray(4 + size);
        if (!authed) {
          // before the auth answer the server sends an empty reply (type 0); the answer is type 2 (the same
          // number as a command), its id -1 for a wrong password
          if (type !== AUTH_RESPONSE) continue;
          if (id === -1) return stop(Object.assign(new Error("RCON: wrong password"), { code: "EPASSWORD" }));
          authed = true;
          send();
        } else said += body;
      }
    });
  });
}

/**
 * Console commands sent to a running GMod (or any Source game) over RCON; resolves to what it answered.
 * `host` when given, else each of rconHosts() until one takes the connection. The password is `password`,
 * else SMAK_RCON_PASSWORD. It throws when no address answers, or the password is wrong.
 */
export async function rcon(
  commands,
  { host, port = RCON_PORT, password, timeout = 8000, gap = 400, env = process.env } = {},
) {
  const list = [commands].flat();
  const pass = password ?? env[RCON_PASSWORD_VARIABLE];
  if (!pass) throw new Error(`RCON needs the game's rcon_password: --password, or ${RCON_PASSWORD_VARIABLE}`);
  const hosts = host ? [host] : rconHosts({ env });
  const refused = [];
  for (const at of hosts) {
    try {
      return await rconAt(at, port, pass, list, { timeout, gap });
    } catch (error) {
      if (error.code !== "ECONNREFUSED" && error.code !== "EADDRNOTAVAIL") throw error;
      refused.push(at);
    }
  }
  throw new Error(`no RCON on port ${port} at ${refused.join(", ")}: is the game up, started with -usercon and +rcon_password (a listen server), or a dedicated server?`); // prettier-ignore
}

/** The folder that holds garrysmod/: `game` when given (a dedicated server's install too), else GMod's. */
function gameFolder(game) {
  const folder = game ?? findGmod();
  if (!folder || !existsSync(join(folder, "garrysmod"))) throw new Error(`no GMod folder${game ? ` at ${game}` : " found in Steam's libraries"}: --game <the folder that holds garrysmod/>`); // prettier-ignore
  return folder;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A probe's Lua with what it is given before it: `check(ok, what)` writes a PASS or FAIL line, `note(text)` a
 * NOTE line, `done()` ends it (by a timer too, for a probe that waits on the game). An error the probe throws
 * before it waits is a FAIL, and ends it. The helpers are all on the probe's first line, so an error's line
 * number is the probe file's own.
 */
export function probeLua(name, body) {
  const helpers = [
    `local SMAK_OUT, out, ended = "smak_probe_${name}.txt", {}, false`,
    `local function check(ok, what) out[#out + 1] = (ok and "PASS " or "FAIL ") .. tostring(what) return ok end`,
    `local function note(text) out[#out + 1] = "NOTE " .. tostring(text) end`,
    `local function done() if ended then return end ended = true out[#out + 1] = "DONE" file.Write(SMAK_OUT, table.concat(out, "\\n")) end`,
    `local ran, err = pcall(function()`,
  ];
  return `${helpers.join(" ")} ${body}
end)
if not ran then check(false, "error: " .. tostring(err)) done() end
-- a SMAK probe (smak gmod-probe ${name}): its lines go to garrysmod/data/smak_probe_${name}.txt
`;
}

/** The lines a probe wrote, read: each PASS, FAIL and NOTE, and whether it got to DONE. */
export function probeAnswer(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const of = (kind) => lines.filter((l) => l.startsWith(`${kind} `)).map((l) => l.slice(kind.length + 1));
  return { passed: of("PASS"), failed: of("FAIL"), notes: of("NOTE"), done: lines.includes("DONE") };
}

/**
 * A probe run in the game: `lua` (its body; probeLua puts the helpers before it) written under garrysmod/lua/
 * with a name of its own each time (the client keeps a script it has run by its name), run with
 * lua_openscript (lua_openscript_cl with `client`), and its answer waited for in garrysmod/data/ until DONE or
 * `wait` ms. Resolves to probeAnswer's reading, with `timedOut` and the text.
 */
export async function runProbe(lua, { name = "probe", game, client = false, wait = 30000, ...link } = {}) {
  if (!/^\w+$/.test(name)) throw new Error(`a probe's name is letters, digits and _: ${name}`);
  const folder = join(gameFolder(game), "garrysmod");
  const script = `smak_probe_${name}_${Date.now().toString(36)}.lua`;
  const answer = join(folder, "data", `smak_probe_${name}.txt`);
  mkdirSync(join(folder, "data"), { recursive: true });
  rmSync(answer, { force: true });
  writeFileSync(join(folder, "lua", script), probeLua(name, lua));
  try {
    // lua_openscript answers "Running script" and may say nothing more: the file is the answer
    await rcon(`${client ? "lua_openscript_cl" : "lua_openscript"} ${script}`, link);
    const until = Date.now() + wait;
    while (Date.now() < until) {
      if (existsSync(answer) && readFileSync(answer, "utf8").includes("DONE")) break;
      await sleep(250);
    }
  } finally {
    rmSync(join(folder, "lua", script), { force: true });
  }
  const text = existsSync(answer) ? readFileSync(answer, "utf8") : "";
  const read = probeAnswer(text);
  return { ...read, timedOut: !read.done, text };
}

/** A built-in probe's Lua by its name (src/source/probes/<name>.lua), or null. */
export function builtInProbe(name) {
  const file = join(PROBES_FOLDER, `${name}.lua`);
  return /^\w+$/.test(name) && existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** The built-in probes' names. */
export const builtInProbes = () =>
  existsSync(PROBES_FOLDER)
    ? readdirSync(PROBES_FOLDER)
        .filter((f) => f.endsWith(".lua"))
        .map((f) => f.slice(0, -4))
    : [];

/**
 * A screenshot from GMod's client at a spot: the eye at `at` (x, y, z) looking along `look` (pitch, yaw), the
 * HUD, the view model and the panels hidden, then `jpeg`. Resolves to the new file under
 * garrysmod/screenshots/. A listen server (the person's client is player 1), -usercon.
 *
 * The server puts player 1 there in noclip (what the server sends the client is what that spot sees); the
 * client's view is set by hooks taken away after, and no setting of the person's is changed: fov_desired, say,
 * is saved in their config, and cl_drawhud sent from the server is not done.
 */
export async function shoot(at, look = [0, 0], { game, fov = 75, wait = 15000, ...link } = {}) {
  const [x, y, z] = at.map(Number);
  const [pitch, yaw] = look.map(Number);
  if (![x, y, z, pitch, yaw, Number(fov)].every(Number.isFinite)) throw new Error(`a spot is three numbers and a look two: ${at} ${look}`); // prettier-ignore
  const folder = join(gameFolder(game), "garrysmod");
  const shots = join(folder, "screenshots");
  const stamp = Date.now().toString(36);
  // the eye is 64 above a standing player's feet in GMod; noclip keeps it where it's put
  const server = `local p = Entity(1)
if not IsValid(p) then return end
p:SetMoveType(MOVETYPE_NOCLIP)
p:SetPos(Vector(${x}, ${y}, ${z - 64}))
p:SetEyeAngles(Angle(${pitch}, ${yaw}, 0))
p:SetVelocity(-p:GetVelocity())
-- the client's own Lua may not run jpeg ("Command is blocked"); the server may make it
timer.Simple(2, function() if IsValid(p) then p:ConCommand("jpeg") end end)`;
  const client = `local eye, look = Vector(${x}, ${y}, ${z}), Angle(${pitch}, ${yaw}, 0)
hook.Add("CalcView", "smak_shoot", function() return { origin = eye, angles = look, fov = ${Number(fov)}, drawviewer = false } end)
hook.Add("HUDShouldDraw", "smak_shoot", function() return false end)
hook.Add("PreDrawViewModel", "smak_shoot", function() return true end)
local panels = vgui.GetWorldPanel()
local shown = panels:IsVisible()
panels:SetVisible(false)
-- the server's jpeg comes 2 s after its script, this one a moment after that script
timer.Simple(3.5, function()
  hook.Remove("CalcView", "smak_shoot")
  hook.Remove("HUDShouldDraw", "smak_shoot")
  hook.Remove("PreDrawViewModel", "smak_shoot")
  panels:SetVisible(shown)
end)`;
  const scripts = [`smak_shoot_${stamp}.lua`, `smak_shoot_cl_${stamp}.lua`];
  writeFileSync(join(folder, "lua", scripts[0]), server);
  writeFileSync(join(folder, "lua", scripts[1]), client);
  const before = Date.now();
  try {
    // one line: a second RCON session straight after the first is dropped, without a word
    await rcon(`lua_openscript ${scripts[0]}; lua_openscript_cl ${scripts[1]}`, link);
    const until = Date.now() + wait;
    while (Date.now() < until) {
      const found = existsSync(shots)
        ? readdirSync(shots)
            .filter((f) => f.endsWith(".jpg"))
            .map((f) => join(shots, f))
            .find((f) => statSync(f).mtimeMs > before)
        : null;
      // the file is there before the game has finished writing it
      if (found) return await sleep(500).then(() => found);
      await sleep(250);
    }
  } finally {
    for (const script of scripts) rmSync(join(folder, "lua", script), { force: true });
  }
  throw new Error(`no screenshot appeared in ${shots} in ${wait / 1000} s: is player 1 in the game?`);
}

/**
 * A dedicated GMod server (SteamCMD's app 4020, installed in `folder`) started on `map`: off the server list,
 * cheats on, RCON with `password` (else SMAK_RCON_PASSWORD), its console written to garrysmod/console.log as it
 * goes (-condebug; its output to a pipe is held back). Port 27016 by default, so the game's own 27015 stays
 * free. Returns `{ process, port, log }`. On Windows `process` is only the launcher's: the server runs on in a
 * minimized window of its own until it is told `quit` (gmod-rcon quit --port 27016) or the window is closed.
 */
export function startGmodServer(
  folder,
  { map, port = 27016, password, gamemode = "sandbox", players = 4, env = process.env } = {},
) {
  const exe = ["srcds_win64.exe", "srcds.exe", "srcds_run"]
    .map((f) => join(folder, f))
    .find((f) => existsSync(f));
  if (!exe) throw new Error(`no srcds in ${folder}: install the server with SteamCMD (+force_install_dir ${folder} +login anonymous +app_update 4020 +quit)`); // prettier-ignore
  if (!/^[\w.-]+$/.test(map)) throw new Error(`a map's name is letters, digits, _ . and -: ${map}`);
  const pass = password ?? env[RCON_PASSWORD_VARIABLE];
  if (!pass) throw new Error(`the server needs an rcon_password: --password, or ${RCON_PASSWORD_VARIABLE}`);
  // it goes through cmd's start below, which reads & ^ | < > as its own
  if (!/^[\w.-]+$/.test(pass) || !/^\w+$/.test(gamemode))
    throw new Error("the rcon_password and gamemode: letters, digits, _ . and -");
  const args = ["-console", "-game", "garrysmod", "-norestart", "-condebug", "-port", String(port), "+maxplayers", String(players),
    "+gamemode", gamemode, "+sv_lan", "1", "+sv_cheats", "1", "+sv_hibernate_think", "1", "+rcon_password", pass, "+map", map]; // prettier-ignore
  // -console reads its input from a console: spawned without one, or with a hidden one whose input is not the
  // console's, srcds stops on "CTextConsoleWin32::GetLine: !GetNumberOfConsoleInputEvents". cmd's start gives
  // it a console window of its own, minimized
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/c", "start", '"srcds"', "/min", `"${exe}"`, ...args], { cwd: folder, stdio: "ignore", windowsVerbatimArguments: true }) // prettier-ignore
      : spawn(exe, args, { cwd: folder, stdio: "ignore" });
  return { process: child, port, log: join(folder, "garrysmod", "console.log") };
}
