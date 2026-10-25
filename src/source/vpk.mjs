// Valve's packs (.vpk, versions 1 and 2): where Source games keep their files (GMod's
// sourceengine/hl2_misc_dir.vpk holds Half-Life 2's models and materials). Read only.
//
//   openVpk(dirFile)    { files: [path], has(path), read(path) -> Buffer }
//
// THE FILES. `<name>_dir.vpk` holds the tree: for each extension, each folder, each file name, where its bytes
// are: in one of the numbered archives beside it (`<name>_000.vpk` ...), or after the tree in the _dir file itself
// (archive 0x7fff); a few bytes of each may be kept in the tree itself first ("preload"). A path is written in the
// tree in lower case, with forward slashes; one asked for is found in any case.
import { openSync, readSync, closeSync, readFileSync } from "node:fs";

const SIGNATURE = 0x55aa1234;
/** The header's length by version: 1 has signature, version and tree size; 2 four more numbers. */
const HEADER = { 1: 12, 2: 28 };
/** An entry whose bytes are in the _dir file, after the tree. */
const IN_DIR = 0x7fff;
const TERMINATOR = 0xffff;

/** A path as the tree keeps it. */
const keyOf = (path) => path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();

/** A pack opened from its _dir file: its file list, and each file's bytes when asked for. */
export function openVpk(dirFile) {
  const dir = readFileSync(dirFile);
  if (dir.readUInt32LE(0) !== SIGNATURE) throw new Error(`${dirFile} is not a VPK (no signature)`);
  const version = dir.readUInt32LE(4);
  if (!HEADER[version]) throw new Error(`${dirFile}: a VPK of version ${version}, where 1 and 2 are read`);
  const treeSize = dir.readUInt32LE(8);
  const treeAt = HEADER[version];
  const dataAt = treeAt + treeSize;
  let at = treeAt;
  const string = () => {
    const end = dir.indexOf(0, at);
    const text = dir.toString("latin1", at, end);
    at = end + 1;
    return text;
  };
  const entries = new Map();
  for (let ext = string(); ext; ext = string())
    for (let folder = string(); folder; folder = string())
      for (let name = string(); name; name = string()) {
        const preload = dir.readUInt16LE(at + 4);
        const entry = {
          archive: dir.readUInt16LE(at + 6),
          offset: dir.readUInt32LE(at + 8),
          length: dir.readUInt32LE(at + 12),
          preloadAt: at + 18,
          preload,
        };
        if (dir.readUInt16LE(at + 16) !== TERMINATOR) throw new Error(`${dirFile}: an entry not ended where it should be`);
        at += 18 + preload;
        const path = `${folder === " " ? "" : `${folder}/`}${name}${ext === " " ? "" : `.${ext}`}`;
        entries.set(keyOf(path), entry);
      }
  const archiveOf = (n) => dirFile.replace(/_dir\.vpk$/i, `_${String(n).padStart(3, "0")}.vpk`);
  return {
    files: [...entries.keys()],
    has: (path) => entries.has(keyOf(path)),
    read(path) {
      const entry = entries.get(keyOf(path));
      if (!entry) throw new Error(`${path} is not in ${dirFile}`);
      const head = dir.subarray(entry.preloadAt, entry.preloadAt + entry.preload);
      if (!entry.length) return Buffer.from(head);
      const rest = Buffer.alloc(entry.length);
      if (entry.archive === IN_DIR) dir.copy(rest, 0, dataAt + entry.offset, dataAt + entry.offset + entry.length);
      else {
        const fd = openSync(archiveOf(entry.archive), "r");
        try {
          readSync(fd, rest, 0, entry.length, entry.offset);
        } finally {
          closeSync(fd);
        }
      }
      return Buffer.concat([head, rest]);
    },
  };
}
