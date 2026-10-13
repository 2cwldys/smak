// The file format: a model written from nothing reads back as it was written, check passes it and refuses a
// broken one, and its poses and its mesh are where they were put.
import * as smak from "../src/index.mjs";
import { test, sure, near, poseGap, knife } from "./helper.mjs";

test("buildMdl writes a model that reads back", () => {
  // the knife: one body with one mesh, every corner on the hand bone, and two animations
  const cornersOnTheHand = knife.piece.tris.map((triangle) =>
    triangle.map((corner) => ({ ...corner, bone: "hand" })),
  );
  knife.mdl = smak.buildMdl({
    name: "knife.mdl",
    bones: knife.bones,
    bodyparts: [
      {
        name: "body",
        models: [{ name: "knife", meshes: [{ tris: cornersOnTheHand, texture: knife.texture }] }],
      },
    ],
    sequences: [
      { name: "idle", fps: 10, loops: true, frames: [knife.still] },
      { name: "wave", fps: 24, loops: false, frames: knife.wave },
    ],
  });

  // what the file says of itself is what went in
  const info = smak.readMdl(knife.mdl);
  const animations = smak.sequences(knife.mdl);
  sure(info.bones.join() === "arm,hand", "bones");
  sure(info.textures[0].width === 256 && info.textures[0].name === "knife.bmp", "texture");
  sure(info.bodyparts[0].models[0].meshes[0].numtris === knife.piece.tris.length, "triangles");
  sure(
    animations.length === 2 && animations[1].frames === 12 && animations[1].fps === 24 && animations[0].loops,
    "animations",
  );
});

test("check passes it for both engines", () => {
  for (const engine of ["goldsrc", "xash"]) {
    const result = smak.check(knife.mdl, engine);
    sure(!result.errors.length, result.errors.join("; "));
    sure(!result.warnings.length, result.warnings.join("; "));
  }
});

test("check refuses a broken one", () => {
  const cutShort = knife.mdl.subarray(0, knife.mdl.length - 40);
  sure(smak.check(cutShort).errors.length > 0, "a cut file passed");
  sure(smak.check(Buffer.from("not a model at all")).errors.length > 0, "junk passed");
});

test("a pose read back is the pose written", () => {
  const WAVE = 1; // the animation's number in the file
  const HAND = 1; // the bone's number
  const TURN_ABOUT_Y = 4; // of a bone's six numbers in a frame, the one the wave changes

  // frame 5 as the file packs it, against the same frame worked out from the numbers that went in
  near(
    poseGap(smak.poseAt(knife.mdl, WAVE, 5), smak.boneMatrices(knife.bones, knife.wave[5])),
    0,
    1e-3,
    "frame 5",
  );
  // a frame that is not in the file, posed on the file's bones
  near(
    poseGap(smak.poseOf(knife.mdl, knife.wave[7]), smak.boneMatrices(knife.bones, knife.wave[7])),
    0,
    1e-6,
    "poseOf",
  );
  // one number of one frame, read back
  near(
    smak.readSequence(knife.mdl, "wave").frames[5][HAND][TURN_ABOUT_Y],
    knife.wave[5][HAND][TURN_ABOUT_Y],
    1e-4,
    "frameValues",
  );
});

test("the mesh is where it was put, facing outwards", () => {
  const model = smak.readMdl(knife.mdl).bodyparts[0].models[0];
  const triangles = smak.readMesh(knife.mdl, model, model.meshes[0]);
  const restPose = smak.restPose(knife.mdl);

  // the knife is 16 long: its corners, taken to model space, span that
  const alongTheKnife = triangles.flat().map((corner) => smak.apply34(restPose[corner.bone], corner.p)[0]);
  near(Math.max(...alongTheKnife) - Math.min(...alongTheKnife), 16, 0.01, "its length");

  // a triangle faces outwards when the way its corners turn agrees with its first corner's normal
  const facingOut = triangles.filter((triangle) => {
    const edgeA = smak.sub(triangle[1].p, triangle[0].p);
    const edgeB = smak.sub(triangle[2].p, triangle[0].p);
    return smak.dot(smak.cross(edgeA, edgeB), triangle[0].n) * smak.FRONT > 0;
  }).length;
  sure(facingOut > triangles.length * 0.95, `${facingOut} of ${triangles.length} face outwards`);
});
