// Specs broken in one way each, against the spec's own validation: a part of no kind, a room placed beside one
// the map has not, a texture of a side that is no multiple of 16, a sound of a layer of no kind, music on a track
// the game has not, a sprite of a side that is no multiple of 8, a video shot of no map; and a texture's look
// past nine in ten of Valve's.
import { validateModelSpec } from "../../src/spec/model.mjs";
import { validateMapSpec } from "../../src/spec/map.mjs";
import { validateWadSpec } from "../../src/spec/wad.mjs";
import { validateSoundSpec } from "../../src/spec/sound.mjs";
import { validateMusicSpec } from "../../src/spec/music.mjs";
import { validateSpriteSpec } from "../../src/spec/sprite.mjs";
import { validateVideoSpec } from "../../src/spec/video.mjs";
import { lookFaults, lookOf, VALVE } from "../../src/spec/look.mjs";
import { broken } from "./case.mjs";

// ── the validators: what is wrong with a spec before anything is built ──

const MODEL = { spec: "smak.model/1", name: "crate.mdl", kind: "prop", parts: [{ id: "body", kind: "box", size: [16, 16, 16] }] }; // prettier-ignore
broken("validateModelSpec", "a part of a kind the kit has not", {
  said: /^parts\[0\] \(body\)\.kind: no kind "pyramid"\. The kinds are: box, /,
  broken: () => validateModelSpec({ ...MODEL, parts: [{ ...MODEL.parts[0], kind: "pyramid" }] }).errors,
  whole: () => validateModelSpec(MODEL).errors,
});

const MAP = { spec: "smak.map/1", name: "rooms", rooms: [{ id: "hall", size: [256, 256, 128] }, { id: "lab", size: [256, 256, 128], place: { east_of: "hall" } }], links: [{ between: ["hall", "lab"] }], entities: [{ class: "info_player_start", room: "hall", at: "centre" }] }; // prettier-ignore
broken("validateMapSpec", "a room placed east of a room the map has not", {
  said: /^rooms\[1\] \(lab\)\.place\.east_of: "attic" is no room given before this one$/,
  broken: () => validateMapSpec({ ...MAP, rooms: [MAP.rooms[0], { ...MAP.rooms[1], place: { east_of: "attic" } }] }).errors, // prettier-ignore
  whole: () => validateMapSpec(MAP).errors,
});

const WAD = { spec: "smak.wad/1", name: "walls.wad", textures: [{ name: "plank", size: [64, 64], material: "wood" }] }; // prettier-ignore
broken("validateWadSpec", "a texture 40 wide, no multiple of 16", {
  said: /^textures\[0\] \(plank\)\.size: \[width, height\], each a multiple of 16 from 16 to \d+$/,
  broken: () => validateWadSpec({ ...WAD, textures: [{ ...WAD.textures[0], size: [40, 64] }] }).errors,
  whole: () => validateWadSpec(WAD).errors,
});

const SOUND = { spec: "smak.sound/1", name: "weapons/hit.wav", length: 0.3, layers: [{ kind: "noise" }] };
broken("validateSoundSpec", "a layer of a kind the kit has not", {
  said: /^layers\[0\]\.kind: noise, tone, fm, modes, particles, sample$/,
  broken: () => validateSoundSpec({ ...SOUND, layers: [{ kind: "chime" }] }).errors,
  whole: () => validateSoundSpec(SOUND).errors,
});

const MUSIC = { spec: "smak.music/1", track: 5, from: { file: "work:tune.wav", start: 1, length: 10 } };
broken("validateMusicSpec", "a track the game has not", {
  said: /^track: 28 is the menu's \(gamestartup\.mp3\), which no map plays: 2 to 27$/,
  broken: () => validateMusicSpec({ ...MUSIC, track: 28 }).errors,
  whole: () => validateMusicSpec(MUSIC).errors,
});

const SPRITE = { spec: "smak.sprite/1", sprites: [{ name: "sprites/glow.spr", size: [32, 32], layers: [{ kind: "glow" }] }] }; // prettier-ignore
broken("validateSpriteSpec", "a sprite 30 wide, no multiple of 8", {
  said: /^sprites\[0\]\.size: \[width, height\], multiples of 8 up to \d+$/,
  broken: () => validateSpriteSpec({ ...SPRITE, sprites: [{ ...SPRITE.sprites[0], size: [30, 32] }] }).errors,
  whole: () => validateSpriteSpec(SPRITE).errors,
});

const VIDEO = { spec: "smak.video/1", name: "tour", size: [96, 64], fps: 12, format: "gif", shots: [{ kind: "walk", map: "rooms.bsp", to: "info_player_start" }] }; // prettier-ignore
broken("validateVideoSpec", "a walk with no map to walk", {
  said: /^shots\[0\]\.map: the compiled map's file$/,
  broken: () => validateVideoSpec({ ...VIDEO, shots: [{ kind: "walk", to: "info_player_start" }] }).errors,
  whole: () => validateVideoSpec(VIDEO).errors,
});

// ── lookFaults: a texture's look against Valve's walls and floors ──

// Valve's middling texture: its five measures each at Valve's 50th
const MIDDLING = Object.fromEntries(Object.entries(VALVE).map(([measure, [, middle]]) => [measure, middle]));
broken("lookFaults", "a texture as bright as a lamp, all else Valve's middling", {
  said: /^brighter \(0\.80; Valve's 0\.332\)$/,
  broken: () => lookFaults({ ...MIDDLING, bright: 0.8 }),
  whole: () => lookFaults(MIDDLING),
});

broken("lookFaults", "a picture of one flat colour", {
  said: /^too even \(no grain, no patches\)$/,
  broken: () => lookFaults(lookOf({ width: 64, height: 64, rgb: new Uint8Array(64 * 64 * 3).fill(90) })),
  whole: () => lookFaults(MIDDLING),
});
