// A GoldSrc demo read: a demo made here as the engine lays one out (cl_demo.c), its frames read back.
import * as smak from "../src/index.mjs";
import { test, sure } from "./helper.mjs";

/** A demo of one segment: the playback's start, `frames` network messages, a console command, the segment's end. */
function demoOf(frames, command) {
  const parts = [];
  const header = Buffer.alloc(544);
  header.write("HLDEMO", 0, "latin1");
  header.writeInt32LE(5, 8);
  header.writeInt32LE(48, 12);
  header.write("ts_lobby", 16, "latin1");
  header.write("ts", 276, "latin1");
  parts.push(header);
  const frameHead = (type, time) => {
    const h = Buffer.alloc(9);
    h.writeUInt8(type, 0);
    h.writeFloatLE(time, 1);
    return h;
  };
  parts.push(frameHead(2, 0));
  for (const f of frames) {
    parts.push(frameHead(1, f.time));
    const info = Buffer.alloc(436 + 28);
    const ref = 4;
    info.writeFloatLE(f.frametime, ref + 60);
    info.writeInt32LE(f.onGround ? 1 : 0, ref + 80);
    f.velocity.forEach((v, k) => info.writeFloatLE(v, ref + 88 + k * 4));
    f.origin.forEach((v, k) => info.writeFloatLE(v, ref + 100 + k * 4));
    info.writeFloatLE(f.viewZ, ref + 112 + 8);
    const cmd = ref + 232;
    info.writeUInt8(f.msec, cmd + 2);
    info.writeFloatLE(f.forward, cmd + 16);
    info.writeUInt16LE(f.buttons, cmd + 30);
    const mv = cmd + 52;
    info.writeFloatLE(800, mv);
    info.writeFloatLE(f.maxspeed, mv + 8);
    info.writeFloatLE(4, mv + 28);
    const message = Buffer.from([1, 2, 3]);
    const length = Buffer.alloc(4);
    length.writeInt32LE(message.length);
    parts.push(info, length, message);
  }
  parts.push(frameHead(3, 1));
  const said = Buffer.alloc(64);
  said.write(command, 0, "latin1");
  parts.push(said, frameHead(5, 1));
  const body = Buffer.concat(parts);
  const directory = Buffer.alloc(4 + 92 * 2);
  directory.writeInt32LE(2, 0);
  // the loading segment, empty (its end alone), and the playback
  const loading = Buffer.concat([frameHead(5, 0)]);
  directory.writeInt32LE(body.length, 4 + 84);
  directory.writeInt32LE(loading.length, 4 + 88);
  directory.writeInt32LE(1, 4 + 92);
  directory.writeInt32LE(544, 4 + 92 + 84);
  directory.writeInt32LE(body.length - 544, 4 + 92 + 88);
  const all = Buffer.concat([body, loading, directory]);
  all.writeInt32LE(body.length + loading.length, 540);
  return all;
}

test("readDemo: each network message's view of the player (where, how fast, on the ground, the eye), its command and the server's movement settings; the console's commands", () => {
  const frames = [
    { time: 0.5, frametime: 0.014, onGround: true, velocity: [0, 0, 0], origin: [10, 20, 36], viewZ: 28, msec: 14, forward: 0, buttons: 0, maxspeed: 320 }, // prettier-ignore
    { time: 0.514, frametime: 0.014, onGround: false, velocity: [100, -50, 268], origin: [11.5, 19.25, 40], viewZ: 12, msec: 14, forward: 400, buttons: 6, maxspeed: 320 }, // prettier-ignore
  ];
  const demo = smak.play.readDemo(demoOf(frames, "+forward"));
  sure(demo.map === "ts_lobby" && demo.gameDir === "ts" && demo.demoProtocol === 5 && demo.netProtocol === 48, JSON.stringify({ ...demo, frames: undefined })); // prettier-ignore
  sure(demo.frames.length === 2, `${demo.frames.length} frames`);
  const [a, b] = demo.frames;
  sure(a.onGround && !b.onGround && b.origin.join() === "11.5,19.25,40" && b.velocity.join() === "100,-50,268", JSON.stringify(b)); // prettier-ignore
  sure(b.viewHeight[2] === 12 && b.cmd.msec === 14 && b.cmd.forward === 400 && b.cmd.buttons === 6, JSON.stringify(b.cmd));
  sure(b.movevars.maxspeed === 320 && b.movevars.gravity === 800 && b.movevars.friction === 4, JSON.stringify(b.movevars));
  sure(demo.commands.length === 1 && demo.commands[0].command === "+forward", JSON.stringify(demo.commands));
  let refused = null;
  try {
    smak.play.readDemo(Buffer.from("not a demo at all"));
  } catch (e) {
    refused = e.message;
  }
  sure(/HLDEMO/.test(refused), refused);
});
