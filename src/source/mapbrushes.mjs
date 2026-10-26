// Collision brushes rebuilt from a GoldSrc map's trees, for its Source port (src/source/map.mjs). GoldSrc keeps no
// brushes; Source traces against them. Ported from stevenlafl's tools/map/brushes.mjs.
//
//   regionOf(planes)                                   the convex region behind every plane, or null
//   brushesOfTree(bsp, head, isBrush, mins, maxs)      one brush for each solid or liquid leaf of the drawn tree
//   brushesOfClipHull(bsp, head, half, mins, maxs)     the brushes of a clip hull, shrunk back to the drawn shape
//   clipContents(bsp, head, point)                     GoldSrc's contents at a point of a clip hull
//
// THE DRAWN TREE (hull 0). Each of its solid or liquid leaves is the convex region the planes on the way down to it
// cut out, so each becomes one brush: those planes facing out of it, less the ones that do not touch it, plus
// axial bevels (vbsp adds them so that a box trace does not catch on a slanted brush's corners). A region open to
// the void is closed by a box a little outside the map.
//
// THE CLIP HULLS (1 to 3). GoldSrc's CLIP brushes block players and monsters but not bullets or sight: qcsg builds
// them into the player's hulls only, each brush first grown by the player's box. Each solid region of a hull, its
// sides that face open space moved back in by the box's reach along them, is the brush again.

const ON_EPSILON = 0.01;
const BIG = 65536;
const BOUNDS_MARGIN = 64;
const GS_SOLID = -2;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

// a square on the plane, far bigger than any map (Quake's BaseWindingForPlane)
function baseWinding(n, d) {
  let axis = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(n[i]) > Math.abs(n[axis])) axis = i;
  let up = axis === 2 ? [1, 0, 0] : [0, 0, 1];
  const along = dot(up, n);
  up = unit([up[0] - n[0] * along, up[1] - n[1] * along, up[2] - n[2] * along]);
  const right = cross(up, n);
  const o = [n[0] * d, n[1] * d, n[2] * d];
  const u = up.map((x) => x * BIG);
  const r = right.map((x) => x * BIG);
  return [
    [o[0] - r[0] + u[0], o[1] - r[1] + u[1], o[2] - r[2] + u[2]],
    [o[0] + r[0] + u[0], o[1] + r[1] + u[1], o[2] + r[2] + u[2]],
    [o[0] + r[0] - u[0], o[1] + r[1] - u[1], o[2] + r[2] - u[2]],
    [o[0] - r[0] - u[0], o[1] - r[1] - u[1], o[2] - r[2] - u[2]],
  ];
}

// the part of a winding behind the plane (dot(n, x) <= d)
function clipBehind(w, n, d) {
  const dists = w.map((p) => dot(n, p) - d);
  if (dists.every((x) => x <= ON_EPSILON)) return w;
  if (dists.every((x) => x >= -ON_EPSILON)) return null;
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const p = w[i];
    const q = w[(i + 1) % w.length];
    const dp = dists[i];
    const dq = dists[(i + 1) % w.length];
    if (dp <= ON_EPSILON) out.push(p);
    if ((dp > ON_EPSILON && dq < -ON_EPSILON) || (dp < -ON_EPSILON && dq > ON_EPSILON)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out.length >= 3 ? out : null;
}

/**
 * The convex region bounded by `planes` (each { normal, dist }, the region behind all of them):
 * `{ sides: [index into planes], windings, mins, maxs }`, only the planes that bound it (each side's face in
 * `windings`), or null when it has no volume.
 */
export function regionOf(planes) {
  const sides = [];
  const windings = [];
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < planes.length; i++) {
    let w = baseWinding(planes[i].normal, planes[i].dist);
    for (let j = 0; j < planes.length && w; j++) if (j !== i) w = clipBehind(w, planes[j].normal, planes[j].dist);
    if (!w) continue;
    sides.push(i);
    windings.push(w);
    for (const p of w)
      for (let k = 0; k < 3; k++) {
        if (p[k] < mins[k]) mins[k] = p[k];
        if (p[k] > maxs[k]) maxs[k] = p[k];
      }
  }
  if (sides.length < 4) return null;
  for (let k = 0; k < 3; k++) if (maxs[k] - mins[k] < ON_EPSILON * 10) return null;
  return { sides, windings, mins, maxs };
}

// the box a little outside the map that closes a region open to the void
function boundsBox(worldMins, worldMaxs) {
  const box = [];
  for (let k = 0; k < 3; k++) {
    const n = [0, 0, 0];
    n[k] = 1;
    box.push({ normal: n, dist: worldMaxs[k] + BOUNDS_MARGIN, box: true });
    const m = [0, 0, 0];
    m[k] = -1;
    box.push({ normal: m, dist: -(worldMins[k] - BOUNDS_MARGIN), box: true });
  }
  return box;
}

/**
 * Every brush of one model's drawn tree, walked from node `head`. `isBrush(leaf)` says what a leaf makes: null for
 * none, or the brush's Source contents. Returns `[{ node, side, leafChild, contents, planes: [{ normal, dist,
 * bevel }], mins, maxs }]`, one for each place the tree reaches such a leaf, in walk order; `leafChild` is the
 * node's child (under 0) that reached it, and `node` and `side` where it hangs.
 */
export function brushesOfTree(bsp, head, isBrush, worldMins, worldMaxs) {
  const box = boundsBox(worldMins, worldMaxs);
  const found = [];
  const path = [];
  const walk = (node) => {
    const { plane, children } = bsp.nodes[node];
    const p = bsp.planes[plane];
    for (let side = 0; side < 2; side++) {
      // the front: the region is in front of the plane, so its side faces the other way
      path.push(side === 0 ? { normal: p.normal.map((x) => -x), dist: -p.dist } : { normal: p.normal, dist: p.dist });
      const child = children[side];
      if (child >= 0) walk(child);
      else {
        const contents = isBrush(-1 - child);
        if (contents !== null) {
          const planes = [...path, ...box];
          const region = regionOf(planes);
          if (region)
            found.push({
              node,
              side,
              leafChild: child,
              contents,
              planes: withBevels(region.sides.map((i) => planes[i]), region.mins, region.maxs),
              mins: region.mins,
              maxs: region.maxs,
            });
        }
      }
      path.pop();
    }
  };
  walk(head);
  return found;
}

/** The contents (GoldSrc's, under 0) at point `p` of a model's clip hull, walked from clipnode `head`. */
export function clipContents(bsp, head, p) {
  let n = head;
  while (n >= 0) {
    const { plane, children } = bsp.clipnodes[n];
    const pl = bsp.planes[plane];
    n = children[dot(pl.normal, p) - pl.dist >= 0 ? 0 : 1];
  }
  return n;
}

/**
 * The brushes of a clip hull (hull 1, the standing player's; 3, the ducked one's), as the shape the mapper drew:
 * each solid region of the hull, its sides moved back in by the reach of the box (`half`, its half size) the
 * brushes were grown by, a side against more solid less so. Returns `[{ planes: [{ normal, dist, bevel }], points
 * (its corners), mins, maxs }]`, the drawn world's own brushes among them.
 */
export function brushesOfClipHull(bsp, head, half, worldMins, worldMaxs) {
  const box = boundsBox(worldMins, worldMaxs);
  const found = [];
  const path = [];
  const walk = (node) => {
    const { plane, children } = bsp.clipnodes[node];
    const p = bsp.planes[plane];
    for (let side = 0; side < 2; side++) {
      path.push(side === 0 ? { normal: p.normal.map((x) => -x), dist: -p.dist } : { normal: p.normal, dist: p.dist });
      const child = children[side];
      if (child >= 0) walk(child);
      else if (child === GS_SOLID) {
        const planes = [...path, ...box];
        const grown = regionOf(planes);
        if (grown) {
          const sidePlanes = grown.sides.map((i) => planes[i]);
          const reachOf = (pl) => (pl.box ? 0 : Math.abs(pl.normal[0]) * half[0] + Math.abs(pl.normal[1]) * half[1] + Math.abs(pl.normal[2]) * half[2]); // prettier-ignore
          // how deep solid runs beyond side k, up to the box's reach, sampled across the side as wide as the box
          // reaches past it (each other side pushed out by `out[j]`): a side wholly against more solid (where the
          // tree split one solid apart) stays, one facing open space moves in the whole reach, and one against a
          // layer thinner than the reach, or only partly against solid (an umbrella's canopy over its pole), by
          // what is missing
          const moveIn = (k, out) => {
            const pl = sidePlanes[k];
            if (pl.box) return 0;
            const reach = reachOf(pl);
            const wide = regionOf(sidePlanes.map((o, j) => (j === k ? o : { normal: o.normal, dist: o.dist + out[j] })));
            const at = wide?.sides.indexOf(k) ?? -1;
            const w = at >= 0 ? wide.windings[at] : grown.windings[k];
            const mid = [0, 1, 2].map((c) => w.reduce((sum, v) => sum + v[c], 0) / w.length);
            const probes = [mid];
            for (let v = 0; v < w.length; v++) {
              const a = w[v].map((x, c) => mid[c] + (x - mid[c]) * 0.98);
              const b = w[(v + 1) % w.length].map((x, c) => mid[c] + (x - mid[c]) * 0.98);
              probes.push(a, a.map((x, c) => (x + b[c]) / 2), a.map((x, c) => (x + mid[c]) / 2));
            }
            let depth = reach;
            for (const q of probes) {
              for (let t = 0.5; t < depth; t += 1)
                if (clipContents(bsp, head, q.map((v, c) => v + pl.normal[c] * t)) !== GS_SOLID) {
                  depth = Math.max(0, t - 1);
                  break;
                }
              if (depth === 0) break;
            }
            return reach - depth;
          };
          // first each side over itself, then as wide as the others reach once they have moved in (a side the tree
          // split a thin brush along kept the brush; widened by every side's whole reach, it looked out past the
          // brush's top and moved in, and the fence clip along a balcony was lost)
          const first = sidePlanes.map((_, k) => moveIn(k, sidePlanes.map(() => 0)));
          const out = sidePlanes.map((pl, j) => reachOf(pl) - first[j]);
          const shrunk = sidePlanes.map((pl, k) => {
            const by = Math.max(first[k], moveIn(k, out));
            return by > 0 ? { normal: pl.normal, dist: pl.dist - by } : pl;
          });
          const region = regionOf(shrunk);
          // one against the box round the map holds the void outside it too (hlbsp splits no solid from solid, so
          // a clip brush on the map's edge can share its region with the void): harmless as clip
          if (region)
            found.push({
              planes: withBevels(region.sides.map((i) => shrunk[i]), region.mins, region.maxs),
              points: region.windings.flat(),
              mins: region.mins,
              maxs: region.maxs,
            });
        }
      }
      path.pop();
    }
  };
  walk(head);
  return found;
}

// axial planes at the region's bounds where it has none of its own
function withBevels(sides, mins, maxs) {
  const out = [...sides];
  for (let k = 0; k < 3; k++)
    for (const sign of [1, -1]) {
      if (sides.some((s) => Math.abs(s.normal[k] - sign) < 1e-5)) continue;
      const n = [0, 0, 0];
      n[k] = sign;
      out.push({ normal: n, dist: sign > 0 ? maxs[k] : -mins[k], bevel: true });
    }
  return out;
}
