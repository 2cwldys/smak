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
  "29-monster-parts", // a monster's parts: hit boxes, attachments, controllers, an animation's travel and box, the floor's line
  "30-animate", // animations written as poses: turns in the model's axes, a leg bent to its foot, keys, the walk's measures
  "31-items", // a submodel added before the last bodypart and its bases, a piece laid on one that is there, an item's family, `smak item`
  "32-map-faults", // a walked floor at 0 asked as yes or no, entities switched off, markers and wiring, a counter with no brush, scripts placed
  "33-compile-light", // a compile seen to work and stopped at its time, the portals foretold, a draft; the light on a map's floors
  "34-fbx-read", // FBX read: binary (32 and 64 bit, zlib arrays) and text, polygons cut, texture coordinates turned, nodes placed
  "35-glb-read", // glTF read: a .glb and a .gltf with its .bin, a turned node, a picture inside, strips and fans, sparse numbers
  "36-import-model", // a bought model as a prop (true size, fitted, on its base) and as a piece (its grip found or told, a shield's face)
  "37-import-rig", // a file's skeleton, skin and animations made a studio model's, from FBX and from glTF
  "38-import-commandline", // smak import: a file, a prop, a folder with its sheet and table, --anim; smak item with a bought model
  "39-import-faults", // what the readers refuse and say: cut short, old versions, Draco, a .bin not given, a JPEG, wrong options
  "40-play-heard", // the play driver hearing the game: until, expect, the view, a place, a session kept and served, the sheet
  "43-maps-reach", // a body by its name, a ladder off the grid, teleports, walls that give way, why each part of the floor is not walked to, a profile's lists
  "41-play-steps", // the play driver's later steps: from where an until hears, a tap, the view turned to a place, a block repeated, a run that stays
  "42-play-fight", // a fight played by one step: the nearest enemy found, faced and struck, heals, deaths, and what happened counted
  "45-map-small-faults", // stairs with no step level with the upper floor and treads on the grid, hlvis's time said and not foretold, one map's own scripts
  "44-maps-measure", // a map in numbers (widths, headroom, sight) and beside others; maps at one scale; views from starts together, a view of one colour left out
  "46-reskin", // an island given pixels of its own, a re-skin by rules with its pictures before and after, `smak reskin`, check --source
  "47-sequence-from", // an animation of frames of another, backwards or held; `smak sequence-add --from`
  "48-animate-hold", // a held thing aimed and gripped, a bone held at a turn of its own, the quaternions, a fall kept on the ground, yaw with a named view
  "49-compose", // a piece composed on an imported rig's parts before building; the workshop's skinned body
  "50-play-session-long", // a session's run quiet for long still answered (headers at once, a beat, no fetch); folders laid over, what changed put
  "51-map-bands-open", // a band left empty at a place on purpose, said by a key the bands rule reads: only the true faults told
  "52-play-fight-ways", // a fight that prefers a kind of enemy, sidesteps round a crowd to it, dodges a place it is warned of
  "53-play-runner", // a line said before its step, sections and a run from one, kept values, a travel, the summary, the script lint
  "54-play-fight-reach", // an enemy a fight cannot get at (passed over, stopped at, gone to, shot at), a ranged weapon drawn and put back, a quiet without its line, a census, a walk that moves nobody
  "55-map-encounters", // how a spawn area's monsters come (fired by what, seen appearing, back soon, races at war, a far reward), the recipes, a map's character
  "56-map-roleplay", // switched lights as the map starts, rooms carved in textures of their own, a map's wiring, a line of sight in one walk, The Specialists' profile
  "57-map-ground", // spaces of any outline carved, paths and curves, brushes turned, a cliff, maps from an SVG or a PNG sketch
  "58-map-viewer", // a map as a 3D scene, props held against the world (stuck, floating, facing a wall), the map viewer served
  "59-map-country", // cliffs that lean along an outdoor map's rock, the land round it as a model, ground that rises and falls, patches, paths, things strewn, ruins, houses, fences
  "60-reduce", // fewer triangles: the quadric reducer keeps a shape closed, its border, its volume and its charts
  "61-decompile", // a compiled map made back into a .map (Half-Life's frenzy where installed), recompiled, and measured against its original
  "62-sprites", // sprites made of layers of effects by rule: glows, flares, fire, beams, billows, blobs; measured against a reference; a .spr written as it is read
  "63-sounds", // sounds made of layers: a file written as it is read, measured, checked as the engine needs it, held against the game's own; a music track levelled by loudness
  "64-sound-shape", // noise shaped to a curve, a limiter, grains at a period, a sound's picture read back
  "65-mod-code", // a mod's entities read from its C++ source and an FGD written from them; Biped's bones in their languages
  "66-sky", // a sky made from words, written as the game's Targa files, its sides meeting with no seam
  "67-height-plan", // a height plan read back into open space, storeys over storeys
  "68-textures", // a wad spec: textures worn, in relief, made from another; each where a map shows it best, matched to a picture
  "69-reference-textures", // a photograph made a texture: its material found, filtered to Valve's range, laid as it is or aged
  "70-carve", // a shape carved from pictures' outlines, and the quadric reducer that brings it to its triangles
  "71-blob", // a soft body of one surface: limbs, eggs and a skirt blended round a skeleton
  "72-outline-parts", // which parts change a model's outline from some side, and which only cost triangles
  "73-firearm-kit", // a gun from the firearm kit, laid the right way up in another weapon's place
  "74-generated-character", // a character from a made shape on a base: fused limbs warned, its back and sides painted
  "75-model-specs", // a model spec: parts placed by words, characters on a game's skeleton, a weapon in a game's place
  "76-map-specs", // a map spec: rooms laid out by words, their ways, furniture, frames, light and focus, walked
  "77-props-look", // props as GoldSrc's look: crossed cards for a crown, a model's colours against Valve's
  "78-floorplan", // a map's space from a floor plan of height plans, and a texture lifted off its view
  "79-video", // a video of models and maps from a shot list: camera paths, a turntable, a GIF written here
  "80-map-overlay", // a map's edges laid over a picture of it, and the camera found that lays them best
  "81-rigid", // a bodypart added that keeps every body number, one taken out, the header named, rigid pieces laid into as many as the limits need
  "82-solids", // convex solids in plain JavaScript: closed, facing out, convex, their points counted
  "83-kitbash", // the kitbash kit's 45 parts: closed, within their reach, the same for one seed
  "84-linkage", // a piston across a hinge: the anchors on its axis found, animations kept elsewhere named
  "85-motion-overlaps", // pieces on bones driven into each other: a pair swung together caught, a pair apart not
  "86-unwrap", // pieces unfolded into nets on one picture: no texel twice, true density, mirrored halves on one
  "87-blender", // Blender found or not, its float pictures read, and a cube baked where it is installed
  "88-reproportion", // bones made longer and shorter: every turn kept, the feet on the ground, a walk that does not slide, rigid pieces whole; the feet's slide measured
  "89-animations-elsewhere", // animations kept in <name>01.mdl files posed by the pictures, the linkages and the overlaps
  "90-cull", // rigid pieces lighter: a piece shut inside another dropped, a face pressed on another taken out, shapes reduced within a tolerance
  "91-figures", // the figure judges: a figure's facts, its style, texture and shape measured and judged against corpora made here; a library surveyed
  "92-figure-profiles", // each game's manner for the figure judges: MSC, TS and Half-Life's profiles by name, file and object
  "93-figure-commands", // smak figure-survey, figure-judge, figure-texture, figure-shape and figure-validate on a library of the test's own
  "94-ts-map-spec", // The Specialists' map spec: its textures, ts_model props and rooms furnished by its uses; its models where the game is installed
  "97-ts-map-delivered", // a mod's map delivered as the .bsp alone: no .wad of its own, or its pictures put inside the .bsp
  "19-example-and-kit-faults", // the examples' wrong arguments and refused models; the kits' fittings and rings
];

// one after another: each file runs its cases as it is loaded, and the servers' cases wait for their answers
for (const area of areas) await import(`./${area}.mjs`);

finish();
