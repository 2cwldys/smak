// The command line (bin/smak.mjs), run as a person would run it on files in the temp folder; and an island
// that two bodies share, which the command line counts for each.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as smak from "../src/index.mjs";
import { test, sure, near, poseGap, tmp, runSmak, knife } from "./helper.mjs";

test("an island two bodies share counts its triangles for each", () => {
  // the knife's body again in the same texture: both bodies lie on the same islands of the picture
  const twoBodies = smak.copyBody(knife.mdl, 0, "again", "knife.bmp");
  const islandsBefore = smak.uvIslands(knife.mdl).list;
  const islandsNow = smak.uvIslands(twoBodies).list;
  const knifeTriangles = knife.piece.tris.length;
  sure(
    islandsNow.length === islandsBefore.length &&
      islandsNow.every(
        (island, i) =>
          island.id === islandsBefore[i].id &&
          island.tris === 2 * islandsBefore[i].tris &&
          island.bodies.length === 2 &&
          island.bodies[0].body === 0 &&
          island.bodies[1].body === 1 &&
          island.bodies[0].tris === islandsBefore[i].tris &&
          island.bodies[1].tris === islandsBefore[i].tris,
      ),
    "the same islands, each with its count for body 0 and for body 1",
  );
  sure(
    islandsNow.reduce((sum, island) => sum + island.bodies[1].tris, 0) === knifeTriangles &&
      islandsBefore.every((island) => island.bodies.length === 1 && island.bodies[0].tris === island.tris),
    `body 1 has ${knifeTriangles} triangles`,
  );

  // `smak islands` says the same: one body's triangles with --body, every body's without
  const modelFile = join(tmp, "shared.mdl");
  writeFileSync(modelFile, twoBodies);
  sure(
    new RegExp(`; ${knifeTriangles} triangles of that body`).test(
      runSmak("islands", modelFile, "--body", "1"),
    ) && new RegExp(`; ${2 * knifeTriangles} triangles over every body`).test(runSmak("islands", modelFile)),
    "the command line counts a body's own",
  );
});

test("the command line lists the islands, and the pieces of one body", () => {
  // the knife with its body again in a second texture: two bodies that share nothing in the picture
  const modelFile = join(tmp, "two.mdl");
  // the number a listing opens with: "12 pieces ..." or "12 islands ..."
  const countIn = (printed) => Number(/^(\d+) (pieces|islands)/m.exec(printed)[1]);
  writeFileSync(modelFile, smak.copyBody(knife.mdl, 0, "again", { ...knife.texture, name: "second.bmp" }));

  // `pieces --body 1` lists half of them, and names the second texture only
  const piecesInAll = countIn(runSmak("pieces", modelFile));
  const piecesOfBody1 = runSmak("pieces", modelFile, "--body", "1");
  sure(
    /pieces of body 1,/.test(piecesOfBody1) &&
      countIn(piecesOfBody1) * 2 === piecesInAll &&
      /second\.bmp/.test(piecesOfBody1) &&
      !/knife\.bmp/.test(piecesOfBody1),
    `${countIn(piecesOfBody1)} pieces of body 1, ${piecesInAll} in all`,
  );

  // `islands -o` lists them all and draws one picture a texture
  const islandsListed = runSmak("islands", modelFile, "-o", join(tmp, "isl"));
  sure(
    countIn(islandsListed) === smak.uvIslands(knife.mdl).list.length * 2 &&
      existsSync(join(tmp, "isl/islands_knife.png")) &&
      existsSync(join(tmp, "isl/islands_second.png")),
    "islands",
  );
  sure(
    countIn(runSmak("islands", modelFile, "--body", "1")) * 2 === countIn(islandsListed) &&
      countIn(runSmak("islands", modelFile, "--texture", "knife.bmp")) * 2 === countIn(islandsListed),
    "islands of one body, and of one texture",
  );
});

test("the command line runs", () => {
  const modelFile = join(tmp, "knife.mdl");
  writeFileSync(modelFile, knife.mdl);

  // what it prints about a model
  sure(/ANIMATIONS \(2\)/.test(runSmak("info", modelFile)), "info");
  sure(/fit for goldsrc/.test(runSmak("check", modelFile)), "check");
  // a check that passes says so in five lines at most, the last PASS; its facts go to the file it names
  const report = join(tmp, "knife-check.txt");
  const passed = runSmak("check", modelFile, "--report", report).trim().split("\n");
  sure(
    passed.length <= 5 && passed.at(-1) === "PASS: fit for goldsrc" && passed.includes(`the detail: ${report}`),
    `check printed ${passed.join(" | ")}`,
  );
  sure(/bones, .* triangles in all/.test(readFileSync(report, "utf8")), "the facts are in the file");
  const verbose = runSmak("check", modelFile, "--verbose");
  sure(/triangles in all[^]*\nPASS: fit for goldsrc\n$/.test(verbose), `--verbose: ${verbose}`);
  sure(JSON.parse(runSmak("info", modelFile, "--json")).bones.length === 2, "info --json");

  // the pictures it draws
  runSmak("sheet", modelFile, "-o", join(tmp, "sheet.png"));
  runSmak("strip", modelFile, "--seq", "wave", "-o", join(tmp, "strip.png"));
  runSmak("textures", modelFile, "-o", join(tmp, "tex"));
  runSmak("uv", modelFile, "-o", join(tmp, "uv"));
  sure(
    existsSync(join(tmp, "sheet.png")) &&
      existsSync(join(tmp, "tex/00_knife.png")) &&
      existsSync(join(tmp, "uv/uv_knife.png")),
    "pictures",
  );

  // a texture put back from the PNG it was exported to
  runSmak("retexture", modelFile, "knife.bmp", join(tmp, "tex/00_knife.png"), "-o", join(tmp, "re.mdl"));
  sure(smak.readMdl(readFileSync(join(tmp, "re.mdl"))).textures[0].width === 256, "retexture");
  sure(/pieces,/.test(runSmak("pieces", modelFile)), "pieces");

  // an animation written out as JSON and put back from it: the poses are what they were
  runSmak("sequence", modelFile, "wave", "-o", join(tmp, "wave.json"));
  runSmak("sequence-set", modelFile, "wave", join(tmp, "wave.json"), "-o", join(tmp, "set.mdl"));
  near(
    poseGap(smak.poseAt(readFileSync(join(tmp, "set.mdl")), 1, 6), smak.poseAt(knife.mdl, 1, 6)),
    0,
    1e-3,
    "sequence-set",
  );
});
