// The convex hull of a model's points: the one closed solid a physics prop collides as. Source's compiler makes a
// hull of a collision mesh only when the mesh is one closed piece; a model of several (a barrel's body, lid and
// hoops) is refused without $concave, and with it collides as each piece apart. So the kit makes the one hull.
//
//   convexHull(points)   -> { points, faces: [[a, b, c]] } counter-clockwise from outside, or null (all in a plane)
//
// Incremental: a tetrahedron of four points far apart, then each point outside the hull so far takes the faces
// it sees away and is joined to the edge of what it saw (the horizon). Points are merged within a ten-thousandth
// of the model's size first.
import { sub, dot, cross } from "../vec.mjs";

/** A plane through three points: [n, d], n of length 1 (0 for three in a line), dot(n, p) = d on it. */
const planeOf = (a, b, c) => {
  const m = cross(sub(b, a), sub(c, a));
  const length = Math.hypot(...m);
  const n = length ? m.map((v) => v / length) : [0, 0, 0];
  return [n, dot(n, a)];
};

/** The convex hull of some points ([x, y, z]); null when they lie in a plane or on a line. */
export function convexHull(input) {
  if (input.length < 4) return null;
  const size = Math.max(...[0, 1, 2].map((axis) => Math.max(...input.map((p) => p[axis])) - Math.min(...input.map((p) => p[axis])))); // prettier-ignore
  if (!(size > 0)) return null;
  const grain = size * 1e-4;
  const seen = new Map();
  for (const p of input) seen.set(p.map((v) => Math.round(v / grain)).join(), p);
  const points = [...seen.values()];
  const eps = size * 1e-6;

  // four points far apart: the least x, the farthest from it, the farthest from their line, from their plane
  const far = (score) => points.reduce((best, p, i) => (score(p) > score(points[best]) ? i : best), 0);
  const a = far((p) => -p[0]);
  const b = far((p) => Math.hypot(...sub(p, points[a])));
  const line = sub(points[b], points[a]);
  const c = far((p) => Math.hypot(...cross(line, sub(p, points[a]))));
  const [n0, d0] = planeOf(points[a], points[b], points[c]);
  const d = far((p) => Math.abs(dot(n0, p) - d0));
  if (Math.abs(dot(n0, points[d]) - d0) <= eps || Math.hypot(...n0) <= eps) return null;

  const faces = new Set();
  const face = (i, j, k) => {
    const [n, dd] = planeOf(points[i], points[j], points[k]);
    const f = { v: [i, j, k], n, d: dd };
    faces.add(f);
    return f;
  };
  // the tetrahedron, each face turned to look away from the fourth point
  const inside = [0, 1, 2].map((axis) => (points[a][axis] + points[b][axis] + points[c][axis] + points[d][axis]) / 4);
  for (const [i, j, k] of [[a, b, c], [a, c, d], [a, d, b], [b, d, c]]) {
    const f = face(i, j, k);
    if (dot(f.n, inside) - f.d > 0) {
      faces.delete(f);
      face(i, k, j);
    }
  }

  points.forEach((p, index) => {
    if ([a, b, c, d].includes(index)) return;
    const visible = [...faces].filter((f) => dot(f.n, p) - f.d > eps);
    if (!visible.length) return;
    const edges = new Set(visible.flatMap((f) => [0, 1, 2].map((e) => `${f.v[e]},${f.v[(e + 1) % 3]}`)));
    for (const f of visible) faces.delete(f);
    for (const edge of edges) {
      const [i, j] = edge.split(",").map(Number);
      // an edge of the horizon: the face across it is not seen
      if (!edges.has(`${j},${i}`)) face(i, j, index);
    }
  });

  // the points the faces use, numbered anew
  const used = new Map();
  const out = [];
  const number = (i) => {
    if (!used.has(i)) used.set(i, out.push(points[i]) - 1);
    return used.get(i);
  };
  return { points: out, faces: [...faces].map((f) => f.v.map(number)) };
}
