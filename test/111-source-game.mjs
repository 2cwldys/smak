// GMod driven while it runs (src/source/game.mjs): RCON's packets against a server that answers as Source's
// does, a probe's Lua and its answer read, and a probe run end to end with the game played by that server.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, testAsync, sure, tmp, HERE } from "./helper.mjs";

const { source } = smak;

/** A server that speaks RCON as srcds does: an empty reply then the auth answer, then each command's reply. */
function fakeRcon(password, answer) {
  const said = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    const reply = (id, type, body) => {
      const text = Buffer.from(body, "utf8");
      const out = Buffer.alloc(14 + text.length);
      out.writeInt32LE(10 + text.length, 0);
      out.writeInt32LE(id, 4);
      out.writeInt32LE(type, 8);
      text.copy(out, 12);
      socket.write(out);
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readInt32LE(0)) {
        const size = buffer.readInt32LE(0);
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.toString("utf8", 12, 4 + size - 2);
        buffer = buffer.subarray(4 + size);
        if (type === 3) {
          reply(id, 0, "");
          reply(body === password ? id : -1, 2, "");
        } else {
          said.push(body);
          reply(id, 0, answer(body));
        }
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, said })),
  );
}

test("gmod probe: the helpers before the probe's Lua, and its lines read back", () => {
  const lua = source.probeLua("map", 'check(true, "one")');
  sure(
    lua.includes('"smak_probe_map.txt"') &&
      lua.includes("local function check(") &&
      lua.includes("local function done()"),
    "the helpers",
  );
  const [first, second] = lua.split("\n");
  sure(first.endsWith('pcall(function() check(true, "one")') && second === "end)", "the body wrapped, so an error is a FAIL; its first line the file's first"); // prettier-ignore
  sure(lua.includes('table.concat(out, "\\n")'), "lines joined by a Lua newline");
  const read = source.probeAnswer("PASS a\r\nNOTE b c\nFAIL d\nDONE\n");
  sure(
    read.passed.join() === "a" && read.notes.join() === "b c" && read.failed.join() === "d" && read.done,
    JSON.stringify(read),
  );
  sure(!source.probeAnswer("PASS a\n").done, "no DONE, not done");
  sure(
    source.builtInProbe("map")?.includes("util.TraceHull") && source.builtInProbes().includes("map"),
    "the map probe is built in",
  );
  sure(
    source.builtInProbe("../map") === null && source.builtInProbe("nosuch") === null,
    "no probe by another name",
  );
  sure(source.rconHosts({ env: {} })[0] === "127.0.0.1" && source.rconHosts({ env: { SMAK_RCON_HOST: "10.0.0.2" } }).join() === "10.0.0.2", "the hosts"); // prettier-ignore
});

await testAsync(
  "gmod rcon: logs in, sends each command, joins the replies; a wrong password said",
  "rcon",
  async () => {
    const fake = await fakeRcon("pw", (body) => `got ${body}\n`);
    try {
      const said = await source.rcon(["status", "echo hi"], {
        host: "127.0.0.1",
        port: fake.port,
        password: "pw",
        gap: 30,
      });
      sure(said === "got status\ngot echo hi\n", JSON.stringify(said));
      let wrong = "";
      await source
        .rcon("status", { host: "127.0.0.1", port: fake.port, password: "no", gap: 30 })
        .catch((e) => (wrong = e.message));
      sure(/wrong password/.test(wrong), wrong);
      let none = "";
      await source
        .rcon("status", { password: "pw", env: { SMAK_RCON_HOST: "127.0.0.1" }, port: 1 })
        .catch((e) => (none = e.message));
      sure(/no RCON on port 1 at 127\.0\.0\.1/.test(none), none);
      let asked = "";
      await source.rcon("status", { env: {} }).catch((e) => (asked = e.message));
      sure(/rcon_password/.test(asked), asked);
    } finally {
      fake.server.close();
    }
  },
);

await testAsync(
  "gmod probe: run end to end, its file under lua/ named anew, its answer from data/, the file taken away",
  "probe",
  async () => {
    const game = join(tmp, "gmod-probe");
    mkdirSync(join(game, "garrysmod", "lua"), { recursive: true });
    // the game: lua_openscript <file> "runs" it by writing what the probe would
    const fake = await fakeRcon("pw", (body) => {
      const script = body.split(" ")[1];
      const ran =
        existsSync(join(game, "garrysmod", "lua", script)) &&
        readFileSync(join(game, "garrysmod", "lua", script), "utf8");
      if (ran && body.startsWith("lua_openscript "))
        writeFileSync(
          join(game, "garrysmod", "data", "smak_probe_floor.txt"),
          "PASS a floor\nNOTE concrete\nDONE",
        );
      return `Running script ${script}...\n`;
    });
    try {
      const link = { game, host: "127.0.0.1", port: fake.port, password: "pw", gap: 30 };
      const answer = await source.runProbe("check(true, 'a floor')", { name: "floor", wait: 3000, ...link });
      sure(answer.done && answer.passed.join() === "a floor" && answer.notes.join() === "concrete" && !answer.failed.length, JSON.stringify(answer)); // prettier-ignore
      sure(/^lua_openscript smak_probe_floor_\w+\.lua$/.test(fake.said[0]), fake.said[0]);
      sure(readdirSync(join(game, "garrysmod", "lua")).length === 0, "the probe's file taken away");
      const client = await source.runProbe("done()", { name: "floor", client: true, wait: 600, ...link });
      sure(fake.said[1].startsWith("lua_openscript_cl ") && fake.said[1] !== fake.said[0].replace("lua_openscript", "lua_openscript_cl"), "the client's, by another name"); // prettier-ignore
      sure(client.timedOut && !client.text, "no answer in time is said");
      let named = "";
      await source.runProbe("", { name: "../x", ...link }).catch((e) => (named = e.message));
      sure(/letters, digits/.test(named), named);
    } finally {
      fake.server.close();
    }
  },
);

test("gmod collision: spots inside the GoldSrc map, open in hull 0, the same for the same seed", () => {
  const bsp = smak.maps.readBsp(readFileSync(join(HERE, "fixtures", "tworooms.bsp")));
  const spots = source.collisionSpots(bsp, { count: 200, seed: 7 });
  sure(spots.length === 200, `${spots.length} spots`);
  sure(
    spots.every((p) => p.every((v) => v - Math.floor(v) === 0.5)),
    "each on a half unit, off the planes",
  );
  sure(
    spots.every((p) => bsp.leaves[smak.maps.leafAt(bsp, p)].contents === -1),
    "each open in hull 0",
  );
  sure(
    JSON.stringify(source.collisionSpots(bsp, { count: 200, seed: 7 })) === JSON.stringify(spots),
    "the same seed, the same spots",
  );
  sure(
    JSON.stringify(source.collisionSpots(bsp, { count: 200, seed: 8 })) !== JSON.stringify(spots),
    "another seed, others",
  );
});
