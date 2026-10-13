// A pot made in the workshop, shared by the cases of the workshop's shapes (05), of bodies (06) and of what
// is worn (07): oval rings along x, a rim that dips at the front, a dome on top and a lining inside. With
// it, the small tools those cases measure triangles with.
import * as smak from "../src/index.mjs";

export const workshop = smak.workshop;

/** The pot's picture is 256 x 256; each part has its own zone of it, in pixels. */
export const ZONES = {
  WALL: { x: 4, y: 4, w: 200, h: 100 },
  CAP: { x: 4, y: 110, w: 60, h: 60 },
  IN: { x: 70, y: 110, w: 130, h: 30 },
  BAR: { x: 70, y: 146, w: 130, h: 14 },
  BOSS: { x: 210, y: 4, w: 20, h: 20 },
  LEAF: { x: 210, y: 30, w: 30, h: 20 },
  TAIL: { x: 4, y: 176, w: 120, h: 40 },
};

/**
 * The pot's three rings, each at a place `s` along x with a radius `r`. The first is an oval (5 by 4) whose
 * front dips 2 units below it (`ds`, strongest at angle 0); the last, at `top`, is marked as a crease.
 */
export const potRings = (top = 9) => [
  { s: 0, r: [5, 4], ds: (angle) => -2 * Math.max(0, Math.cos(angle)) ** 3 },
  [3, 5],
  { s: top, r: 5, crease: true },
];

/**
 * Turns the pot into `shape` and returns its surface: 16 sides, the seam of its picture at the back (angle
 * pi), open below, a dome 3 high on top in the CAP zone, and a lining 0.2 inside the wall in the IN zone.
 */
export const potOf = (shape, top = 9, moreOptions = {}) =>
  shape.turn(potRings(top), ZONES.WALL, {
    name: "pot",
    sides: 16,
    seam: Math.PI,
    caps: [false, { dome: 3, rings: 3, zone: ZONES.CAP }],
    lining: { inset: 0.2, zone: ZONES.IN, to: 1, cap: true },
    ...moreOptions,
  });

/** How many triangles each named part of a shape has: { "pot": 64, "pot.cap1": 80, ... }. */
export const countByPart = (triangles) => {
  const counts = {};
  for (const triangle of triangles) counts[triangle[0].of] = (counts[triangle[0].of] ?? 0) + 1;
  return counts;
};

/** The way a triangle faces, by the turn of its corners (not a unit vector). */
export const facingOf = (triangle) =>
  smak.cross(smak.sub(triangle[1].p, triangle[0].p), smak.sub(triangle[2].p, triangle[0].p));

/** The middle of a triangle. */
export const middleOf = (triangle) =>
  [0, 1, 2].map((axis) => (triangle[0].p[axis] + triangle[1].p[axis] + triangle[2].p[axis]) / 3);

/** How far a point is from the nearest of some triangles. */
export const distanceTo = (point, triangles) => {
  const found = smak.clearance([point], triangles, { centre: [4, 0, 0], sides: "all" });
  return (found.tightest ?? found.worst)?.gap ?? found.worst.out;
};

/** A model of one body from workshop triangles, under a plain grey picture, with no bones given. */
export const plainModel = (name, triangles, width = 256, height = 256, more = {}) =>
  smak.buildMdl({
    name: `${name}.mdl`,
    bodyparts: [
      {
        name: "body",
        models: [
          {
            name,
            meshes: [
              {
                tris: triangles,
                texture: smak.indexed(
                  { width, height, rgb: new Uint8Array(width * height * 3).fill(150) },
                  `${name}.bmp`,
                ),
              },
            ],
          },
        ],
      },
    ],
    ...more,
  });

/** The shape the pot was turned into, the pot's surface (it says where its points are), and its triangles. */
export const potShape = workshop.shape(256, 256);
export const pot = potOf(potShape);
export const potTris = [...potShape.tris];
