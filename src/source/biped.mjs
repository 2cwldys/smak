// A GoldSrc biped made one GMod knows: its bones under Valve's names, its hands turned as Valve's are, and the
// bones and attachments GMod looks for on a player's hands. For a player model and a weapon held in its hand (a
// p_ model), which GMod merges onto the holder bone by bone name (Source's bonemerge, as GoldSrc's renderer drew a
// p_ model by its bones' names).
//
//   valveBiped(skeleton, { player, handRoll })
//     -> { skeleton, frame(values), point(bone, p), box(bone, min, max), attachments, named, kept, rolls, warnings }
//   valveBipedName(name)   "Bip01 L Arm1" -> "ValveBiped.Bip01_L_UpperArm", or null for a bone that is no biped's
//
// What a ported player has is stevenlafl's finding in their port of The Specialists to GMod: GMod
// finds a held weapon by ValveBiped.Bip01_R_Hand and its flashlight by anim_attachment_RH, and a GoldSrc hand is
// turned half round its arm from Valve's. The turn is measured here by the thumb, against GMod's own male_07: its
// right thumb stands at -105 degrees about the hand's x (from its y toward its z), its left at 105; every Half-Life
// player's right thumb stands at 86, its left at -75.
//
// The model keeps its own animations. GMod's own player animations (m_anm.mdl) are not made to work on it: they
// turn bones about Valve's own axes, which a GoldSrc skeleton does not have.
import { qmul, qconj, qturn, qabout, qofAngles, anglesOf } from "../animate.mjs";

/** A part's name in Valve's biped, where 3ds Max's older Biped (Half-Life's) names it otherwise. */
const VALVE_PARTS = { arm: "Clavicle", arm1: "UpperArm", arm2: "Forearm", leg: "Thigh", leg1: "Calf", neck: "Neck1", head: "Head1", spine3: "Spine4" }; // prettier-ignore
/** Where a thumb stands about its hand's x in GMod's own hands, in degrees: male_07's (female_02's within 2). */
export const VALVE_THUMB = { R: -105, L: 105 };
/**
 * How far a Half-Life hand is turned about its x from Valve's, in degrees: measured on every Half-Life player
 * (gordon, barney, gman...), whose thumbs stand half round from male_07's. A hand with no thumb (a p_ model's) is
 * given it.
 */
export const GOLDSRC_HAND_ROLL = 180;
/**
 * The bones GMod looks for on a player's hands, under them as male_07 has them, in the hand's space once turned
 * as Valve's: where a held thing is put, and the flashlight. stevenlafl measured them in the game on a male_07
 * bot (the values male_07 stores at rest are not those its animations give): the right one turned half round its
 * x, the left not.
 */
export const HAND_ATTACHMENTS = [
  { side: "R", bone: "ValveBiped.Anim_Attachment_RH", attachment: "anim_attachment_RH", values: [2.68, -1.71, 0, Math.PI, 0, 0] },
  { side: "L", bone: "ValveBiped.Anim_Attachment_LH", attachment: "anim_attachment_LH", values: [2.68, -1.71, 0, 0, 0, 0] },
];

/** A GoldSrc biped's bone under Valve's name: Bip01, Bip01 Pelvis, Bip01 R Arm2, Bip01 L Finger01... Null else. */
export function valveBipedName(name) {
  const found = name.trim().match(/^Bip01(?:\s+([LR]))?(?:\s+(\w+))?$/i);
  if (!found || (found[1] && !found[2])) return null;
  if (!found[2]) return "ValveBiped.Bip01";
  const part = VALVE_PARTS[found[2].toLowerCase()] ?? found[2][0].toUpperCase() + found[2].slice(1);
  return `ValveBiped.Bip01_${found[1] ? `${found[1].toUpperCase()}_` : ""}${part}`;
}

/**
 * A skeleton ([{ name, parent, pos, rot }]) made Valve's. `player`: a player model, which gets the bones and
 * attachments GMod looks for on its hands; a p_ model does not. `handRoll`: how far its hands are turned about their
 * x from Valve's, in degrees, when it is not to be measured by their thumbs. Returns:
 *   skeleton     with Valve's names, and (a player) the hands' attachment bones after the rest
 *   frame(values)  a frame's six numbers a bone as Source is to have them: each hand turned, what hangs from it
 *                turned back, so that nothing moves; the attachment bones' after
 *   point(bone, p), box(bone, min, max)   a place, a box, in a bone's space, in its space once turned
 *   attachments  [{ name, bone, pos }]: the hands' (a player's)
 *   named, kept  the bones given Valve's names, and those that kept theirs
 *   rolls        [{ bone, side, degrees, measured }]
 *   warnings     what was assumed
 */
export function valveBiped(skeleton, { player = false, handRoll } = {}) {
  const warnings = [];
  const used = new Set();
  const named = [];
  const kept = [];
  const names = skeleton.map((bone) => {
    const valve = valveBipedName(bone.name);
    if (!valve || used.has(valve.toLowerCase())) {
      kept.push(bone.name);
      return bone.name;
    }
    used.add(valve.toLowerCase());
    named.push(bone.name);
    return valve;
  });
  const indexOf = (name) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  const rolls = [];
  for (const side of ["R", "L"]) {
    const hand = indexOf(`ValveBiped.Bip01_${side}_Hand`);
    if (hand < 0) continue;
    const thumb = indexOf(`ValveBiped.Bip01_${side}_Finger0`);
    let degrees = handRoll;
    let measured = false;
    if (degrees === undefined && thumb >= 0 && skeleton[thumb].parent === hand) {
      const [, y, z] = skeleton[thumb].pos;
      const stands = (Math.atan2(z, y) * 180) / Math.PI;
      degrees = ((Math.round((VALVE_THUMB[side] - stands) / 90) * 90) % 360 + 360) % 360;
      measured = true;
    }
    if (degrees === undefined) {
      degrees = GOLDSRC_HAND_ROLL;
      warnings.push(`the ${side === "R" ? "right" : "left"} hand has no thumb to tell how it is turned: turned ${GOLDSRC_HAND_ROLL} degrees about its x, as every Half-Life player's is from Valve's (handRoll says otherwise)`); // prettier-ignore
    }
    if (degrees % 360) rolls.push({ bone: hand, side, degrees, measured, q: qabout([1, 0, 0], (degrees * Math.PI) / 180) });
  }
  const turnOf = new Map(rolls.map((roll) => [roll.bone, roll.q]));
  const extras = player
    ? HAND_ATTACHMENTS.map((a) => ({ ...a, parent: indexOf(`ValveBiped.Bip01_${a.side}_Hand`) })).filter((a) => a.parent >= 0)
    : [];
  const frame = (values) => {
    const out = values.map((six) => [...six]);
    for (const [hand, q] of turnOf) {
      out[hand] = [...out[hand].slice(0, 3), ...anglesOf(qmul(qofAngles(out[hand].slice(3)), q))];
      const back = qconj(q);
      skeleton.forEach((bone, i) => {
        if (bone.parent === hand) out[i] = [...qturn(back, out[i].slice(0, 3)), ...anglesOf(qmul(back, qofAngles(out[i].slice(3))))]; // prettier-ignore
      });
    }
    return [...out, ...extras.map((a) => [...a.values])];
  };
  const point = (bone, p) => (turnOf.has(bone) ? qturn(qconj(turnOf.get(bone)), p) : p);
  const box = (bone, min, max) => {
    if (!turnOf.has(bone)) return { min, max };
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => point(bone, [k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]])); // prettier-ignore
    return { min: [0, 1, 2].map((a) => Math.min(...corners.map((c) => c[a]))), max: [0, 1, 2].map((a) => Math.max(...corners.map((c) => c[a]))) }; // prettier-ignore
  };
  const reframed = frame(skeleton.map((bone) => [...bone.pos, ...bone.rot]));
  return {
    skeleton: [
      ...skeleton.map((bone, i) => ({ ...bone, name: names[i], pos: reframed[i].slice(0, 3), rot: reframed[i].slice(3) })),
      ...extras.map((a, k) => ({ name: a.bone, parent: a.parent, pos: reframed[skeleton.length + k].slice(0, 3), rot: reframed[skeleton.length + k].slice(3) })), // prettier-ignore
    ],
    frame,
    point,
    box,
    attachments: extras.map((a, k) => ({ name: a.attachment, bone: skeleton.length + k, pos: [0, 0, 0] })),
    named,
    kept,
    rolls: rolls.map(({ bone, side, degrees, measured }) => ({ bone, side, degrees, measured })),
    warnings,
  };
}
