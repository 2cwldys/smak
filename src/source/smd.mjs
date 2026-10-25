// Valve's SMD (studiomdl data), the text the Source compiler reads a mesh and an animation from: a skeleton,
// its bones' place at each frame, and, for a mesh, its triangles.
//
//   smdOf({ bones, frames, triangles })   the text of one SMD
//
// THE FILE.
//   version 1
//   nodes          one line a bone: number "name" parent (-1 for a root)
//   skeleton       `time n`, then one line a bone: number x y z rx ry rz, its place from its parent (the
//                  angles in radians, about x, then y, then z: what a GoldSrc bone's six values are)
//   triangles      a mesh's: the material's name, then three corners, each
//                  bone x y z nx ny nz u v [links bone weight ...]
//                  in the model's space at the first frame, counter-clockwise seen from its front; v counted
//                  from the picture's bottom.
// A mesh's SMD has one frame (its rest); an animation's has its frames and no triangles.

/** Decimals a number is written with: a thousandth of a thousandth of a unit is below anything drawn. */
const DECIMALS = 6;
/** A number as the SMD writes it: no "-0", no long tail of a float. */
const num = (v) => {
  const text = (Math.abs(v) < 0.5 * 10 ** -DECIMALS ? 0 : v).toFixed(DECIMALS).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
};
/** A bone's name inside quotes: a quote in it would end it, and is written as an apostrophe. */
const quoted = (name) => `"${String(name).replace(/"/g, "'")}"`;

/**
 * The text of an SMD.
 *   bones:     [{ name, parent }]
 *   frames:    [[for each bone, [x, y, z, rx, ry, rz]]], one at least (a mesh's rest)
 *   triangles: [{ material, corners: [{ bone, p: [x, y, z], n: [x, y, z], uv: [u, v], links?: [[bone, weight]] }] x3 }],
 *              in the model's space, counter-clockwise from the front
 */
export function smdOf({ bones, frames, triangles = [] }) {
  const lines = ["version 1", "nodes"];
  bones.forEach((bone, i) => lines.push(`${i} ${quoted(bone.name)} ${bone.parent}`));
  lines.push("end", "skeleton");
  frames.forEach((frame, time) => {
    lines.push(`time ${time}`);
    frame.forEach((six, i) => lines.push(`${i} ${six.map(num).join(" ")}`));
  });
  lines.push("end");
  if (triangles.length) {
    lines.push("triangles");
    for (const { material, corners } of triangles) {
      lines.push(material);
      for (const { bone, p, n, uv, links } of corners) {
        const linked = links?.length ? ` ${links.length} ${links.map(([b, w]) => `${b} ${num(w)}`).join(" ")}` : "";
        lines.push(`${bone} ${p.map(num).join(" ")} ${n.map(num).join(" ")} ${uv.map(num).join(" ")}${linked}`);
      }
    }
    lines.push("end");
  }
  return `${lines.join("\n")}\n`;
}
