// SMAK checked against itself, with no game files:   node test/selftest.mjs      (npm test)
// A model is made from nothing, then read, changed in every way the kit can change one, checked and drawn.
// Run it first on a new machine: if it passes, Node is new enough and the kit is whole.
//
// The cases are in one file an area, beside this one, and run in the order below. That order matters: the
// first case builds the knife model that the others start from, and a few later cases use what an earlier
// one found. What they share (the temp folder, `test`, `sure`, the knife) is in helper.mjs; the two
// fixture-*.mjs files hold the small models that more than one area uses.
import { finish } from "./helper.mjs";

const areas = [
  "01-format", // a model written from nothing reads back; check; poses; the mesh
  "02-images", // PNG and BMP, a picture with holes, a texture replaced
  "03-change", // meshes swapped and added, bones added, animations replaced and added, textures put inside
  "04-render-and-kits", // render, sheet, strip, uvMap; the axe and bow kits
  "05-workshop", // turned surfaces, creases, ridges, bands, bosses, a leaf, a tube
  "06-bodies", // putBody and carryPicture
  "07-wear", // a head in a helmet, one size to another, graft to the bone above, several models as one
  "08-place", // paint by place, loose pieces, graft by the bones' names
  "09-islands", // a picture's islands, paint by island, soft edges, passes, blur, copyBody
  "10-layers", // layers of a picture: values, distances, regions, busy, layerMap
  "11-commandline", // bin/smak.mjs
  "12-servers", // the viewer and the editor
  "13-editor-colours", // the editor's adjustments for chosen colours
  "14-orbit-and-normals", // render with a distance; copyBody with normals stored as nothing
  "15-obj", // Wavefront .obj files read, stood up and made into models; `smak obj`
  "16-mcp", // the MCP server: the protocol, the guide by section, info, check, render, and run
  "17-library-faults", // a file cut short, skins of two sizes, a texture given twice, a shape's own normals
  "18-tool-faults", // the command lines' wrong arguments, addresses a server cannot read, a taken port
  "20-maps-read", // compiled maps: read, entities changed and put back, contents, visibility, light, textures, .wad files
  "21-maps-make", // brushes, a map written and read, the plan check, the leak hint, the compile where VHLT is installed
  "22-maps-draw", // pictures of a map: views, plans, the source drawn; the map commands; the MCP tools on a map
  "23-maps-walk", // the walk test, entities at their true size, sections, storeys, views through openings
  "24-maps-mods", // entity definitions from an FGD and learned from maps, a mod's profile and rules, the files entities name
  "25-maps-seen", // a map's pictures with the game's files: models textured and posed, sprites, the sky, `{` holes
  "26-maps-play", // the walk test playing more: jumps across gaps, one-way places, slopes too steep to stand on
  "28-maps-profile", // a profile's ways out and the model it gives an entity; --mod on the picture commands
  "27-play", // the play driver: steps made actions, a map played through a fake driver, `smak play`'s refusals
  "19-example-and-kit-faults", // the examples' wrong arguments and refused models; the kits' fittings and rings
];

// one after another: each file runs its cases as it is loaded, and the servers' cases wait for their answers
for (const area of areas) await import(`./${area}.mjs`);

finish();
