// What a Source model collides as, from its .phy: how many solids, and the text after them that the compiler
// writes for the game (each solid's mass and surfaceprop, a ragdoll's joints and their limits).
//
//   readPhy(bytes)   { solids, mass (kg, all of them), surfaceprops, joints, text }
//
// THE FILE (phyheader_t): its size (16), an id, the number of solids, the model's checksum; then each solid as its
// size and that many bytes (the collision mesh, read by the game's physics, not here); then text in key-value
// blocks: `solid { "index" "0" "mass" "12.5" "surfaceprop" "wood" ... }`, `ragdollconstraint { ... }`, `editparams`.

const HEADER = { size: 0, solidCount: 8, sizeof: 16 };

/** A .phy read for what it says of its solids. */
export function readPhy(bytes) {
  const solids = bytes.readInt32LE(HEADER.solidCount);
  let at = bytes.readInt32LE(HEADER.size) || HEADER.sizeof;
  for (let i = 0; i < solids; i++) at += 4 + bytes.readInt32LE(at);
  const text = bytes.toString("latin1", at).replace(/\0+$/, "");
  const blocks = (name) => [...text.matchAll(new RegExp(`${name}\\s*\\{([^}]*)\\}`, "gi"))].map((m) => Object.fromEntries([...m[1].matchAll(/"([^"]*)"\s*"([^"]*)"/g)].map((kv) => [kv[1].toLowerCase(), kv[2]]))); // prettier-ignore
  const solid = blocks("solid");
  return {
    solids,
    mass: solid.reduce((sum, s) => sum + Number(s.mass ?? 0), 0),
    surfaceprops: [...new Set(solid.map((s) => s.surfaceprop).filter(Boolean))],
    joints: blocks("ragdollconstraint").length,
    text,
  };
}
