// A GoldSrc decal (a decals.wad texture: a bullet's hole, blood) as s&box's: its picture and a decal definition
// (`.decal`, DecalDefinition) that a Decal component lays. GoldSrc lays a decal at its texture's size, a pixel a unit:
// the definition's width and height are the texture's. Its picture is read as the engine reads it (maps/miptex.mjs
// decalRgba): a masked one's holes take their neighbours' colour, so the edge filters to the decal's own colours,
// not to the blue of its holes.
//
//   sboxDecal(texture, { picture })   -> { decal, png, width, height, gradient }
import { decalRgba } from "../maps/miptex.mjs";
import { png } from "../image.mjs";
import { bleedHoles } from "../source/vtf.mjs";

/** A texture's settings as s&box's editor writes them for a decal's colour (core/decals' own). */
const imageFile = (path) => ({
  $compiler: "texture",
  $source: "imagefile",
  data: {
    FilePath: path,
    MaxSize: 4096,
    ConvertHeightToNormals: false,
    NormalScale: 1,
    Rotate: 0,
    FlipVertical: false,
    FlipHorizontal: false,
    Padding: { Size: "0,0", EdgeSize: "0,0" },
    Sharpen: 0,
    InvertColor: false,
    Blur: 0,
    Brightness: 1,
    Contrast: 1,
    Saturation: 1,
    Hue: 0,
    Colorize: false,
    TargetColor: "0,1,0,1",
    CacheToDisk: true,
  },
  compiled: null,
});

/**
 * The decal of a decals.wad texture (`textureFromWad`): `png` its picture's bytes, to be written at `picture` (a path
 * under a project's Assets), and `decal` its definition's text, which names it; `width` and `height` in units.
 */
export function sboxDecal(texture, { picture }) {
  if (!picture) throw new Error("sboxDecal: where its picture goes (picture)");
  const { width, height, rgba, gradient } = decalRgba(texture);
  if (!gradient) bleedHoles(rgba, width, height);
  const decal = { ColorTexture: imageFile(picture), ParallaxStrength: 0, Tint: "1,1,1,1", ColorMix: 1, Width: width, Height: height, __references: [], __version: 0 }; // prettier-ignore
  return { decal: `${JSON.stringify(decal, null, 2)}\n`, png: png(width, height, rgba), width, height, gradient };
}
