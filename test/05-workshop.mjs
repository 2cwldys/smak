// The workshop's shapes that know where they are: a turned surface (the pot of fixture-pot.mjs), creases,
// what sits on a surface (a ridge, a band, bosses), a thin sheet seen from both sides, and a tube.
import * as smak from "../src/index.mjs";
import { test, sure, near, inked } from "./helper.mjs";
import {
  workshop,
  ZONES,
  potRings,
  potOf,
  countByPart,
  facingOf,
  middleOf,
  distanceTo,
  plainModel,
  potShape,
  pot,
  potTris,
} from "./fixture-pot.mjs";

test("turn: rings of their own outline, a dome, a lining, a seam where it is told, a picture by the real surface", () => {
  const counts = countByPart(potShape.tris);
  const wall = potShape.tris.filter((triangle) => triangle[0].of === "pot");

  // over 0 when a triangle faces away from the pot's axis (x), under 0 when it faces the axis
  const awayFromAxis = (triangle) => {
    const middle = middleOf(triangle);
    return smak.dot(facingOf(triangle), [0, middle[1], middle[2]]);
  };

  // the parts and their triangles: the wall, the dome, the lining, and the rim that joins wall and lining
  sure(
    counts.pot === 64 && counts["pot.cap1"] === 80 && counts["pot.lining"] === 48 && counts["pot.rim"] === 32,
    JSON.stringify(counts),
  );

  // the wall looks outwards; the lining's upright part (low on the pot, away from the axis) looks inwards
  const liningWall = potShape.tris.filter(
    (triangle) =>
      triangle[0].of === "pot.lining" &&
      Math.abs(middleOf(triangle)[0] - 1.5) < 2 &&
      triangle.every((corner) => Math.hypot(corner.p[1], corner.p[2]) > 3),
  );
  sure(
    wall.every((triangle) => awayFromAxis(triangle) > 0) &&
      liningWall.every((triangle) => awayFromAxis(triangle) < 0),
    "the wall faces outwards and the lining inwards",
  );

  // the first ring's `ds` pulls the rim 2 down at angle 0, which is +y
  const wallCorners = wall.flat();
  const lowest = wallCorners.reduce((least, corner) => (corner.p[0] < least.p[0] ? corner : least));
  near(lowest.p[0], -2, 1e-9, "the rim dips at the front");
  sure(lowest.p[1] > 4.9 && Math.abs(lowest.p[2]) < 1e-9, "the dip is at angle 0");

  // the corners on the top edge of the wall's zone are the seam: all at the back (-y), on the middle line
  sure(
    wallCorners
      .filter((corner) => Math.abs(corner.uv[1] * 256 - ZONES.WALL.y) < 1e-6)
      .every((corner) => corner.p[1] < 0 && Math.abs(corner.p[2]) < 1e-9),
    "the seam is at the back, where it was told",
  );

  // the dome: its top is 3 above the last ring (at 9), it looks along +x, and its length is measured over it
  near(pot.ends[1].p[0], 12, 1e-9, "the dome's top");
  near(pot.ends[1].n[0], 1, 1e-6, "it looks up");
  near(pot.reach[1], 3 + 5 * 0.61, 0.5, "the dome's length over its surface");

  // in the picture the dome is a disc about the middle of the CAP zone (34, 140), 30 pixels in radius
  sure(
    potShape.tris
      .filter((triangle) => triangle[0].of === "pot.cap1")
      .flat()
      .every((corner) => Math.hypot(corner.uv[0] * 256 - 34, corner.uv[1] * 256 - 140) <= 30 + 1e-6),
    "the dome is laid as a disc in its own zone",
  );

  // a short steep shoulder made wide by `at`: the lathe gave it its share of the profile, the turn its share
  // of the surface
  const square = { x: 0, y: 0, w: 60, h: 60 };
  const shareShape = workshop.shape(64, 64);
  const wideShoulder = shareShape.turn(
    [
      [0, 1],
      [1, 1],
      [1.2, 0.2],
    ],
    square,
    { at: (s, a, b) => [s, 5 * a, 5 * b] },
  );
  near(
    wideShoulder.places.rings[1][1],
    1 / (1 + Math.hypot(0.2, 4)),
    0.01,
    "the shoulder's share of the picture",
  );
  // `w` on a ring weighs the band that ends at it: 1 part for the first band, 3 for the second
  near(
    shareShape.turn([[0, 1], [1, 1], { s: 2, r: 1, w: 3 }], square).places.rings[1][1],
    0.25,
    1e-9,
    "a band weighted 3",
  );
  // `px` fixes the pixels a unit: two units at 10 pixels are 20 of the zone's 60
  near(
    shareShape.turn(
      [
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      square,
      { px: 10 },
    ).places.rings[2][1],
    20 / 60,
    1e-9,
    "pixels a unit",
  );

  // laid across its zone (a barrel standing in its picture), with a flat cap at each end
  const acrossShape = workshop.shape(64, 64);
  const standing = acrossShape.turn(
    [
      [0, 1],
      [4, 1],
    ],
    { x: 10, y: 0, w: 40, h: 60 },
    { lie: "across", sides: 4, caps: [{ x: 0, y: 0, w: 8, h: 8 }, true] },
  );
  sure(
    acrossShape.tris
      .filter((triangle) => triangle[0].of === standing.name)
      .flat()
      .every((corner) => (corner.p[0] === 0) === Math.abs(corner.uv[1] * 64 - 60) < 1e-9),
    "laid across, the first ring is at the bottom",
  );
  sure(
    acrossShape.tris.length === 8 + 4 + 4,
    `${acrossShape.tris.length} triangles with a flat cap at each end`,
  );

  // a ring more, the old ones pinned where they were: nothing painted moves
  const ringsWithOneMore = () => [...potRings().slice(0, 2), [6, 5.4], potRings()[2]];
  const pinnedShape = workshop.shape(256, 256);
  const pinned = pinnedShape.turn(ringsWithOneMore(), ZONES.WALL, {
    name: "pot",
    sides: 16,
    seam: Math.PI,
    places: pot.places,
  });
  // the places in the picture of the wall's corners on the ring at `s`, as one text to compare
  const pixelsOfRing = (triangles, s) =>
    [
      ...new Set(
        triangles
          .filter((triangle) => triangle[0].of === "pot")
          .flat()
          .filter((corner) => Math.abs(corner.p[0] - s) < 1e-9)
          .map((corner) => corner.uv.map((value) => value.toFixed(6)).join()),
      ),
    ]
      .sort()
      .join(" ");
  sure(
    pixelsOfRing(pinnedShape.tris, 3) === pixelsOfRing(potShape.tris, 3) &&
      pixelsOfRing(pinnedShape.tris, 9) === pixelsOfRing(potShape.tris, 9) &&
      pinned.places.rings.length === 4 &&
      pinned.places.rings[2][1] > pinned.places.rings[1][1] &&
      pinned.places.rings[2][1] < 1,
    "the pinned rings kept their pixels",
  );
  // the same rings without `places`: the picture is shared out anew
  const freeShape = workshop.shape(256, 256);
  freeShape.turn(ringsWithOneMore(), ZONES.WALL, {
    name: "pot",
    sides: 16,
    seam: Math.PI,
  });
  sure(pixelsOfRing(freeShape.tris, 3) !== pixelsOfRing(potShape.tris, 3), "left free, they move");

  // the pot as a model passes check with nothing said
  const potCheck = smak.check(plainModel("pot", potShape.tris));
  sure(
    !potCheck.errors.length && !potCheck.warnings.length,
    [...potCheck.errors, ...potCheck.warnings].join("; "),
  );

  // allot shares a picture between parts by their real sizes [long, wide, weight]
  const zones = workshop.allot(256, 256, { a: [10, 5], b: [4, 4, 4], c: [20, 3] });
  near(zones.a.w / zones.a.h, 2, 0.05, "allot keeps a part's proportions");
  near((zones.b.w * zones.b.h) / (zones.a.w * zones.a.h), (4 * 16) / 50, 0.1, "and weighs it");
  sure(zones.c.y >= zones.a.y + zones.a.h || zones.c.x >= zones.b.x + zones.b.w, "side by side or below");
});

test("a crease at one ring, and a part's own angle", () => {
  // how many normals a mesh of these triangles stores: corners that share one are shaded smoothly
  const normalCount = (triangles) => smak.meshOf(null, triangles, { width: 64, height: 64 }, 0).norms.length;
  // a tube of three rings, 16 sides, whose middle ring is the one under test
  const tubeWith = (middleRing, options = {}) => {
    const shape = workshop.shape(64, 64);
    shape.turn([[0, 2], middleRing, [4, 2.2]], { x: 0, y: 0, w: 60, h: 60 }, { sides: 16, ...options });
    return shape.tris;
  };
  const gentleBend = [2, 2.1];
  const markedCrease = { s: 2, r: 2.1, crease: true };
  const sharpBend = [2, 6];

  sure(
    normalCount(tubeWith(gentleBend)) === 48 && normalCount(tubeWith(markedCrease)) === 64,
    "a gentle bend shares its normals; marked, each side has its own",
  );
  sure(
    normalCount(tubeWith(sharpBend)) === 64 && normalCount(tubeWith(sharpBend, { smooth: 180 })) === 48,
    "a sharp bend is a crease by its angle, unless the part says it is smooth",
  );
  sure(
    tubeWith(gentleBend).every((triangle) =>
      triangle.every((corner) => corner.group === triangle[0].group),
    ) && new Set(tubeWith(markedCrease).map((triangle) => triangle[0].group)).size === 2,
    "a group each side of the crease",
  );
});

test("a surface says where it is, and a ridge, a band and bosses sit on it", () => {
  // the pot's outside: its wall and its dome
  const outside = potTris.filter((triangle) => /^pot(\.cap1)?$/.test(triangle[0].of));
  // a point of the surface, 4.5 up the wall at angle 0.3; and one on the ring at 3, at the third corner
  // round from the seam
  const onTheWall = pot.at(4.5, 0.3);
  const atACorner = pot.at(3, Math.PI + (2 * Math.PI * 3) / 16);

  // what `at` answers is on the triangles that were built
  sure(
    distanceTo(onTheWall.p, outside) < 1e-9 &&
      distanceTo(pot.at(10.5, 2).p, outside) < 1e-9 &&
      distanceTo(pot.at(1, 0.05).p, outside) < 1e-9,
    "its points are on the built faces: the wall, the dome, the dipped band",
  );
  sure(
    outside.flat().some((corner) => Math.hypot(...smak.sub(corner.p, atACorner.p)) < 1e-9),
    "at a ring and a corner it is the corner",
  );
  // with the point come its normal, a point off the surface when asked, and its place in the picture
  near(Math.hypot(...onTheWall.n), 1, 1e-9, "a unit normal");
  sure(smak.dot(onTheWall.n, [0, onTheWall.p[1], onTheWall.p[2]]) > 4, "looking outwards");
  near(
    Math.hypot(...smak.sub(pot.at(4.5, 0.3, 0.5).p, onTheWall.p)),
    0.5,
    1e-9,
    "half a unit off the surface",
  );
  sure(
    onTheWall.uv[0] > ZONES.WALL.x &&
      onTheWall.uv[0] < ZONES.WALL.x + ZONES.WALL.w &&
      onTheWall.uv[1] > ZONES.WALL.y &&
      onTheWall.uv[1] < ZONES.WALL.y + ZONES.WALL.h,
    "and its place in the picture",
  );

  // a second pot, with a bar down its front from 1 to 7: 0.6 wide and 0.3 high
  const shape = workshop.shape(256, 256);
  const surface = potOf(shape);
  const trianglesBeforeBar = shape.tris.length;
  const bar = shape.ridge(
    surface,
    [
      [1, 0],
      [7, 0],
    ],
    ZONES.BAR,
    { name: "bar", width: 0.6, height: 0.3 },
  );
  const barTriangles = shape.tris.filter((triangle) => triangle[0].of === "bar");
  const barHeights = barTriangles.flat().map((corner) => distanceTo(corner.p, outside));
  sure(
    barTriangles.length >= 12 && shape.tris.length === trianglesBeforeBar + barTriangles.length,
    `${barTriangles.length} triangles`,
  );
  // from 1 to 3 it runs over the band that dips, from 3 to 7 the wall is straight: 4 units
  near(
    bar.length,
    Math.hypot(...smak.sub(surface.at(1, 0).p, surface.at(3, 0).p)) + 4,
    1e-6,
    "its length over the surface",
  );
  near(Math.max(...barHeights), 0.3, 0.02, "its height");
  sure(
    barTriangles.every((triangle) => smak.dot(facingOf(triangle), [0, 1, 0]) > 0),
    "its faces look out of the wall",
  );
  // `q` is a corner's place within its part: every corner at the bar's start (q[0] = 0) is one point
  sure(
    barTriangles
      .flat()
      .filter((corner) => Math.abs(corner.q[0]) < 1e-9)
      .every((corner, _, atTheStart) => Math.hypot(...smak.sub(corner.p, atTheStart[0].p)) < 1e-9) &&
      barTriangles
        .flat()
        .every(
          (corner) =>
            corner.uv[0] * 256 >= ZONES.BAR.x - 1e-6 &&
            corner.uv[0] * 256 <= ZONES.BAR.x + ZONES.BAR.w + 1e-6,
        ),
    "it starts from a point, and lies in its zone",
  );

  // how many triangles a short ridge across the pot has, for each way its two ends can be finished
  const ridgeTrianglesWith = (ends) => {
    const trial = workshop.shape(256, 256);
    const trialSurface = potOf(trial);
    const before = trial.tris.length;
    trial.ridge(
      trialSurface,
      [
        [5, -0.2],
        [5, 0.2],
      ],
      ZONES.BAR,
      { ends },
    );
    return trial.tris.length - before;
  };
  sure(
    ridgeTrianglesWith(["cut", "cut"]) === ridgeTrianglesWith(["open", "open"]) + 2 &&
      ridgeTrianglesWith(["run", "open"]) > ridgeTrianglesWith(["open", "open"]),
    "ends cut, open, and run out",
  );

  // a hoop round the pot at 8: six triangles for each of the 16 sides
  const trianglesBeforeHoop = shape.tris.length;
  shape.band(surface, 8, ZONES.BAR, { name: "hoop", width: 0.6, height: 0.2 });
  sure(
    shape.tris.length - trianglesBeforeHoop === 16 * 6,
    `a band once round: ${shape.tris.length - trianglesBeforeHoop} triangles`,
  );

  // five rivets in a row round the ring at 2, from angle 0.4 to 2.6
  const trianglesBeforeStuds = shape.tris.length;
  const studPlaces = shape.studs(
    surface,
    [
      [2, 0.4],
      [2, 2.6],
    ],
    ZONES.BOSS,
    { name: "rivet", count: 5, radius: 0.3, height: 0.2 },
  );
  const studTriangles = shape.tris.slice(trianglesBeforeStuds);
  sure(
    studPlaces.length === 5 &&
      studTriangles.length === 40 &&
      new Set(studTriangles.map((triangle) => triangle[0].of)).size === 5,
    `${studTriangles.length} triangles in 5 bosses`,
  );
  near(
    Math.max(...studTriangles.flat().map((corner) => distanceTo(corner.p, outside))),
    0.2,
    0.02,
    "a boss's height",
  );
  near(studPlaces[2][1], 1.5, 0.05, "evenly along the path");

  // the pot with all of that on it passes check with nothing said
  const dressedCheck = smak.check(plainModel("pot2", shape.tris));
  sure(
    !dressedCheck.errors.length && !dressedCheck.warnings.length,
    [...dressedCheck.errors, ...dressedCheck.warnings].join("; "),
  );
});

test("leaf: a sheet right from both sides; tube: a tail along a path, to a point", () => {
  // a flag: one quad standing at x = 0, 6 wide and 6 high
  const flagShape = workshop.shape(256, 256);
  flagShape.leaf(
    [
      [
        [0, -3, 0],
        [0, 3, 0],
      ],
      [
        [0, -3, 6],
        [0, 3, 6],
      ],
    ],
    ZONES.LEAF,
    { name: "flag" },
  );
  const flagMdl = plainModel("flag", flagShape.tris);
  // which way each of its triangles looks along x
  const facingX = smak.surface(flagMdl).map((face) => face.n[0]);
  sure(
    flagShape.tris.length === 4 &&
      facingX.filter((x) => x > 0.99).length === 2 &&
      facingX.filter((x) => x < -0.99).length === 2,
    `two faces each way: ${facingX}`,
  );
  sure(
    inked(smak.render(flagMdl, { yaw: 0, pitch: 0, width: 64, height: 64 })) > 0.05 &&
      inked(smak.render(flagMdl, { yaw: 180, pitch: 0, width: 64, height: 64 })) > 0.05,
    "seen from the front and from the back",
  );
  sure(!smak.check(flagMdl).warnings.length, smak.check(flagMdl).warnings.join("; "));

  // a tail: seven points along a quarter circle of radius 10 in the x-z plane, its own radius falling from
  // 1 to 0.5 and then to a point
  const path = Array.from({ length: 7 }, (_, i) => {
    const angle = ((Math.PI / 2) * i) / 6;
    return [10 * Math.sin(angle), 0, 10 * Math.cos(angle), i === 6 ? 0 : 1 - 0.1 * i];
  });
  const tailShape = workshop.shape(256, 256);
  const tail = tailShape.tube(path, ZONES.TAIL, { name: "tail", sides: 6 });
  // five bands of 6 quads, and 6 triangles to the point
  sure(tailShape.tris.length === 6 * 2 * 5 + 6, `${tailShape.tris.length} triangles`);
  near(tail.length, (10 * Math.PI) / 2, 0.1, "its length along the curve");
  sure(
    tailShape.tris.flat().filter((corner) => Math.hypot(corner.p[0] - 10, corner.p[2]) < 1e-9).length === 6,
    "one point at its tip",
  );
  sure(
    tailShape.tris
      .flat()
      .every(
        (corner) =>
          Math.abs(Math.hypot(corner.p[0], corner.p[2]) - 10) <= 1.0001 && Math.abs(corner.p[1]) <= 1.0001,
      ),
    "no farther from the path than its radius",
  );
  // every triangle looks away from the nearest point of the quarter circle
  sure(
    tailShape.tris.every((triangle) => {
      const middle = middleOf(triangle);
      const toTheCircle = 10 / Math.hypot(middle[0], middle[2]);
      return (
        smak.dot(facingOf(triangle), [
          middle[0] - middle[0] * toTheCircle,
          middle[1],
          middle[2] - middle[2] * toTheCircle,
        ]) > 0
      );
    }),
    "it faces outwards",
  );
  // half way along, the path is at 45 degrees and the tail's radius is 0.7
  const halfWay = [10 * Math.sin(Math.PI / 4), 0, 10 * Math.cos(Math.PI / 4)];
  near(
    Math.hypot(...smak.sub(tail.at(tail.length / 2, 0, 0).p, halfWay)),
    0.7,
    0.05,
    "and says where its surface is",
  );
});
