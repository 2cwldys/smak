// The editor, 0.5.1: adjustments (brightness, hue, tint ...) for chosen colours of a texture only, the same
// whether the server bakes them or the command line does; and the pictures the editor's page asks for.
//
// The texture is a picture of two metals, a steel and a brass, each in eight shades, in stripes: palette
// colours 0 to 7 are the steel, 8 to 15 the brass.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import * as smak from "../src/index.mjs";
import { testAsync, sure, tmp, EDITOR_CLI, apiCaller, quietly, knife } from "./helper.mjs";

// 256 x 256: stripes 16 pixels wide, steel and brass in turn; the shade goes up every 32 rows
const metals = {
  name: "knife.bmp",
  flags: 0,
  width: 256,
  height: 256,
  pixels: Uint8Array.from({ length: 65536 }, (_, i) => ((i >> 4) % 2) * 8 + ((i >> 8) >> 5)),
  palette: new Uint8Array(768),
};
for (let shade = 0; shade < 8; shade++) {
  metals.palette.set([30 + shade * 28, 30 + shade * 28, 32 + shade * 28], shade * 3);
  metals.palette.set([60 + shade * 24, 45 + shade * 20, 15 + shade * 10], (8 + shade) * 3);
}

/** whether two arrays of bytes hold the same bytes */
const sameBytes = (a, b) => Buffer.from(a).equals(Buffer.from(b));

await testAsync(
  "the editor adjusts the chosen colours only, the same from the server and the command line",
  "the editor's colours",
  async () => {
    const core = await import("../editor/core.mjs");
    const { serve } = await import("../editor/serve.mjs");
    const modelsFolder = join(tmp, "tone");
    const workFolder = join(tmp, "tone-work");
    const projectFile = join(workFolder, "two.smakproj.json");

    // the knife wearing the two metals, as the one model of the folder
    const twoMetalsMdl = smak.replaceTexture(knife.mdl, 0, metals);
    mkdirSync(modelsFolder);
    writeFileSync(join(modelsFolder, "two.mdl"), twoMetalsMdl);

    // how like two colours are: a metal's own shades are near, the other metal is far, whatever the
    // brightness
    const paletteColour = (index) => [...metals.palette.subarray(index * 3, index * 3 + 3)];
    const brass = paletteColour(12);
    const steel = paletteColour(4);
    sure(
      [8, 9, 10, 11, 13, 14, 15].every((index) => core.colourGap(brass, paletteColour(index)) < 20) &&
        [0, 1, 2, 3, 4, 5, 6, 7].every((index) => core.colourGap(brass, paletteColour(index)) > 35),
      "the brass's shades are within 20 of it and the steel's past 35",
    );
    sure(
      [0, 1, 2, 3, 5, 6, 7].every((index) => core.colourGap(steel, paletteColour(index)) < 25) &&
        [8, 9, 10, 11, 12, 13, 14, 15].every((index) => core.colourGap(steel, paletteColour(index)) > 35),
      "and the steel's the same of the brass",
    );

    // a selection is a colour and a tolerance: selectedBy gives a 1 or a 0 for each of the 256 colours
    const brassChosen = core.selectedBy(metals.palette, { colour: brass, tolerance: 20 });
    const allButBrass = core.selectedBy(metals.palette, { colour: brass, tolerance: 20, invert: true });
    sure(
      [...brassChosen.subarray(0, 16)].join("") === "0000000011111111" &&
        brassChosen.every((chosen, index) => chosen + allButBrass[index] === 1) &&
        core.selectedBy(metals.palette, null).every((chosen) => chosen === 1) &&
        core
          .selectedBy(metals.palette, { colour: brass, tolerance: 0 })
          .reduce((count, chosen) => count + chosen, 0) === 1,
      "selectedBy: the brass, its inverse, all, and one colour alone",
    );

    // without a selection the arithmetic is 0.5.0's to the digit (these six numbers are what 0.5.0 gave)
    const adjustments = {
      brightness: 10,
      contrast: -17,
      saturation: 30,
      hue: 150,
      tint: [192, 128, 64],
      tintAmount: 40,
    };
    const twoColours = Uint8Array.from([200, 100, 50, 90, 90, 90, ...new Array(762).fill(0)]);
    sure(
      [...core.adjustPalette(twoColours, adjustments).subarray(0, 6)].join() === "39,149,111,101,89,78",
      "the adjustments of the whole palette changed",
    );

    // the metals' palette adjusted three ways: all of it, the brass only, all but the brass
    const wholeAdjusted = core.adjustPalette(metals.palette, adjustments);
    const brassAdjusted = core.adjustPalette(metals.palette, {
      ...adjustments,
      select: { colour: brass, tolerance: 20 },
    });
    const steelAdjusted = core.adjustPalette(metals.palette, {
      ...adjustments,
      select: { colour: brass, tolerance: 20, invert: true },
    });
    sure(
      brassAdjusted.every(
        (byte, i) => byte === (brassChosen[Math.floor(i / 3)] ? wholeAdjusted : metals.palette)[i],
      ) &&
        steelAdjusted.every(
          (byte, i) => byte === (allButBrass[Math.floor(i / 3)] ? wholeAdjusted : metals.palette)[i],
        ),
      "the chosen colours take the adjustment and the others stay",
    );
    // told the texture is masked, a selection wide enough for every colour still leaves out colour 255
    const chosenOfMasked = core.selectedBy(metals.palette, { colour: [0, 0, 0], tolerance: 100 }, true);
    sure(
      chosenOfMasked[255] === 0 && chosenOfMasked[254] === 1,
      "the hole's colour of a masked texture is never chosen",
    );

    // the server, and the three ways this case talks to the editor
    const server = await quietly(() => serve(modelsFolder, { port: 0, work: workFolder }));
    const address = `http://127.0.0.1:${server.address().port}`;
    const call = apiCaller(address);
    // the agent's side: node editor/cli.mjs <project> <args>, what it prints returned and its errors kept
    // off the test's output
    const projectCli = (...args) =>
      execFileSync(process.execPath, [EDITOR_CLI, projectFile, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    // a picture or a file from the server, which must answer 200
    const fetchBytes = async (path) => {
      const response = await fetch(address + path);
      sure(response.status === 200, `${path}: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    };
    // the project baked by the command line and by the server: the two files must be the same, and the
    // palette of the model's texture in them is returned
    const bakedPalette = async () => {
      projectCli("bake", "-o", "cli.mdl");
      const fromCli = readFileSync(join(workFolder, "cli.mdl"));
      const fromServer = readFileSync((await call("bake", { model: "two.mdl" }, {})).out);
      sure(fromCli.equals(fromServer), "the server and the command line baked different files");
      return smak.textureOf(fromCli, 0).palette;
    };
    // what the project file says of texture 0
    const textureEntry = () => JSON.parse(readFileSync(projectFile, "utf8")).textures["0"];
    // the project file's text without its revision number and its log, which change with every edit
    const projectText = () => readFileSync(projectFile, "utf8").replace(/"rev".*|"log"[^]*/g, "");

    try {
      execFileSync(process.execPath, [
        EDITOR_CLI,
        "new",
        join(modelsFolder, "two.mdl"),
        projectFile,
        "--engine",
        "goldsrc",
      ]);

      // a project as 0.5.0 wrote one: the whole palette, as before
      projectCli(
        "texture",
        "0",
        "--hue",
        "150",
        "--brightness",
        "10",
        "--contrast",
        "-17",
        "--saturation",
        "30",
        "--tint",
        "192,128,64,40",
      );
      sure(
        JSON.stringify(textureEntry().adjust) === JSON.stringify(adjustments),
        `the project of a whole adjustment: ${JSON.stringify(textureEntry().adjust)}`,
      );
      const projectBeforeSelection = projectText();
      sure(
        sameBytes(await bakedPalette(), wholeAdjusted),
        "a project without a selection bakes the whole palette",
      );

      // a colour chosen under a pixel (a brass stripe's), from the command line: kept in the project with
      // the adjustments
      const printedBySelectAt = projectCli("texture", "0", "--select-at", "20,140");
      sure(
        JSON.stringify(textureEntry().adjust.select) === JSON.stringify({ colour: brass, tolerance: 20 }) &&
          /8 of the 16 colours the picture uses, 50\.0% of its pixels/.test(printedBySelectAt),
        `--select-at: ${JSON.stringify(textureEntry().adjust.select)}; ${printedBySelectAt}`,
      );
      sure(
        sameBytes(await bakedPalette(), brassAdjusted),
        "the selection baked: the brass adjusted, the steel as it was",
      );
      // the page asks the same of a pixel it is clicked on, by its place from 0 to 1 across the picture
      const pixel = await call("pixel", { model: "two.mdl", i: 0, u: 20.5 / 256, v: 140.5 / 256 });
      sure(
        pixel.colour.join() === brass.join() && pixel.index === 12 && pixel.taken === 8 && pixel.used === 16,
        `the page's pixel call: ${JSON.stringify(pixel)}`,
      );

      // the selection turned about and narrowed
      projectCli("texture", "0", "--invert", "--tolerance", "18");
      sure(
        JSON.stringify(textureEntry().adjust.select) ===
          JSON.stringify({ colour: brass, tolerance: 18, invert: true }),
        `--invert --tolerance: ${JSON.stringify(textureEntry().adjust.select)}`,
      );
      sure(
        sameBytes(await bakedPalette(), steelAdjusted),
        "the inverse baked: the steel adjusted, the brass as it was",
      );

      // the pictures: the selection shown over the texture, the texture without its adjustments, and both
      // from the command line
      const shown = smak.unpng(await fetchBytes("/api/texture?model=two.mdl&i=0"));
      const withMask = smak.unpng(await fetchBytes("/api/texture?model=two.mdl&i=0&mask=1"));
      const unadjusted = smak.unpng(await fetchBytes("/api/texture?model=two.mdl&i=0&plain=1&as=png"));
      // the colour of one pixel of a picture, as text
      const colourAt = (image, x, y) =>
        [...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)].join();
      // (4, 140) is on a steel stripe, which the selection takes now; (20, 140) on a brass one, which it
      // leaves alone
      sure(
        colourAt(withMask, 4, 140) === colourAt(shown, 4, 140) &&
          colourAt(withMask, 20, 140) !== colourAt(shown, 20, 140) &&
          colourAt(unadjusted, 20, 140) === brass.join() &&
          colourAt(shown, 20, 140) === brass.join(),
        "the mask dims what the selection leaves alone, and the plain picture is the one before the adjustments",
      );
      projectCli(
        "texture",
        "0",
        "--export",
        join(workFolder, "plain.png"),
        "--plain",
        "--mask",
        join(workFolder, "mask.png"),
      );
      sure(
        sameBytes(smak.unpng(readFileSync(join(workFolder, "plain.png"))).rgba, smak.rgbaOf(metals)) &&
          sameBytes(smak.unpng(readFileSync(join(workFolder, "mask.png"))).rgba, withMask.rgba),
        "--export --plain and --mask",
      );

      // after --no-adjust no colour is chosen: a tolerance alone is refused
      let refusal = "";
      try {
        projectCli("texture", "0", "--no-adjust");
        projectCli("texture", "0", "--tolerance", "5");
      } catch (e) {
        refusal = String(e.stderr);
      }
      sure(/choose a colour/.test(refusal), "a tolerance with no colour chosen is refused in words");

      // all colours again: the project and the baked file are what they were before any selection
      projectCli(
        "texture",
        "0",
        "--hue",
        "150",
        "--brightness",
        "10",
        "--contrast",
        "-17",
        "--saturation",
        "30",
        "--tint",
        "192,128,64,40",
        "--select",
        brass.join(),
        "--no-invert",
      );
      projectCli("texture", "0", "--all-colours");
      sure(
        projectText() === projectBeforeSelection && sameBytes(await bakedPalette(), wholeAdjusted),
        "--all-colours leaves the project as it was before the selection",
      );

      // a picture dropped on a texture that has adjustments: the command line says they stand on top
      writeFileSync(join(workFolder, "drop.png"), smak.png(256, 256, smak.rgbaOf(metals)));
      sure(
        /adjustments on top/.test(projectCli("texture", "0", "--file", join(workFolder, "drop.png"))) &&
          !/adjustments on top/.test(projectCli("texture", "0", "--no-adjust")),
        "a replaced picture with adjustments on top is said",
      );

      // smak's picture as the page asks for it: from the orbit camera with perspective, and with both
      // sides of every triangle
      const BACKGROUND = [58, 62, 70];
      // how many pixels of a picture are clearly not the background
      const drawnPixels = (image) => {
        let count = 0;
        for (let i = 0; i < image.rgba.length; i += 4)
          if (
            Math.abs(image.rgba[i] - BACKGROUND[0]) +
              Math.abs(image.rgba[i + 1] - BACKGROUND[1]) +
              Math.abs(image.rgba[i + 2] - BACKGROUND[2]) >
            12
          )
            count++;
        return count;
      };
      const orbit = "/api/render?model=two.mdl&view=orbit&w=200&h=150&yaw=60&pitch=10&fov=40&target=12,0,10";
      const fromFar = drawnPixels(smak.unpng(await fetchBytes(orbit + "&dist=140")));
      const fromNearer = drawnPixels(smak.unpng(await fetchBytes(orbit + "&dist=70")));
      const bothSides = drawnPixels(smak.unpng(await fetchBytes(orbit + "&dist=70&both=1")));
      sure(
        fromFar > 25 && fromNearer > fromFar * 2.5 && bothSides >= fromNearer,
        `the orbit camera nearer draws the model larger (${fromFar} dots, then ${fromNearer}), and both sides no fewer (${bothSides})`,
      );
    } finally {
      server.close();
    }
  },
);
