// The Source engine (Garry's Mod): GoldSrc models ported, Source's models, textures and packs read and drawn.
//   import * as smak from "smak";  smak.source.portToGmod("barney.mdl", { out: "work/barney" })
//
//   gmod.mjs     portToGmod                                   the whole port: files, compile, check, picture
//   port.mjs     portToSource writePort vmtOf sourceName       a GoldSrc model as SMD, QC, VTF and VMT
//   compile.mjs  findStudiomdl findGmod compileQc             Source's compiler (GMod's), run in a folder of its own
//   check.mjs    comparePort                                  a compiled port held to what it was made from
//   mdl.mjs      readSourceMdl                                what a compiled Source model holds
//   mesh.mjs     readVvd readVtx sourceTriangles              its triangles
//   draw.mjs     sourceFiles gmodFiles readSourceModel readVmt sourceTris renderSource   read whole and drawn
//   vpk.mjs      openVpk                                      Valve's packs
//   vtf.mjs      writeVtf readVtf powerOfTwo                  Source's textures
//   smd.mjs      smdOf                                        the compiler's text of a mesh or an animation
//   hull.mjs     convexHull                                   the one solid a physics prop collides as
//   phy.mjs      readPhy                                      what a compiled model collides as
//   bsp.mjs      writeSourceBsp readSourceBsp Packer colorRgbExp visibilityLump storedZip   Source's maps, lump by lump
//   map.mjs      portMapToSource portMapToGmod worldLightsLump materialName   a GoldSrc map as a Source map
//   mapbrushes.mjs  regionOf brushesOfTree brushesOfClipHull clipContents clipOutsideHull  its collision brushes, rebuilt
//   vcollide.mjs physCollideLump findVphysics vcollideHelper     its physics, made by GMod's vphysics
//   game.mjs     rcon runProbe probeLua builtInProbe shoot startGmodServer    GMod driven while it runs: RCON, Lua probes, screenshots
//   collision.mjs  checkCollision collisionSpots              where a player is blocked, GoldSrc against its port in the game
//   surfaceprops.mjs  readSurfaceProps densityOf massOf SURFACEPROP_OF_BASE   what it is made of, and its weight
export * from "./gmod.mjs";
export * from "./port.mjs";
export * from "./biped.mjs";
export * from "./compile.mjs";
export * from "./check.mjs";
export * from "./mdl.mjs";
export * from "./mesh.mjs";
export * from "./draw.mjs";
export * from "./vpk.mjs";
export * from "./vtf.mjs";
export * from "./smd.mjs";
export * from "./hull.mjs";
export * from "./phy.mjs";
export * from "./surfaceprops.mjs";
export * from "./bsp.mjs";
export * from "./map.mjs";
export * from "./mapbrushes.mjs";
export * from "./vcollide.mjs";
export * from "./game.mjs";
export * from "./collision.mjs";
