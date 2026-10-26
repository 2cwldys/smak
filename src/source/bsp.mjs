// Source's maps (BSP version 20, what GMod loads) written from lumps already packed as bytes, the small pieces
// of packing every lump needs, and the file read back into its lumps.
//
//   writeSourceBsp(lumps, { revision })   the whole file: `lumps` maps a lump number to its bytes
//   readSourceBsp(bytes)                  { version, revision, lumps: [{ version, bytes }] } (64 of them)
//   Packer                                a growing little-endian buffer for one lump
//   colorRgbExp(r, g, b, out, at)         one light value as ColorRGBExp32
//   visibilityLump(pvs, pas)              the visibility rows as the lump
//   storedZip(files)                      an uncompressed zip, what Source reads as a map's PAKFILE
//   SOURCE_LUMP SURF CONTENTS             the lumps' numbers, texinfo flags and contents
//
// Ported from stevenlafl's map converter for their port of The Specialists to GMod (tools/map/source-bsp.mjs).
// The layouts are Source SDK 2013's src/public/bspfile.h.
//
// THE FILE. A header of the ident "VBSP", the version, 64 lump entries ({ offset, length, version, fourCC })
// and the map's revision; then the lumps, each started on 4 bytes. A lump that is not given is empty, its
// offset where it would have been.

export const SOURCE_BSP_VERSION = 20;
const IDENT = 0x50534256; // "VBSP"
const HEADER_LUMPS = 64;
const HEADER_SIZE = 8 + HEADER_LUMPS * 16 + 4;

export const SOURCE_LUMP = {
  ENTITIES: 0,
  PLANES: 1,
  TEXDATA: 2,
  VERTEXES: 3,
  VISIBILITY: 4,
  NODES: 5,
  TEXINFO: 6,
  FACES: 7,
  LIGHTING: 8,
  OCCLUSION: 9,
  LEAFS: 10,
  EDGES: 12,
  SURFEDGES: 13,
  MODELS: 14,
  WORLDLIGHTS: 15,
  LEAFFACES: 16,
  LEAFBRUSHES: 17,
  BRUSHES: 18,
  BRUSHSIDES: 19,
  AREAS: 20,
  AREAPORTALS: 21,
  ORIGINALFACES: 27,
  PHYSCOLLIDE: 29,
  VERTNORMALS: 30,
  VERTNORMALINDICES: 31,
  GAME_LUMP: 35,
  PAKFILE: 40,
  TEXDATA_STRING_DATA: 43,
  TEXDATA_STRING_TABLE: 44,
  LEAF_AMBIENT_INDEX_HDR: 51,
  LEAF_AMBIENT_INDEX: 52,
  LIGHTING_HDR: 53,
  LEAF_AMBIENT_LIGHTING_HDR: 55,
  LEAF_AMBIENT_LIGHTING: 56,
  FACES_HDR: 58,
};

// the lumps whose layout has a version (bspfile.h, "Lumps that have versions are listed here")
const LUMP_VERSIONS = {
  [SOURCE_LUMP.LIGHTING]: 1,
  [SOURCE_LUMP.FACES]: 1,
  [SOURCE_LUMP.OCCLUSION]: 2,
  [SOURCE_LUMP.LEAFS]: 1,
  [SOURCE_LUMP.LEAF_AMBIENT_LIGHTING]: 1,
  [SOURCE_LUMP.LIGHTING_HDR]: 1,
  [SOURCE_LUMP.FACES_HDR]: 1,
  [SOURCE_LUMP.LEAF_AMBIENT_LIGHTING_HDR]: 1,
};

/** The texinfo flags (bspflags.h SURF_*). */
export const SURF = {
  LIGHT: 0x1,
  SKY2D: 0x2,
  SKY: 0x4,
  WARP: 0x8,
  TRANS: 0x10,
  TRIGGER: 0x40,
  NODRAW: 0x80,
  NOLIGHT: 0x400,
};

/** The contents (bspflags.h CONTENTS_*). */
export const CONTENTS = {
  EMPTY: 0,
  SOLID: 0x1,
  WINDOW: 0x2,
  SLIME: 0x10,
  WATER: 0x20,
  PLAYERCLIP: 0x10000,
  MONSTERCLIP: 0x20000,
  LADDER: 0x20000000,
};

/** A growing little-endian buffer for one lump. */
export class Packer {
  constructor() {
    this.buf = Buffer.alloc(1024);
    this.at = 0;
  }
  room(n) {
    if (this.at + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.at + n) size *= 2;
    const grown = Buffer.alloc(size);
    this.buf.copy(grown, 0, 0, this.at);
    this.buf = grown;
  }
  i32(v) {
    this.room(4);
    this.buf.writeInt32LE(v, this.at);
    this.at += 4;
    return this;
  }
  u32(v) {
    this.room(4);
    this.buf.writeUInt32LE(v >>> 0, this.at);
    this.at += 4;
    return this;
  }
  i16(v) {
    this.room(2);
    this.buf.writeInt16LE(v, this.at);
    this.at += 2;
    return this;
  }
  u16(v) {
    this.room(2);
    this.buf.writeUInt16LE(v, this.at);
    this.at += 2;
    return this;
  }
  u8(v) {
    this.room(1);
    this.buf[this.at++] = v;
    return this;
  }
  f32(v) {
    this.room(4);
    this.buf.writeFloatLE(v, this.at);
    this.at += 4;
    return this;
  }
  vec(v) {
    return this.f32(v[0]).f32(v[1]).f32(v[2]);
  }
  bytes(b) {
    this.room(b.length);
    Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.length).copy(this.buf, this.at);
    this.at += b.length;
    return this;
  }
  done() {
    return this.buf.subarray(0, this.at);
  }
}

/** One light value as ColorRGBExp32: r g b bytes and a shared power of two, `value = byte * 2^exp / 255`. */
export function colorRgbExp(r, g, b, out, at) {
  const most = Math.max(r, g, b);
  if (most <= 0) {
    out.writeUInt32LE(0, at);
    return;
  }
  const exp = Math.max(-128, Math.min(127, Math.ceil(Math.log2(most / 255))));
  const scale = 2 ** -exp;
  out[at] = Math.min(255, Math.round(r * scale));
  out[at + 1] = Math.min(255, Math.round(g * scale));
  out[at + 2] = Math.min(255, Math.round(b * scale));
  out.writeInt8(exp, at + 3);
}

/** The visibility rows (a Uint8Array of cluster bits for each cluster, for the PVS and the PAS) as the lump. */
export function visibilityLump(pvs, pas) {
  const clusters = pvs.length;
  const head = 4 + clusters * 8;
  const parts = [];
  const offsets = [];
  let size = head;
  for (let c = 0; c < clusters; c++) {
    const a = runLength(pvs[c]);
    const b = runLength(pas[c]);
    offsets.push([size, size + a.length]);
    parts.push(a, b);
    size += a.length + b.length;
  }
  const out = Buffer.alloc(size);
  out.writeInt32LE(clusters, 0);
  offsets.forEach(([p, q], c) => {
    out.writeInt32LE(p, 4 + c * 8);
    out.writeInt32LE(q, 8 + c * 8);
  });
  let at = head;
  for (const part of parts) {
    part.copy(out, at);
    at += part.length;
  }
  return out;
}

// Quake's run-length packing: a zero byte is followed by how many zero bytes it stands for
function runLength(row) {
  const out = [];
  for (let i = 0; i < row.length; i++) {
    if (row[i]) {
      out.push(row[i]);
      continue;
    }
    let run = 1;
    while (i + run < row.length && !row[i + run] && run < 255) run++;
    out.push(0, run);
    i += run - 1;
  }
  return Buffer.from(out);
}

// the zip's CRC-32 (node:zlib has one only from Node 22.2)
let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An uncompressed zip, what Source reads as a map's PAKFILE: `files` is [{ name, bytes }]. */
export function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const nameBytes = Buffer.from(name, "latin1");
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(10, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(10, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, Buffer.from(bytes));
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + bytes.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** The whole file: `lumps` maps a lump number to its bytes; a lump not given is empty. */
export function writeSourceBsp(lumps, { revision = 1 } = {}) {
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeInt32LE(IDENT, 0);
  header.writeInt32LE(SOURCE_BSP_VERSION, 4);
  const parts = [header];
  let at = HEADER_SIZE;
  for (let id = 0; id < HEADER_LUMPS; id++) {
    const data = lumps[id];
    const entry = 8 + id * 16;
    header.writeInt32LE(LUMP_VERSIONS[id] ?? 0, entry + 8);
    header.writeInt32LE(at, entry);
    if (!data || !data.length) continue;
    header.writeInt32LE(data.length, entry + 4);
    parts.push(data);
    at += data.length;
    const pad = (4 - (at % 4)) % 4;
    if (pad) {
      parts.push(Buffer.alloc(pad));
      at += pad;
    }
  }
  header.writeInt32LE(revision, 8 + HEADER_LUMPS * 16);
  return Buffer.concat(parts);
}

/** A Source map's lumps: `{ version, revision, lumps: [{ version, bytes }] }`, 64 of them. */
export function readSourceBsp(bytes) {
  const buf = Buffer.from(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.length);
  if (buf.length < HEADER_SIZE || buf.readInt32LE(0) !== IDENT) throw new Error("not a Source map: no VBSP at its start");
  const lumps = [];
  for (let id = 0; id < HEADER_LUMPS; id++) {
    const entry = 8 + id * 16;
    const offset = buf.readInt32LE(entry);
    const length = buf.readInt32LE(entry + 4);
    if (offset < 0 || length < 0 || offset + length > buf.length) throw new Error(`lump ${id} runs past the end of the file`);
    lumps.push({ version: buf.readInt32LE(entry + 8), bytes: buf.subarray(offset, offset + length) });
  }
  return { version: buf.readInt32LE(4), revision: buf.readInt32LE(8 + HEADER_LUMPS * 16), lumps };
}
