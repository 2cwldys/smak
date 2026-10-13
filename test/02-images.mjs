// Pictures: PNG and BMP files written and read, a picture with holes, and a texture replaced in a model.
import * as smak from "../src/index.mjs";
import { test, sure, knife } from "./helper.mjs";

/** whether two arrays of bytes hold the same bytes */
const sameBytes = (a, b) => Buffer.from(a).equals(Buffer.from(b));

test("PNG and BMP files go out and come back", () => {
  const texture = knife.texture;

  // a PNG holds red, green, blue and alpha: what comes back is what went in
  const rgba = smak.rgbaOf(texture);
  const pngBack = smak.unpng(smak.png(texture.width, texture.height, rgba));
  sure(sameBytes(pngBack.rgba, rgba), "png");

  // a BMP of 8 bits keeps the palette and the index of every pixel
  const bmpBack = smak.unbmp(smak.bmp(texture));
  sure(sameBytes(bmpBack.pixels, texture.pixels) && sameBytes(bmpBack.palette, texture.palette), "bmp");

  // and a texture made from such a BMP is not cut to a new palette
  const fromBmp = smak.textureFrom(smak.bmp(texture), "x.bmp");
  sure(sameBytes(fromBmp.pixels, texture.pixels), "an 8-bit BMP keeps its palette");
});

test("a picture with holes becomes a masked texture", () => {
  // 16 x 16 of light grey, its first 64 pixels (four rows) see-through
  const rgba = new Uint8Array(16 * 16 * 4).fill(200);
  for (let pixel = 0; pixel < 64; pixel++) rgba[pixel * 4 + 3] = 0;

  const texture = smak.masked({ width: 16, height: 16, rgba }, "holes.bmp");
  // flag 64 is "masked", and palette index 255 is the hole
  sure(texture.flags === 64 && texture.pixels[0] === 255 && texture.pixels[200] !== 255, "holes");
});

test("replaceTexture: same size in place, another size at the end", () => {
  // the picture the model already has, put back: not a byte of the file changes
  const sameAsBefore = smak.textureOf(knife.mdl, "knife.bmp");
  sure(
    smak.replaceTexture(knife.mdl, 0, sameAsBefore).equals(knife.mdl),
    "the same picture changed the file",
  );

  // a picture of half the size: the texture is 128 wide and the model still passes
  const halfSize = smak.indexed(smak.shrink(knife.piece.image, 8), "knife.bmp");
  const replaced = smak.replaceTexture(knife.mdl, 0, halfSize);
  const info = smak.readMdl(replaced);
  sure(info.textures[0].width === 128, "size");
  sure(!smak.check(replaced).errors.length, smak.check(replaced).errors.join("; "));

  // texture coordinates are stored in pixels, so the mesh's corners moved with the picture
  const model = info.bodyparts[0].models[0];
  const corners = smak.readMesh(replaced, model, model.meshes[0]).flat();
  sure(
    Math.max(...corners.map((corner) => corner.s)) <= 128,
    "corners were not moved to the smaller picture",
  );
});
