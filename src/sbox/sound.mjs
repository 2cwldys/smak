// A GoldSrc sound as s&box plays it: the .wav, its loop told in a .meta beside it, and a .sound asset (a
// SoundEvent) that plays it as GoldSrc's mixer did.
//
//   sboxSound(bytes, { path, distance })   -> { files, sound, vsnd, wav, duration, loop, distance } or { unread }
//   soundEventOf({ file, distance })       the text of a .sound
//   distanceOf(attenuation)                how far a sound of that attenuation is heard, in units
//   soundEnvelope(x, rate)                 its loudness, 10 ms by 10 ms (sbox/check.mjs)
//
// MEASURED (2026-10-26, s&box's resourcecompiler and editor, Half-Life's sounds):
// - the .wav is kept as it is. The compiler takes GoldSrc's 8-bit files at 11025, 22050 and 44100 Hz and 16-bit
//   stereo ones, and writes them as Opus at 48000 Hz, of the same length; a small one (common/npc_step3.wav, 2217
//   samples) as 16-bit PCM at its own rate. Read back, their loudness 10 ms by 10 ms is the original's (correlated
//   0.9995 or more). Its compiled form is <name>.vsnd_c, the .sound names <name>.vsnd;
// - a loop (GoldSrc loops a file from its cue point to its end) is not read from the file's cue chunk by the
//   compiler: it is told in the .meta beside the file ({ loop, start }: the cue's time in seconds; no end, which is
//   the file's). weapons/rocket1.wav, its cue at 23395 of 54997, loops from 50927 of 119722 at 48000, and still plays
//   3 seconds after it started (it is 2.49 long);
// - the .sound is compiled by the editor, not by resourcecompiler ("Failed to find compiler").
//
// AS GOLDSRC'S MIXER PLAYED IT (Xash3D's S_SpatializeChannel, Quake's): a sound's gain falls in a straight line
// from 1 where it is to 0 at 1000 units over its attenuation (ATTN_NORM 0.8: 1250, ATTN_IDLE 2: 500), heard
// nowhere farther. s&box's mixer gains a sound by its Falloff curve at its distance over its Distance, so the
// .sound's Distance is 1000 / attenuation and its Falloff a line from 1 to 0 (its points Linear: read back, 0.75 at
// a quarter of the way, 0.5 half way). No occlusion, reverb or air absorption: GoldSrc's mixer had none of them.
import { createHash } from "node:crypto";
import { readWav } from "../audio/wav.mjs";

/** GoldSrc's attenuations (const.h) and the distance a sound's gain falls by them over (SND_CLIP_DISTANCE). */
export const ATTENUATION = { norm: 0.8, idle: 2, static: 1.25 };
export const SOUND_CLIP = 1000;
/** The folder of s&box's sounds under Assets, as its own (sounds/...). */
export const SOUND_FOLDER = "sounds";
/** The window a sound's loudness is measured over by soundEnvelope, in seconds. */
export const ENVELOPE_WINDOW = 0.01;

/** How far a sound of `attenuation` is heard, in units: where its gain comes to 0. */
export const distanceOf = (attenuation) => SOUND_CLIP / attenuation;

/** A GUID made from a path, the same each time, for a .meta (s&box's asset system keeps one in each). */
const guidOf = (path) => {
  const h = createHash("sha1").update(path).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/** The text of a .sound that plays `file` (a .vsnd, under Assets) as GoldSrc's mixer did, heard to `distance`. */
export function soundEventOf({ file, distance }) {
  return `${JSON.stringify(
    {
      UI: false,
      Volume: "1",
      Pitch: "1",
      SelectionMode: "Random",
      Sounds: [file],
      OcclusionEnabled: false,
      ReverbEnabled: false,
      AirAbsorption: false,
      DistanceAttenuation: true,
      Distance: distance,
      Falloff: [
        { x: 0, y: 1, in: 0, out: 0, mode: "Linear" },
        { x: 1, y: 0, in: 0, out: 0, mode: "Linear" },
      ],
      __references: [],
      __version: 1,
    },
    null,
    2,
  )}\n`;
}

/**
 * A GoldSrc sound file (`bytes`) as s&box's files: the .wav at `path` (under Assets: sounds/smak/common/step1.wav),
 * a .meta beside it when it loops, and the .sound beside it, heard to `distance` units. Returns { files: [{ path,
 * data }], sound, vsnd, wav, duration (s), loop (where it loops from, s, or null), distance }, or { unread: why }
 * for one that is not a WAVE file (GoldSrc plays none other).
 */
export function sboxSound(bytes, { path, distance = distanceOf(ATTENUATION.norm) }) {
  let wav;
  try {
    wav = readWav(bytes);
  } catch (error) {
    return { unread: error.message };
  }
  const stem = path.replace(/\.wav$/i, "");
  const sound = `${stem}.sound`;
  const vsnd = `${stem}.vsnd`;
  const files = [{ path, data: bytes }];
  const loop = wav.cue?.length ? wav.cue[0] / wav.rate : null;
  if (loop !== null)
    files.push({ path: `${path}.meta`, data: `${JSON.stringify({ guid: guidOf(path), loop: true, start: +loop.toFixed(7) }, null, 2)}\n` }); // prettier-ignore
  files.push({ path: sound, data: soundEventOf({ file: vsnd, distance }) });
  return { files, sound, vsnd, wav: path, duration: wav.samples / wav.rate, loop, distance };
}

/** A sound's loudness (`x`, its samples at `rate`), window by window of ENVELOPE_WINDOW seconds (the k-th from
 * sample floor(k * rate * ENVELOPE_WINDOW)): the root of the mean square of each. The editor measures a compiled
 * sound so at the rate it was compiled at (sbox/check.mjs). */
export function soundEnvelope(x, rate) {
  const out = [];
  const step = rate * ENVELOPE_WINDOW;
  for (let k = 0; Math.floor((k + 1) * step) <= x.length; k++) {
    const [from, to] = [Math.floor(k * step), Math.floor((k + 1) * step)];
    let sum = 0;
    for (let i = from; i < to; i++) sum += x[i] * x[i];
    out.push(Math.sqrt(sum / (to - from)));
  }
  return out;
}
