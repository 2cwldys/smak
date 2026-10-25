// A compiled port broken in one way each, against what its port says it has (comparePort): a bone, an animation,
// a material, a bodygroup's submodel, a skin family, an attachment, a hit box lost; two bones made one by their
// names in any case; a corner moved, and one on another place of its picture. The compiled model is plain data,
// as readSourceMdl and sourceTriangles give it: no compiler is needed.
import * as smak from "../../src/index.mjs";
import { broken } from "./case.mjs";

const { comparePort } = smak.source;

/** What the port said the model has. */
const FACTS = {
  bones: ["root", "Hand"],
  sequences: ["idle", "walk"],
  materials: ["skin", "metal"],
  bodygroups: [{ name: "body", models: 1 }, { name: "gun", models: 2 }],
  skins: 2,
  attachments: ["muzzle"],
  hitboxes: 2,
  corners: [
    { p: [0, 0, 0], uv: [0, 0] },
    { p: [10, 0, 0], uv: [1, 0] },
    { p: [0, 0, 10], uv: [0, 1] },
  ],
};
/** The compiled model as it should be: all of it there. */
const whole = () => ({
  version: 48,
  bones: [{ name: "root" }, { name: "hand" }],
  sequences: [{ name: "idle" }, { name: "walk" }],
  materials: ["skin", "metal"],
  cdmaterials: ["models/smak/x/"],
  skins: [[0, 1], [0, 1]],
  bodyparts: [{ name: "body", models: [{ vertices: 3 }] }, { name: "gun", models: [{ vertices: 3 }, { vertices: 0 }] }],
  attachments: [{ name: "muzzle" }],
  hitboxes: [{}, {}],
});
const WHOLE_TRIANGLES = [{ corners: FACTS.corners.map((c) => ({ ...c })) }];
/** The faults of a compiled model, `change` made to it (and to its triangles). */
const faultsOf = (change, triangles = WHOLE_TRIANGLES) => {
  const compiled = whole();
  change(compiled);
  return comparePort(FACTS, compiled, triangles).faults;
};
const wholeFaults = () => comparePort(FACTS, whole(), WHOLE_TRIANGLES).faults;

broken("comparePort", "a bone lost", { said: /a bone lost: Hand/, broken: () => faultsOf((m) => m.bones.pop()), whole: wholeFaults });
broken("comparePort", "two bones made one by their names in any case", {
  said: /1 bones, where it had 2: two of a name \(in any case\) made one/,
  broken: () => comparePort({ ...FACTS, bones: ["Bone10", "bone10"] }, { ...whole(), bones: [{ name: "Bone10" }] }, WHOLE_TRIANGLES).faults, // prettier-ignore
});
broken("comparePort", "an animation lost", { said: /an? animation lost: walk/, broken: () => faultsOf((m) => m.sequences.pop()) });
broken("comparePort", "a material lost", { said: /a material lost: metal/, broken: () => faultsOf((m) => (m.materials = ["skin"])) });
broken("comparePort", "a bodygroup's submodel lost", {
  said: /the bodygroup gun has 1 submodels, where it had 2/,
  broken: () => faultsOf((m) => m.bodyparts[1].models.pop()),
});
broken("comparePort", "a bodygroup lost", { said: /the bodygroup gun lost/, broken: () => faultsOf((m) => m.bodyparts.pop()) });
broken("comparePort", "a skin family lost", { said: /1 skin families, where it had 2/, broken: () => faultsOf((m) => m.skins.pop()) });
broken("comparePort", "an attachment lost", { said: /an? attachment lost: muzzle/, broken: () => faultsOf((m) => (m.attachments = [])) });
broken("comparePort", "a hit box lost", { said: /1 hit boxes, where it had 2/, broken: () => faultsOf((m) => m.hitboxes.pop()) });
broken("comparePort", "a corner moved (a model turned or moved on the way)", {
  said: /1 of 3 corners not where the original had them/,
  broken: () => faultsOf(() => {}, [{ corners: [FACTS.corners[0], FACTS.corners[1], { p: [0, 10, 0], uv: [0, 1] }] }]),
});
broken("comparePort", "a corner on another place of its picture", {
  said: /1 of 3 corners not where the original had them, or not on the same place of their picture/,
  broken: () => faultsOf(() => {}, [{ corners: [FACTS.corners[0], FACTS.corners[1], { p: [0, 0, 10], uv: [0, 0] }] }]),
});
