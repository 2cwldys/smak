// The kitbash kit (kits/kitbash.mjs): its 45 parts, each made of closed solids, within the reach its size gives
// it on a slanted surface, and the same part again for the same seed (another for another, where it varies).
import {
  PARTS,
  SETS,
  REACH,
  SINK,
  kitbash,
  seeded,
  place,
  trisOf,
  closed,
  dot,
  sub,
} from "../kits/kitbash.mjs";
import { test, sure } from "./helper.mjs";

const surface = place([4, -3, 20], [0.2, -0.4, 0.9], [1, 0.3, 0]);
const sizes = [0.5, 1, 2.5];

test("kitbash: 45 parts, each of closed solids, every set naming parts the kit has", () => {
  sure(Object.keys(PARTS).length === 45, `${Object.keys(PARTS).length} parts`);
  for (const [name, make] of Object.entries(PARTS))
    for (const size of sizes) {
      const solids = make(surface, size, seeded(3));
      sure(solids.length >= 1 && solids.length <= 8, `${name}: ${solids.length} solids`);
      solids.forEach((solid, i) => {
        const c = closed(trisOf(solid));
        sure(c.closed, `${name} at ${size}, solid ${i}: ${c.open} open edges, ${c.doubled} doubled`);
        sure(typeof solid.mat === "string", `${name}: a paint for each solid`);
      });
    }
  for (const [set, names] of Object.entries(SETS))
    for (const name of names) sure(PARTS[name], `the set ${set} names ${name}, which is not a part`);
});

test("kitbash: each part within the reach of its size, on its surface", () => {
  for (const [name, make] of Object.entries(PARTS))
    for (const size of sizes)
      for (const seed of [1, 2, 3]) {
        const pts = make(surface, size, seeded(seed))
          .flatMap(trisOf)
          .flat()
          .map((c) => sub(c.p, surface.at));
        const across = Math.max(
          ...pts.map((p) => Math.max(Math.abs(dot(p, surface.X)), Math.abs(dot(p, surface.Y)))),
        );
        const out = pts.map((p) => dot(p, surface.Z));
        sure(
          across <= REACH.across * size + REACH.more + 1e-6,
          `${name} at ${size}: ${across.toFixed(2)} across`,
        );
        sure(
          Math.max(...out) <= REACH.out * size + REACH.more + 1e-6,
          `${name} at ${size}: ${Math.max(...out).toFixed(2)} out`,
        );
        sure(
          Math.min(...out) >= -SINK - REACH.below * size - 1e-6,
          `${name} at ${size}: ${Math.min(...out).toFixed(2)} in`,
        );
        sure(
          Math.min(...out) <= 0.12 * size,
          `${name} at ${size}: it stands ${Math.min(...out).toFixed(2)} off its surface`,
        );
      }
});

test("kitbash: the same seed makes the same part, another seed another where the part varies", () => {
  const key = (solids) =>
    JSON.stringify(solids.flatMap(trisOf).map((t) => t.map((c) => c.p.map((v) => v.toFixed(6)))));
  let varies = 0;
  for (const name of Object.keys(PARTS)) {
    const a = key(kitbash(name, surface, 1.5, 7));
    sure(a === key(kitbash(name, surface, 1.5, 7)), `${name}: two makings of seed 7 differ`);
    sure(a === key(PARTS[name](surface, 1.5, seeded(7))), `${name}: kitbash and PARTS differ`);
    if ([8, 9, 10, 11].some((seed) => key(kitbash(name, surface, 1.5, seed)) !== a)) varies++;
  }
  sure(varies >= 8, `parts that vary with the seed: ${varies}`);
  const r = seeded(5);
  const list = Array.from({ length: 5 }, () => r.int(1, 3));
  sure(
    list.every((v) => v >= 1 && v <= 3),
    `int(1, 3): ${list}`,
  );
  let said = "";
  try {
    kitbash("sprocket", surface, 1);
  } catch (e) {
    said = e.message;
  }
  sure(/no part sprocket/.test(said), `it said: ${said}`);
});
