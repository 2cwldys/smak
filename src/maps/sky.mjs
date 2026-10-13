// The sky's picture. A map's worldspawn names it (`skyname`), and the game looks for its six sides in
// `gfx/env/`: `<name>rt`, `bk`, `lf`, `ft`, `up` and `dn`, each a `.tga` or a `.bmp`. They are read here and
// asked by the way a pixel looks, so that a view shows the sky the game shows, and not a flat colour.
//
//   readTga(bytes)                   a Targa picture: { width, height, rgb }
//   skyOf(name, folders)             the six sides of a sky, found in the game's folders
//   skyColour(sky, x, y, z, out)     the sky's colour along a way out of the eye
//
// Which side lies where, and which way up, is the engine's own table (Xash3D FWGS, ref/gl/gl_warp.c:
// `st_to_vec`, and the order its sides are bound in): `rt` is seen looking along +x, `lf` along -x, `bk`
// along +y, `ft` along -y.
import { readFileSync } from "node:fs";
import { unbmp } from "../image.mjs";
import { inFolders } from "./files.mjs";

/** The sides of a sky, as their files end, in the order the drawing keeps them: +x, -x, +y, -y, +z, -z. */
export const SKY_SIDES = ["rt", "lf", "bk", "ft", "up", "dn"];
/** The kinds of file a side may be, the first found wins: the engine's own order. */
const SKY_KINDS = ["tga", "bmp"];
/** Where each number of a Targa file's header is (bytes), and the kinds of picture the kit reads. */
const TGA = {
  idLength: 0,
  mapType: 1,
  kind: 2,
  mapLength: 5,
  mapBits: 7,
  width: 12,
  height: 14,
  bits: 16,
  about: 17,
  sizeof: 18,
};
const TGA_MAPPED = 1;
const TGA_COLOUR = 2;
const TGA_GREY = 3;
const TGA_PACKED = 8;
/** In a Targa's last header byte: its rows go from the top down, its columns from the right. */
const TGA_FROM_TOP = 0x20;
const TGA_FROM_RIGHT = 0x10;
/** A sky's mean colour is taken from every this many pixels of its four upright sides. */
const MEAN_EVERY = 16;

/**
 * A Targa picture read: `{ width, height, rgb }`, three bytes a pixel from the top left. Read are the plain
 * and the run-length packed kinds, in colours of 24 or 32 bits, of 8 bits with a palette, and in greys; a
 * see-through channel is passed over. Throws, in words, for anything else.
 */
export function readTga(bytes) {
  if (bytes.length < TGA.sizeof) throw new Error("not a Targa file: it is shorter than its header");
  const kind = bytes[TGA.kind] & ~TGA_PACKED;
  const packed = Boolean(bytes[TGA.kind] & TGA_PACKED);
  const width = bytes.readUInt16LE(TGA.width);
  const height = bytes.readUInt16LE(TGA.height);
  const bits = bytes[TGA.bits];
  const mapLength = bytes[TGA.mapType] ? bytes.readUInt16LE(TGA.mapLength) : 0;
  const mapBytes = bytes[TGA.mapBits] >> 3;
  const sound =
    (kind === TGA_COLOUR && (bits === 24 || bits === 32)) ||
    (kind === TGA_GREY && bits === 8) ||
    (kind === TGA_MAPPED && bits === 8 && (mapBytes === 3 || mapBytes === 4));
  if (!sound || !width || !height)
    throw new Error(
      `a Targa of kind ${bytes[TGA.kind]} and ${bits} bits is not read: colours of 24 or 32 bits, 8 with a palette, or greys`,
    );
  const mapAt = TGA.sizeof + bytes[TGA.idLength];
  let at = mapAt + mapLength * mapBytes;
  const each = bits >> 3;
  const rgb = new Uint8Array(width * height * 3);
  const fromTop = Boolean(bytes[TGA.about] & TGA_FROM_TOP);
  const fromRight = Boolean(bytes[TGA.about] & TGA_FROM_RIGHT);
  /** Puts the pixel stored at `from` as the picture's `nth`, counted the way the file counts. */
  const put = (nth, from) => {
    const column = nth % width;
    const row = (nth - column) / width;
    const to = ((fromTop ? row : height - 1 - row) * width + (fromRight ? width - 1 - column : column)) * 3;
    if (kind === TGA_GREY) rgb.fill(bytes[from], to, to + 3);
    else {
      // stored blue, green, red: in the file itself, or in its palette
      const colour = kind === TGA_MAPPED ? mapAt + bytes[from] * mapBytes : from;
      rgb[to] = bytes[colour + 2];
      rgb[to + 1] = bytes[colour + 1];
      rgb[to + 2] = bytes[colour];
    }
  };
  const short = () => new Error("the Targa ends inside its picture: the file is cut short");
  let nth = 0;
  while (nth < width * height) {
    if (!packed) {
      if (at + each > bytes.length) throw short();
      put(nth++, at);
      at += each;
      continue;
    }
    // a run: its length, then one pixel to repeat or that many pixels
    if (at >= bytes.length) throw short();
    const head = bytes[at++];
    const run = (head & 127) + 1;
    const repeated = Boolean(head & 128);
    if (at + (repeated ? each : run * each) > bytes.length) throw short();
    for (let step = 0; step < run && nth < width * height; step++) {
      put(nth++, at);
      if (!repeated) at += each;
    }
    if (repeated) at += each;
  }
  return { width, height, rgb };
}

/** A side's file read as `{ width, height, rgb }`, whichever kind it is. */
function sideOf(file) {
  const bytes = readFileSync(file);
  if (!/\.bmp$/i.test(file)) return readTga(bytes);
  const read = unbmp(bytes);
  if (read.rgb) return read;
  const rgb = new Uint8Array(read.width * read.height * 3);
  read.pixels.forEach((index, pixel) => rgb.set(read.palette.subarray(index * 3, index * 3 + 3), pixel * 3));
  return { width: read.width, height: read.height, rgb };
}

/** The skies read so far, by their name and where they were looked for. */
const skies = new Map();

/**
 * A sky of the game's folders: `{ name, sides: [{ width, height, rgb } x 6] (in the order of `SKY_SIDES`),
 * files, mean: [r, g, b] }`; or `{ name, sides: null, why }` when a side is not found or not read. `name`
 * is a worldspawn's `skyname`; `folders` the game's, the mod's own first.
 */
export function skyOf(name, folders = []) {
  const key = JSON.stringify([name, folders]);
  if (skies.has(key)) return skies.get(key);
  let made;
  try {
    const files = SKY_SIDES.map((side) => {
      for (const kind of SKY_KINDS) {
        const file = inFolders(folders, `gfx/env/${name}${side}.${kind}`);
        if (file) return file;
      }
      throw new Error(`gfx/env/${name}${side}.tga (or .bmp) is in none of the folders given`);
    });
    const sides = files.map(sideOf);
    const sum = [0, 0, 0];
    let counted = 0;
    for (const side of sides.slice(0, 4))
      for (let at = 0; at < side.rgb.length; at += 3 * MEAN_EVERY) {
        for (let channel = 0; channel < 3; channel++) sum[channel] += side.rgb[at + channel];
        counted++;
      }
    made = { name, sides, files, mean: sum.map((value) => Math.round(value / Math.max(1, counted))) };
  } catch (error) {
    made = { name, sides: null, why: error.message };
  }
  skies.set(key, made);
  return made;
}

/**
 * The colour of a sky along a way out of the eye (`x`, `y`, `z`: of any length), written into `out` as
 * three numbers; the four pixels about the point are mixed. The side is the one the way leans to most, and
 * the place on it as the engine lays its sides out.
 */
export function skyColour(sky, x, y, z, out = [0, 0, 0]) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let side;
  let across;
  let upward;
  if (ax >= ay && ax >= az) {
    side = x > 0 ? 0 : 1;
    across = (x > 0 ? -y : y) / ax;
    upward = z / ax;
  } else if (ay >= az) {
    side = y > 0 ? 2 : 3;
    across = (y > 0 ? x : -x) / ay;
    upward = z / ay;
  } else {
    side = z > 0 ? 4 : 5;
    across = -y / az;
    upward = (z > 0 ? -x : x) / az;
  }
  const { width, height, rgb } = sky.sides[side];
  const column = Math.min(width - 1, Math.max(0, ((across + 1) / 2) * width - 0.5));
  const row = Math.min(height - 1, Math.max(0, (1 - (upward + 1) / 2) * height - 0.5));
  const column0 = Math.floor(column);
  const row0 = Math.floor(row);
  const column1 = Math.min(width - 1, column0 + 1);
  const row1 = Math.min(height - 1, row0 + 1);
  const shareX = column - column0;
  const shareY = row - row0;
  const a = (row0 * width + column0) * 3;
  const b = (row0 * width + column1) * 3;
  const c = (row1 * width + column0) * 3;
  const d = (row1 * width + column1) * 3;
  for (let channel = 0; channel < 3; channel++) {
    const upper = rgb[a + channel] + (rgb[b + channel] - rgb[a + channel]) * shareX;
    const lower = rgb[c + channel] + (rgb[d + channel] - rgb[c + channel]) * shareX;
    out[channel] = upper + (lower - upper) * shareY;
  }
  return out;
}
