// What a spec's materials look like (stevenlafl/smak's src/spec/paint.mjs): here, of it, only what a sprite
// spec uses, a colour's check. The rest paints a model's parts and a map's faces for the spec builders, which
// are not here.

/**
 * What is wrong with a colour given as numbers: three, each 0 to 1. Null when nothing is. A colour of 0 to 255
 * (the way a picture program writes one) is told so: taken as it is, it paints 255 times too bright.
 */
export function rgbFault(given) {
  if (!Array.isArray(given) || given.length !== 3 || !given.every((v) => typeof v === "number" && Number.isFinite(v))) return "[r, g, b], three numbers from 0 to 1";
  if (given.some((v) => v < 0)) return `[r, g, b] from 0 to 1, not ${JSON.stringify(given)}`;
  if (given.some((v) => v > 1))
    return `[r, g, b] from 0 to 1, not ${JSON.stringify(given)}: ${given.every((v) => v <= 255) ? `as 0 to 255 it is ${JSON.stringify(given.map((v) => Math.round((v / 255) * 1000) / 1000))}` : "each 1 at most"}`;
  return null;
}
