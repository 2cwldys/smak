// Two cases that came with the editor's 0.5.1: render from a distance with perspective (the camera of the
// editor's page), and copyBody on a model whose normals are all stored as nothing.
import * as smak from "../src/index.mjs";
import { test, sure, knife } from "./helper.mjs";

test("render with dist: an orbit with perspective, the page's camera", () => {
  const camera = { yaw: 40, pitch: 12, width: 160, height: 120, target: [12, 0, 10], fov: 50 };
  // how many pixels of a picture are not the background colour
  const drawnPixels = (image) => {
    let count = 0;
    for (let i = 0; i < image.rgba.length; i += 4)
      if (image.rgba[i] !== 58 || image.rgba[i + 1] !== 62 || image.rgba[i + 2] !== 70) count++;
    return count;
  };

  // from half the distance the model is twice as wide and twice as high
  const fromFar = drawnPixels(smak.render(knife.mdl, { ...camera, dist: 80 }));
  const fromNear = drawnPixels(smak.render(knife.mdl, { ...camera, dist: 40 }));
  sure(
    fromFar > 30 && fromNear > fromFar * 2.5 && fromNear < fromFar * 6,
    `half as far is about four times the dots: ${fromFar}, then ${fromNear}`,
  );
  sure(
    Buffer.from(smak.render(knife.mdl, camera).rgba).equals(
      Buffer.from(smak.render(knife.mdl, { ...camera, dist: 0 }).rgba),
    ),
    "without a distance the orbit is as it was, with no perspective",
  );
});

test("copyBody: normals stored as nothing come out fewer and every corner reads as before", () => {
  // some of the game's own models store a normal of 0, 0, 0 for every corner. A copy stores each (bone,
  // normal) pair once, so hundreds of them come out as one; the engine lights a mesh's stored normals one by
  // one by the bone and the normal alone, and a corner reads its light by the normal's number, so every
  // corner of the copy is lit as the original's (ENGINES.md)

  // the knife's mesh rebuilt as such a model stores it: each place once, and a normal of 0, 0, 0 for every
  // corner of every triangle
  const model = smak.readMdl(knife.mdl).bodyparts[0].models[0];
  const triangles = smak.readMesh(knife.mdl, model, model.meshes[0]);
  const vertices = [];
  const vertexNumberByPlace = new Map();
  const normals = [];
  const indexedTriangles = triangles.map((triangle) =>
    triangle.map((corner) => {
      const place = corner.p.join();
      if (!vertexNumberByPlace.has(place)) {
        vertexNumberByPlace.set(place, vertices.length);
        vertices.push(corner.p);
      }
      normals.push([0, 0, 0]);
      return [vertexNumberByPlace.get(place), normals.length - 1, corner.s, corner.t];
    }),
  );
  const zeroNormalsMdl = smak.replaceMesh(
    knife.mdl,
    { bodypart: 0, model: 0, mesh: 0 },
    { bone: 1, verts: vertices, norms: normals, tris: indexedTriangles },
    knife.texture,
  );

  // its body copied: the original keeps three normals a triangle, the copy one in all
  const withCopy = smak.copyBody(zeroNormalsMdl, 0, "again", "knife.bmp");
  const models = smak.readMdl(withCopy).bodyparts[0].models;
  sure(
    models[0].numnorms === triangles.length * 3 &&
      models[1].numnorms === 1 &&
      models[1].meshes[0].numnorms === 1,
    `the original stores ${models[0].numnorms} normals and the copy ${models[1].numnorms}`,
  );

  // corner for corner: the same place and bone, and a normal of no length in both
  const original = smak.posed(withCopy, { body: 0 }).tris;
  const copy = smak.posed(withCopy, { body: 1 }).tris;
  let gap = 0;
  original.forEach((triangle, i) =>
    triangle.c.forEach((corner, k) => {
      gap = Math.max(
        gap,
        Math.hypot(...smak.sub(corner.p, copy[i].c[k].p)),
        Math.hypot(...copy[i].c[k].n),
        Math.hypot(...corner.n),
        Math.abs(corner.bone - copy[i].c[k].bone),
      );
    }),
  );
  sure(
    copy.length === original.length && gap < 1e-6,
    `every corner of the copy has the place, the bone and the normal of the original's (${gap} apart)`,
  );
  sure(!smak.check(withCopy).errors.length, smak.check(withCopy).errors.join("; "));

  // drawn, the two bodies are the same picture; and against the knife with its real normals, hardly any
  // drawn pixel is under 40% of its brightness
  const originalDrawn = smak.render(withCopy, { body: 0, width: 96, height: 96 });
  const copyDrawn = smak.render(withCopy, { body: 1, width: 96, height: 96 });
  const litKnife = smak.render(knife.mdl, { width: 96, height: 96 });
  let darkPixels = 0;
  let drawnPixels = 0;
  for (let i = 0; i < originalDrawn.rgba.length; i += 4)
    if (originalDrawn.rgba[i] !== 58 || originalDrawn.rgba[i + 1] !== 62) {
      drawnPixels++;
      const brightness = originalDrawn.rgba[i] + originalDrawn.rgba[i + 1] + originalDrawn.rgba[i + 2];
      const litBrightness = litKnife.rgba[i] + litKnife.rgba[i + 1] + litKnife.rgba[i + 2];
      if (brightness < litBrightness * 0.4) darkPixels++;
    }
  sure(
    Buffer.from(originalDrawn.rgba).equals(Buffer.from(copyDrawn.rgba)) &&
      drawnPixels > 100 &&
      darkPixels < drawnPixels * 0.02,
    `the two are drawn alike, half lit and not black (${darkPixels} of ${drawnPixels} dots dark)`,
  );
});
