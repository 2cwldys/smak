// Source's textures (.vtf, version 7.2) written and read, with no VTFLib and no vtex.
//
//   writeVtf({ width, height, rgba }, { alpha })   a picture as a VTF: its size a power of two each way, every mip
//                                                    level down to 1 by 1, a thumbnail
//   readVtf(bytes)                                  the largest picture of a VTF: { width, height, rgba, format, flags }
//   powerOfTwo({ width, height, rgba }, { alpha })   a picture resampled to the nearest powers of two (up)
//
// THE FILE. An 80-byte header (VTFFileHeader_t of the SDK's vtf.h, 7.2), a small thumbnail the engine samples
// for the colour of a surface (its first level of 16 a side or less, BGR888), then the picture at each mip level from the
// smallest to the largest. A picture whose size is no power of two is resampled before it is written: the
// engine's mip levels halve the size, and a texture of GoldSrc may be 200 by 150.
//
// THE FORMATS written are uncompressed, so that what is written is what was given: BGR888 for a picture with
// no holes, BGRA8888 for one with (alpha), the ONEBITALPHA flag when its alpha is only 0 or 255. DXT is smaller
// and is what Valve ships; it changes the colours, and is not needed for a port of pictures this small.

// ── the format ─────────────────────────────────────────────────────────────
const SIGNATURE = "VTF\0";
const VERSION = [7, 2];
const HEADER_SIZE = 80;
// VTFFileHeader_t, 7.2 (packed; the header is padded to 80 bytes)
const HDR = {
  signature: 0,
  version: 4, // uint[2]
  headerSize: 12,
  width: 16, // ushort
  height: 18,
  flags: 20, // uint
  frames: 24, // ushort
  firstFrame: 26,
  reflectivity: 32, // float[3]
  bumpScale: 48, // float
  format: 52, // the picture's format
  mipCount: 56, // uchar
  lowFormat: 57, // the thumbnail's format, -1: none
  lowWidth: 61, // uchar
  lowHeight: 62,
  depth: 63, // ushort
};
/** The picture formats of the SDK's ImageFormat that are read or written here. */
export const VTF_FORMAT = { RGBA8888: 0, ABGR8888: 1, RGB888: 2, BGR888: 3, BGRA8888: 12, DXT1: 13, DXT3: 14, DXT5: 15, BGRX8888: 16 };
/** Bytes a pixel of each uncompressed format. */
const BYTES = { 0: 4, 1: 4, 2: 3, 3: 3, 12: 4, 16: 4 };
/** The texture flags of vtf.h that are written. */
export const VTF_FLAG = { POINTSAMPLE: 0x1, TRILINEAR: 0x2, CLAMPS: 0x4, CLAMPT: 0x8, NORMAL: 0x80, NOMIP: 0x100, NOLOD: 0x200, ONEBITALPHA: 0x1000, EIGHTBITALPHA: 0x2000 }; // prettier-ignore
/** The largest side of the thumbnail written. */
const THUMBNAIL = 16;
/** No thumbnail: IMAGE_FORMAT_NONE. */
const NO_FORMAT = 0xffffffff;
/** An alpha at or over this is solid, under it a hole, when a picture is resampled with holes. */
const HALF = 128;

const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;
const nextPowerOfTwo = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/**
 * The picture resampled to the next power of two each way (the same picture when it is one already), by
 * bilinear sampling over its pixels' centres. With `alpha` (a picture with holes), each sample's alpha is made
 * 0 or 255 again, and a hole's colour does not run into its neighbours'.
 */
export function powerOfTwo({ width, height, rgba }, { alpha = false } = {}) {
  if (isPowerOfTwo(width) && isPowerOfTwo(height)) return { width, height, rgba };
  const W = nextPowerOfTwo(width);
  const H = nextPowerOfTwo(height);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(width - 1, Math.max(0, ((x + 0.5) * width) / W - 0.5));
      const sy = Math.min(height - 1, Math.max(0, ((y + 0.5) * height) / H - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const corners = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy],
      ];
      const sum = [0, 0, 0, 0];
      let weight = 0;
      for (const [cx, cy, w] of corners) {
        const at = (cy * width + cx) * 4;
        // a hole's colour is no colour: the solid corners alone give the colour
        const solid = alpha ? (rgba[at + 3] >= HALF ? w : 0) : w;
        for (let c = 0; c < 3; c++) sum[c] += rgba[at + c] * solid;
        sum[3] += rgba[at + 3] * w;
        weight += solid;
      }
      const to = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) out[to + c] = Math.round(weight ? sum[c] / weight : 0);
      out[to + 3] = alpha ? (sum[3] >= HALF ? 255 : 0) : Math.round(sum[3]);
    }
  return { width: W, height: H, rgba: out };
}

/** The next mip level: each 2 by 2 block (or 2 by 1, at a thin end) its mean, holes kept out of the colour. */
function halved({ width, height, rgba }, alpha) {
  const W = Math.max(1, width >> 1);
  const H = Math.max(1, height >> 1);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sum = [0, 0, 0, 0];
      let solid = 0;
      let count = 0;
      for (let dy = 0; dy < (height > 1 ? 2 : 1); dy++)
        for (let dx = 0; dx < (width > 1 ? 2 : 1); dx++) {
          const at = ((y * 2 + dy) * width + (x * 2 + dx)) * 4;
          const w = !alpha || rgba[at + 3] >= HALF ? 1 : 0;
          for (let c = 0; c < 3; c++) sum[c] += rgba[at + c] * w;
          sum[3] += rgba[at + 3];
          solid += w;
          count++;
        }
      const to = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) out[to + c] = Math.round(solid ? sum[c] / solid : 0);
      const mean = sum[3] / count;
      out[to + 3] = alpha ? (mean >= HALF ? 255 : 0) : Math.round(mean);
    }
  return { width: W, height: H, rgba: out };
}

/** A picture's pixels in a format: BGR888 or BGRA8888. */
function pixelsIn({ width, height, rgba }, format) {
  const bytes = BYTES[format];
  const out = Buffer.alloc(width * height * bytes);
  for (let i = 0; i < width * height; i++) {
    out[i * bytes] = rgba[i * 4 + 2];
    out[i * bytes + 1] = rgba[i * 4 + 1];
    out[i * bytes + 2] = rgba[i * 4];
    if (bytes === 4) out[i * bytes + 3] = rgba[i * 4 + 3];
  }
  return out;
}

// With `keepHoles`, each smaller level is made from the full picture: a pixel is solid when a quarter of the
// block under it is, its colour the solid ones' mean. Halved level by level, a bar one or two pixels wide
// falls under half within a mip or two and a fence's bars vanished at a distance in GMod; GoldSrc keeps a
// block solid unless it is mostly holes (stevenlafl's finding, their tools/vtf.mjs).
const SOLID_SHARE = 0.25;
function shrunkKeepingSolid({ width, height, rgba }, level) {
  const step = 1 << level;
  const W = Math.max(1, width >> level);
  const H = Math.max(1, height >> level);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const solidSum = [0, 0, 0];
      const allSum = [0, 0, 0];
      let solid = 0;
      let count = 0;
      for (let dy = 0; dy < step; dy++)
        for (let dx = 0; dx < step; dx++) {
          const at = (Math.min(height - 1, y * step + dy) * width + Math.min(width - 1, x * step + dx)) * 4;
          for (let c = 0; c < 3; c++) allSum[c] += rgba[at + c];
          count++;
          if (rgba[at + 3] < HALF) continue;
          for (let c = 0; c < 3; c++) solidSum[c] += rgba[at + c];
          solid++;
        }
      const to = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) out[to + c] = Math.round(solid ? solidSum[c] / solid : allSum[c] / count);
      out[to + 3] = solid >= count * SOLID_SHARE ? 255 : 0;
    }
  return { width: W, height: H, rgba: out };
}

/**
 * The holes of a picture (alpha 0) given their solid neighbours' colour, ring by ring outward, in place.
 * GoldSrc marks a hole with its palette's last colour (often pure blue) and draws it with a hard mask; left in,
 * that colour runs into the solid edge once Source filters it (a blue rim round bullet holes, stevenlafl saw).
 */
export function bleedHoles(rgba, width, height) {
  let filled = Array.from({ length: width * height }, (_, i) => rgba[i * 4 + 3] > 0);
  for (let ring = 0; ring < Math.max(width, height); ring++) {
    const next = filled.slice();
    let any = false;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (filled[i]) continue;
        const sum = [0, 0, 0];
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !filled[ny * width + nx]) continue;
          for (let c = 0; c < 3; c++) sum[c] += rgba[(ny * width + nx) * 4 + c];
          n++;
        }
        if (!n) continue;
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(sum[c] / n);
        next[i] = true;
        any = true;
      }
    filled = next;
    if (!any) break;
  }
  return rgba;
}

/**
 * A picture ({ width, height, rgba }) as a VTF. `alpha`: it has holes (alpha 0 or 255), written BGRA8888 with
 * ONEBITALPHA; "smooth", a graded alpha (EIGHTBITALPHA: a sprite whose edge fades); else BGR888 and its alpha
 * dropped. `flags`: more of VTF_FLAG. `keepHoles`: smaller levels keep a pixel solid when a quarter of the block
 * under it is (a fence's thin bars). `frames`: an animation's pictures, all of the first's size (a map's
 * sprites cycle through them). A size that is no power of two is resampled up to one (powerOfTwo).
 */
export function writeVtf(picture, { alpha = false, flags = 0, keepHoles = false, frames = [picture] } = {}) {
  const holes = alpha === true;
  const chains = frames.map((frame) => {
    const top = powerOfTwo(frame, { alpha: holes });
    const chain = [top];
    while (chain.at(-1).width > 1 || chain.at(-1).height > 1)
      chain.push(keepHoles && holes ? shrunkKeepingSolid(top, chain.length) : halved(chain.at(-1), holes));
    return chain;
  });
  const levels = chains[0];
  const top = levels[0];
  const format = alpha ? VTF_FORMAT.BGRA8888 : VTF_FORMAT.BGR888;

  const head = Buffer.alloc(HEADER_SIZE);
  head.write(SIGNATURE, HDR.signature, "latin1");
  head.writeUInt32LE(VERSION[0], HDR.version);
  head.writeUInt32LE(VERSION[1], HDR.version + 4);
  head.writeUInt32LE(HEADER_SIZE, HDR.headerSize);
  head.writeUInt16LE(top.width, HDR.width);
  head.writeUInt16LE(top.height, HDR.height);
  head.writeUInt32LE((alpha === "smooth" ? VTF_FLAG.EIGHTBITALPHA : alpha ? VTF_FLAG.ONEBITALPHA : 0) | flags, HDR.flags);
  head.writeUInt16LE(frames.length, HDR.frames);
  head.writeUInt16LE(0, HDR.firstFrame);
  // the reflectivity: the picture's mean colour, linear (what the light compiler bounces off it)
  const mean = [0, 0, 0];
  for (let i = 0; i < top.width * top.height; i++)
    for (let c = 0; c < 3; c++) mean[c] += (top.rgba[i * 4 + c] / 255) ** 2.2;
  mean.forEach((sum, c) => head.writeFloatLE(sum / (top.width * top.height), HDR.reflectivity + c * 4));
  head.writeFloatLE(1, HDR.bumpScale);
  head.writeUInt32LE(format, HDR.format);
  head[HDR.mipCount] = levels.length;
  // the thumbnail: the first level no more than 16 a side, as vtex writes one. The engine samples it for the colour
  // of what a bullet hits (HL2's impact chips and dust, GetLowResColorSample); with none it gives no colour, and
  // the chips off a converted map's concrete came out yellow, like antlion blood (2026-10-25)
  const thumb = levels.find((level) => level.width <= THUMBNAIL && level.height <= THUMBNAIL);
  head.writeUInt32LE(VTF_FORMAT.BGR888, HDR.lowFormat);
  head[HDR.lowWidth] = thumb.width;
  head[HDR.lowHeight] = thumb.height;
  head.writeUInt16LE(1, HDR.depth);
  // the thumbnail, then the smallest level first, each level's frames in order
  const parts = [head, pixelsIn(thumb, VTF_FORMAT.BGR888)];
  for (let level = levels.length - 1; level >= 0; level--) for (const chain of chains) parts.push(pixelsIn(chain[level], format));
  return Buffer.concat(parts);
}

/** The bytes of one level of a picture in a format. */
function levelBytes(format, width, height) {
  if (format === VTF_FORMAT.DXT1) return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 8;
  if (format === VTF_FORMAT.DXT3 || format === VTF_FORMAT.DXT5)
    return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 16;
  if (BYTES[format]) return width * height * BYTES[format];
  throw new Error(`a VTF picture of format ${format}, which is not read here`);
}

/** A 16-bit colour of a DXT block as [r, g, b]. */
const rgb565 = (v) => [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31].map(Math.round); // prettier-ignore

/** One DXT colour block's 16 colours, written into rgba at the block's place. */
function colourBlock(bytes, at, rgba, width, height, bx, by, oneBit) {
  const c0 = bytes.readUInt16LE(at);
  const c1 = bytes.readUInt16LE(at + 2);
  const a = rgb565(c0);
  const b = rgb565(c1);
  const four = !oneBit || c0 > c1;
  const palette = [
    [...a, 255],
    [...b, 255],
    four ? [...a.map((v, i) => Math.round((2 * v + b[i]) / 3)), 255] : [...a.map((v, i) => Math.round((v + b[i]) / 2)), 255],
    four ? [...a.map((v, i) => Math.round((v + 2 * b[i]) / 3)), 255] : [0, 0, 0, 0],
  ];
  const bits = bytes.readUInt32LE(at + 4);
  for (let i = 0; i < 16; i++) {
    const x = bx + (i % 4);
    const y = by + Math.floor(i / 4);
    if (x >= width || y >= height) continue;
    const colour = palette[(bits >> (i * 2)) & 3];
    rgba.set(colour, (y * width + x) * 4);
  }
}

/** One DXT5 alpha block written into the alpha of rgba at the block's place. */
function alphaBlock(bytes, at, rgba, width, height, bx, by) {
  const a0 = bytes[at];
  const a1 = bytes[at + 1];
  const values = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) values.push(Math.round(((7 - i) * a0 + i * a1) / 7));
  else {
    for (let i = 1; i < 5; i++) values.push(Math.round(((5 - i) * a0 + i * a1) / 5));
    values.push(0, 255);
  }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(bytes[at + 2 + i]) << BigInt(8 * i);
  for (let i = 0; i < 16; i++) {
    const x = bx + (i % 4);
    const y = by + Math.floor(i / 4);
    if (x >= width || y >= height) continue;
    rgba[(y * width + x) * 4 + 3] = values[Number((bits >> BigInt(3 * i)) & 7n)];
  }
}

/** A level's pixels in a format, as RGBA. */
function rgbaOfLevel(bytes, at, format, width, height) {
  const rgba = new Uint8Array(width * height * 4);
  if (format === VTF_FORMAT.DXT1 || format === VTF_FORMAT.DXT3 || format === VTF_FORMAT.DXT5) {
    const block = format === VTF_FORMAT.DXT1 ? 8 : 16;
    let place = at;
    for (let by = 0; by < height; by += 4)
      for (let bx = 0; bx < width; bx += 4) {
        const colourAt = format === VTF_FORMAT.DXT1 ? place : place + 8;
        colourBlock(bytes, colourAt, rgba, width, height, bx, by, format === VTF_FORMAT.DXT1);
        if (format === VTF_FORMAT.DXT5) alphaBlock(bytes, place, rgba, width, height, bx, by);
        if (format === VTF_FORMAT.DXT3)
          for (let i = 0; i < 16; i++) {
            const x = bx + (i % 4);
            const y = by + Math.floor(i / 4);
            if (x < width && y < height) rgba[(y * width + x) * 4 + 3] = ((bytes[place + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
          }
        place += block;
      }
    return rgba;
  }
  const n = BYTES[format];
  for (let i = 0; i < width * height; i++) {
    const p = at + i * n;
    const [r, g, b, a] =
      format === VTF_FORMAT.RGBA8888 ? [bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]]
      : format === VTF_FORMAT.ABGR8888 ? [bytes[p + 3], bytes[p + 2], bytes[p + 1], bytes[p]]
      : format === VTF_FORMAT.RGB888 ? [bytes[p], bytes[p + 1], bytes[p + 2], 255]
      : format === VTF_FORMAT.BGR888 ? [bytes[p + 2], bytes[p + 1], bytes[p], 255]
      : format === VTF_FORMAT.BGRX8888 ? [bytes[p + 2], bytes[p + 1], bytes[p], 255]
      : [bytes[p + 2], bytes[p + 1], bytes[p], bytes[p + 3]]; // prettier-ignore
    rgba.set([r, g, b, a], i * 4);
  }
  return rgba;
}

/**
 * A VTF's largest picture (its first frame, face and slice): { width, height, rgba, format, flags, mips }. The
 * formats read are the uncompressed ones above and DXT1, DXT3 and DXT5. Versions 7.0 to 7.5; a 7.3 and later
 * file's resources are read for where its picture is.
 */
export function readVtf(bytes) {
  if (bytes.toString("latin1", 0, 4) !== SIGNATURE) throw new Error("not a VTF (no VTF signature)");
  const minor = bytes.readUInt32LE(HDR.version + 4);
  const headerSize = bytes.readUInt32LE(HDR.headerSize);
  const width = bytes.readUInt16LE(HDR.width);
  const height = bytes.readUInt16LE(HDR.height);
  const flags = bytes.readUInt32LE(HDR.flags);
  const frames = bytes.readUInt16LE(HDR.frames);
  const format = bytes.readUInt32LE(HDR.format);
  const mips = bytes[HDR.mipCount];
  const lowFormat = bytes.readUInt32LE(HDR.lowFormat);
  const lowWidth = bytes[HDR.lowWidth];
  const lowHeight = bytes[HDR.lowHeight];
  const depth = minor >= 2 ? Math.max(1, bytes.readUInt16LE(HDR.depth)) : 1;
  const faces = flags & 0x4000 ? (minor < 5 ? 7 : 6) : 1; // an environment map's faces (and 7.0-7.4's sphere map)
  let dataAt = headerSize + (lowFormat === NO_FORMAT ? 0 : levelBytes(lowFormat, lowWidth, lowHeight));
  if (minor >= 3) {
    // the resource entries after the header's first 80 bytes: { tag[3], flags, offset }
    const count = bytes.readUInt32LE(68);
    for (let i = 0; i < count; i++) {
      const entry = 80 + i * 8;
      if (bytes[entry] === 0x30 && bytes[entry + 1] === 0 && bytes[entry + 2] === 0)
        dataAt = bytes.readUInt32LE(entry + 4);
    }
  }
  // the levels from the smallest: skip all but the largest
  for (let level = mips - 1; level > 0; level--)
    dataAt += levelBytes(format, Math.max(1, width >> level), Math.max(1, height >> level)) * frames * faces * Math.max(1, depth >> level); // prettier-ignore
  return { width, height, rgba: rgbaOfLevel(bytes, dataAt, format, width, height), format, flags, mips };
}
