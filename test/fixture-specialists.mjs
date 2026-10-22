// A Half-Life folder of the test's own for The Specialists' map spec (profiles/specialists.mjs, SPEC): ts/ and valve/,
// each with its .wad of plain pictures under the names the profile gives, and no model files (its props are names
// only). For the cases that build a map in the game's manner without the game (97 and on).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { SPEC } from "../profiles/specialists.mjs";

/** The textures the profile names that are Half-Life's (valve/halflife.wad); the rest are TS's own (ts/specialists.wad). */
const HALF_LIFE = /^[+~]|^(fifties|basetrim|cardbox|lab1|drkmtl|trrm|stripes|glass|generic|light|tnnl|yellow)/i;

/** Makes `<at>/Half-Life` and returns its path. */
export function fakeSpecialists(at) {
  const game = join(at, "Half-Life");
  mkdirSync(join(game, "ts", "maps"), { recursive: true });
  mkdirSync(join(game, "valve"), { recursive: true });
  const plain = (name, k) => ({ name, image: { width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(40 + ((k * 23) % 160)) } });
  const named = [...new Set([...Object.values(SPEC.textures).map((t) => t.texture), ...Object.keys(SPEC.lamps ?? {})])];
  writeFileSync(join(game, "ts", "specialists.wad"), smak.maps.writeWad(named.filter((n) => !HALF_LIFE.test(n)).map(plain)));
  writeFileSync(join(game, "valve", "halflife.wad"), smak.maps.writeWad(named.filter((n) => HALF_LIFE.test(n)).map(plain)));
  return game;
}
