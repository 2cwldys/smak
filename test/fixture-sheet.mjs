// A small model for the cases of a picture's islands (09) and of layers (10): a sheet that stands alone, and
// a box whose six faces each have their own patch of the picture. An island is a group of triangles that are
// joined in the picture; this model has seven, of known sizes and places.
//
// The picture is 128 x 64. The sheet's patch is the square from (2, 2) to (42, 42); the box's six patches,
// each 16 x 16, lie to the right of pixel 50 in two rows of three.
import * as smak from "../src/index.mjs";

const shape = smak.workshop.shape(128, 64);

// the sheet: one quad at x = 0, 10 wide (y from -5 to 5) and 10 high (z from 0 to 10), which faces +x because
// the point given last, on its inside, is at x = -1
shape.quad(
  shape.V([0, -5, 0], [2, 2]),
  shape.V([0, 5, 0], [42, 2]),
  shape.V([0, 5, 10], [42, 42]),
  shape.V([0, -5, 10], [2, 42]),
  [-1, 0, 5],
);

// the box: x from 20 to 26, y from -3 to 3, z from 0 to 6. Its corners are numbered 0 to 7, one bit an axis
const boxCorner = (number) => [number & 1 ? 26 : 20, number & 2 ? 3 : -3, number & 4 ? 6 : 0];
const boxFaces = [
  [0, 1, 3, 2],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 3, 7, 5],
];
boxFaces.forEach((face, faceNumber) => {
  // this face's patch of the picture
  const left = 50 + (faceNumber % 3) * 20;
  const top = 2 + Math.floor(faceNumber / 3) * 20;
  shape.quad(
    shape.V(boxCorner(face[0]), [left, top]),
    shape.V(boxCorner(face[1]), [left + 16, top]),
    shape.V(boxCorner(face[2]), [left + 16, top + 16]),
    shape.V(boxCorner(face[3]), [left, top + 16]),
    [23, 0, 3],
  );
});

/** the sheet's two triangles and the box's twelve */
export const sheetAndBoxTris = shape.tris;

/** A model of the sheet and the box under a picture of 128 x 64 given as rgb bytes. */
export const sheetAndBoxModel = (name, rgb) =>
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
                tris: sheetAndBoxTris,
                texture: smak.indexed({ width: 128, height: 64, rgb }, `${name}.bmp`),
              },
            ],
          },
        ],
      },
    ],
  });

// its first picture: a chequer of single dots under the sheet (white where x + y is even), red everywhere
// else
const chequer = new Uint8Array(128 * 64 * 3);
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 128; x++) {
    const colour = x >= 43 ? [255, 0, 0] : (x + y) % 2 ? [0, 0, 0] : [255, 255, 255];
    chequer.set(colour, (y * 128 + x) * 3);
  }

/** the sheet and the box under the chequer: "flat.mdl", its one texture "flat.bmp" */
export const flat = sheetAndBoxModel("flat", chequer);

/** The colour [r, g, b] (0 to 255) of one pixel of a model's texture. */
export const dotOf = (mdl, x, y, textureName = "flat.bmp") => {
  const texture = smak.textureOf(mdl, textureName);
  const index = texture.pixels[y * texture.width + x];
  return [...texture.palette.subarray(index * 3, index * 3 + 3)];
};

/**
 * The numbers uvIslands gives the islands. The first case of 09-islands.mjs finds them and puts them here;
 * the later cases of 09 and 10 paint and read by them.
 */
export const islands = { sheet: -1, boxFaces: [] };
