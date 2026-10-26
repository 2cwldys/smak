// A port compiled for s&box and read back in its editor, broken in one way each, against what the original says
// (compareSbox): a bone lost, one under another parent, an animation lost or of another length, a bodygroup's
// choice, a skin's material group, an attachment and a hit box lost, and a bone off GoldSrc's place in a pose (a
// model turned, a channel that moved nothing). What the editor read is plain data, as probeCode's answer is: no
// editor is needed.
import * as smak from "../../src/index.mjs";
import { broken } from "./case.mjs";

const { compareSbox } = smak.sbox;

/** What the original says: two bones, a walk of 1 s, a gun of two choices, two skins, a muzzle, a hit box, a pose. */
const EXPECTED = {
  bones: [
    ["Bip01", -1],
    ["Bip01_R_Hand", 0],
  ],
  sequences: [{ name: "walk", duration: 1 }],
  parts: [{ name: "gun", choices: 2 }],
  skins: 2,
  attachments: ["muzzle"],
  hitboxes: 1,
  samples: [{ sequence: "walk", time: 0.5 }],
  poses: [
    {
      name: "walk",
      frame: 5,
      bones: [
        [0, 0, 40],
        [10, -6, 50],
      ],
    },
  ],
};
/** What the editor read of it whole. */
const whole = () => ({
  bones: [
    ["Bip01", -1],
    ["Bip01_R_Hand", 0],
  ],
  sequences: ["walk"],
  durations: { walk: 1 },
  parts: [["gun", ["gun", "blank1"]]],
  groups: ["default", "skin1"],
  attachments: ["muzzle"],
  hitboxes: [["hitbox0", "Bip01", "hitgroup_1"]],
  poses: [
    {
      sequence: "walk",
      time: 0.5,
      bones: [
        [0, 0, 40],
        [10.02, -6, 50],
      ],
    },
  ],
});
const faultsOf = (change) => {
  const read = whole();
  change(read);
  return compareSbox(EXPECTED, read).faults;
};
const wholeFaults = () => compareSbox(EXPECTED, whole()).faults;

broken("compareSbox", "a bone lost", {
  said: /1 bones of the port not in the compiled model: Bip01_R_Hand/,
  broken: () => faultsOf((r) => r.bones.pop()),
  whole: wholeFaults,
});
broken("compareSbox", "a bone under another parent", {
  said: /bones under another parent than the port's: Bip01_R_Hand/,
  others: true, // its place in the pose is read where it is
  broken: () => faultsOf((r) => (r.bones[1][1] = -1)),
});
broken("compareSbox", "an animation lost", {
  said: /1 animations not in the compiled model: walk/,
  broken: () => faultsOf((r) => (r.sequences = [])),
});
broken("compareSbox", "an animation of another length", {
  said: /animations of another length: walk 1\.500 s, not 1\.000/,
  broken: () => faultsOf((r) => (r.durations.walk = 1.5)),
});
broken("compareSbox", "a bodygroup's choice lost", {
  said: /gun has 1 choices, not 2/,
  broken: () => faultsOf((r) => r.parts[0][1].pop()),
});
broken("compareSbox", "a skin's material group lost", {
  said: /1 material groups, not 2 \(a skin each\)/,
  broken: () => faultsOf((r) => r.groups.pop()),
});
broken("compareSbox", "an attachment lost", {
  said: /attachments not there: muzzle/,
  broken: () => faultsOf((r) => (r.attachments = [])),
});
broken("compareSbox", "a hit box lost", {
  said: /0 hit boxes, not 1/,
  broken: () => faultsOf((r) => (r.hitboxes = [])),
});
broken("compareSbox", "the model turned a quarter round: a bone off GoldSrc's place in a pose", {
  said: /1 of 1 poses with a bone off GoldSrc's place: walk frame 5: Bip01_R_Hand 16\.\d\d units off/,
  broken: () => faultsOf((r) => (r.poses[0].bones[1] = [6, 10, 50])),
});
