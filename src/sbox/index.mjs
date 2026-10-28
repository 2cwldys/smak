// s&box (Source 2): GoldSrc models ported as s&box's model compiler reads them.
//   import * as smak from "smak";  smak.sbox.portToSboxFile("barney.mdl", { out: "MyProject/Assets" })
//
//   port.mjs     portToSbox writeSboxPort portToSboxFile      a GoldSrc model as DMX, a .vmdl, PNG and .vmat
//   dmx.mjs      dmxOf boneNameOf quaternionOf                 the DMX of a mesh or an animation (keyvalues2)
//   vmdl.mjs     vmdlOf vmatOf kv3 KV3_FLOAT KV3_INT          ModelDoc's document, a material, KV3 text
//   graph.mjs    graphOf GRAPH_SEQUENCE                       the animation graph that blends a model's animations
//   sound.mjs    sboxSound soundEventOf distanceOf soundEnvelope   a GoldSrc sound as a .sound asset, heard as GoldSrc heard it
//   compile.mjs  findSbox compileVmdl compileSounds            s&box's resourcecompiler, run on a project's Assets
//   editor.mjs   sboxCall runCsharp editorFor projectFolder    its editor driven through sbox-cli
//   map.mjs      portMapToSbox writeSboxMap portMapToSboxFile meshBlob bakeKeyOf   a GoldSrc map as an s&box scene
//   lightmap.mjs lightmapAtlas lightmapShader                a map drawn with its own lightmaps: their atlas, the shader
//   mapcheck.mjs checkSboxMap compareSboxMap mapProbeCode recordBake  a map's port opened in the editor, held to its original
//   check.mjs    checkSboxPort compareSbox expectedOf probeCode blendedPoseAt   a port read back and posed in the editor,
//                                                              held to its original
export * from "./port.mjs";
export * from "./dmx.mjs";
export * from "./vmdl.mjs";
export * from "./graph.mjs";
export * from "./sound.mjs";
export * from "./compile.mjs";
export * from "./editor.mjs";
export * from "./physics.mjs";
export * from "./check.mjs";
export * from "./map.mjs";
export * from "./lightmap.mjs";
export * from "./mapcheck.mjs";
