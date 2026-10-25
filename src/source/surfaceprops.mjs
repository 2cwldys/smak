// What a thing is made of, to Source: its surfaceprop, and the density that weighs it. GMod's studiomdl weighs
// every collision model at "default"'s 2000 kg a cubic metre whatever its $surfaceprop ($automass, measured
// 2026-10-25: a barrel's hull 671 kg as wood and as metal), so a port weighs it itself: the hull's volume at the
// density the game's scripts/surfaceproperties.txt gives its surfaceprop.
//
//   readSurfaceProps(text)            Map(name -> { base, density }) of a surfaceproperties.txt (names lower case)
//   densityOf(name, props)            kg a cubic metre, through each material's base; "default"'s when not given
//   massOf(volume, density)           kg of a volume in cubic units (an inch each way, as Source's physics has it)
//   SURFACEPROP_OF_BASE               a spec material's base as the surfaceprop it is

/** Source's physics: a unit is an inch. */
const CUBIC_METRES_A_CUBIC_UNIT = 0.0254 ** 3;
/** "default"'s density, when a file gives none. */
const DEFAULT_DENSITY = 2000;
/** Densities of Half-Life 2's surfaceproperties.txt, for a machine without GMod's (a few the kit's bases name). */
const KNOWN_DENSITY = { default: 2000, wood: 700, metal: 2700, solidmetal: 2700, flesh: 900, concrete: 2400, rock: 2400, brick: 2400, plaster: 2000, tile: 2700, glass: 2700, dirt: 1600, grass: 1600, snow: 800, rubber: 1100, carpet: 500, foliage: 700, bone: 1500, plastic: 1050 }; // prettier-ignore

/**
 * The surfaceprop of each material base of a spec (src/spec/paint.mjs's MATERIALS), as Half-Life 2's
 * surfaceproperties.txt names them: what a thing sounds like when hit, how heavy a volume of it is, how it breaks.
 * A base not here is "default".
 */
export const SURFACEPROP_OF_BASE = {
  wood: "wood", darkwood: "wood", planks: "wood", door: "wood",
  iron: "metal", steel: "metal", metal: "metal", brass: "metal", gold: "metal", copper: "metal",
  stone: "rock", marble: "rock", brick: "brick", plaster: "plaster", tile: "tile",
  glass: "glass", dirt: "dirt", grass: "grass", snow: "snow",
  leather: "rubber", cloth: "carpet", rope: "carpet", leaves: "foliage", bone: "bone",
}; // prettier-ignore

/** A surfaceproperties.txt's materials: each "name" { "base" ..., "density" ... }, comments left out. */
export function readSurfaceProps(text) {
  const props = new Map();
  const clean = String(text).replace(/\/\/[^\n]*/g, "");
  for (const [, name, body] of clean.matchAll(/"([^"]+)"\s*\{([^}]*)\}/g)) {
    const keys = Object.fromEntries([...body.matchAll(/"([^"]+)"\s*"([^"]*)"/g)].map((kv) => [kv[1].toLowerCase(), kv[2]]));
    props.set(name.toLowerCase(), { base: keys.base?.toLowerCase(), density: keys.density === undefined ? undefined : Number(keys.density) }); // prettier-ignore
  }
  return props;
}

/** A surfaceprop's density (kg a cubic metre), through its bases; from the kit's own table without `props`. */
export function densityOf(name, props) {
  let at = String(name).toLowerCase();
  for (let step = 0; step < 16 && at; step++) {
    const prop = props?.get(at);
    if (prop?.density !== undefined) return prop.density;
    if (!prop) return KNOWN_DENSITY[at] ?? DEFAULT_DENSITY;
    at = prop.base;
  }
  return DEFAULT_DENSITY;
}

/** The mass (kg) of a volume of cubic units at a density (kg a cubic metre). */
export const massOf = (volume, density) => volume * CUBIC_METRES_A_CUBIC_UNIT * density;
