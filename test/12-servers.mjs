// The two local servers, started on a free port and asked what their pages ask: the viewer (models side by
// side in the browser) and the editor (animations, events and textures by hand, in a project file that the
// person's page and the agent's command line share). No browser is needed: the page's requests are made here.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import * as smak from "../src/index.mjs";
import { testAsync, sure, near, poseGap, tmp, EDITOR_CLI, apiCaller, quietly, knife } from "./helper.mjs";

// ── the viewer ──

await testAsync("the viewer serves the models it is given", "the viewer", async () => {
  const { view } = await import("../viewer/serve.mjs");

  // three files in the temp folder. A model's textures may be kept in a file named <model>t.mdl: beside
  // knife.mdl, knifet.mdl is taken for that; desert.mdl ends in t too, but there is no "deser.mdl"
  writeFileSync(join(tmp, "knife.mdl"), knife.mdl);
  writeFileSync(join(tmp, "knifet.mdl"), knife.mdl);
  writeFileSync(join(tmp, "desert.mdl"), knife.mdl);

  // the server prints its address when it starts: that is kept off the test's output
  const server = await quietly(() => view([tmp], 0));
  const address = `http://127.0.0.1:${server.address().port}`;
  const get = (path) => fetch(address + path);
  let model;
  let frame;
  let texturePng;
  let page;

  // the server is stopped whatever a request does
  try {
    const models = await (await get("/api/models")).json();
    sure(
      models.some((listed) => listed.name === "desert") && !models.some((listed) => listed.name === "knifet"),
      "a name ending in t is listed, another model's texture file is not",
    );

    // everything the page asks for one model: its description, one frame's corners, a texture, the page
    const id = encodeURIComponent(models.find((listed) => listed.name === "knife").id);
    model = await (await get(`/api/model?id=${id}`)).json();
    frame = new Float32Array(await (await get(`/api/frame?id=${id}&seq=1&frame=3`)).arrayBuffer());
    texturePng = Buffer.from(await (await get(`/api/texture?id=${id}&n=0`)).arrayBuffer());
    page = await (await get("/")).text();
  } finally {
    server.close();
  }

  // the texture coordinates come as 6 numbers a triangle, a frame as 18
  sure(
    model.triangles === knife.piece.tris.length &&
      model.sequences.length === 2 &&
      model.uv.length === model.triangles * 6,
    "the model",
  );
  sure(frame.length === model.triangles * 18, "a frame");
  sure(smak.unpng(texturePng).width === 256, "a texture");
  sure(/<canvas/.test(page), "the page");
});

// ── the editor ──

await testAsync(
  "the editor keys, bakes, leaves a mixed animation whole and tidies replaced pictures",
  "the editor",
  async () => {
    const { serve } = await import("../editor/serve.mjs");
    const modelsFolder = join(tmp, "edit");
    const workFolder = join(tmp, "edit-work"); // where the server keeps projects, pictures and baked models
    const projectFile = join(workFolder, "knife.smakproj.json");

    // three models to edit: the knife, the knife under a view model's name, and one whose wave is an
    // animation the game mixes from two (two blends)
    mkdirSync(modelsFolder);
    writeFileSync(join(modelsFolder, "knife.mdl"), knife.mdl);
    writeFileSync(join(modelsFolder, "v_knife.mdl"), knife.mdl);
    writeFileSync(
      join(modelsFolder, "aim.mdl"),
      smak.replaceSequence(knife.mdl, 1, { blends: [knife.wave, knife.wave] }),
    );

    const server = await quietly(() => serve(modelsFolder, { port: 0, work: workFolder }));
    const address = `http://127.0.0.1:${server.address().port}`;
    const call = apiCaller(address);
    // the agent's side: node editor/cli.mjs <args>
    const editorCli = (...args) =>
      execFileSync(process.execPath, [EDITOR_CLI, ...args], { encoding: "utf8" });

    try {
      const listed = await call("models", {});
      const opened = await call("open", { model: "knife.mdl" });
      const openedViewModel = await call("open", { model: "v_knife.mdl" });
      sure(
        listed.models.length === 3 && opened.seqs.length === 2 && opened.project.engine === "goldsrc",
        "the models and a project for one",
      );
      sure(
        openedViewModel.viewModel && !opened.viewModel,
        "v_<name>.mdl is seen from the eye, another from outside",
      );

      // the agent keys a bone from the command line, the page's server bakes it: the same project file
      editorCli("new", join(modelsFolder, "knife.mdl"), projectFile, "--engine", "goldsrc");
      editorCli(projectFile, "key", "wave", "hand", "6", "--rot", "0,30,0", "--spread", "0");
      const baked = await call("bake", { model: "knife.mdl" }, {});
      const bakedMdl = readFileSync(baked.out);
      sure(!baked.errors.length, baked.errors.join("; "));
      sure(
        poseGap(smak.poseAt(bakedMdl, 1, 6), smak.poseAt(knife.mdl, 1, 6)) > 0.05,
        "the key moved nothing",
      );
      near(
        poseGap(smak.poseAt(bakedMdl, 1, 0), smak.poseAt(knife.mdl, 1, 0)),
        0,
        1e-3,
        "a frame without a key",
      );
      sure(
        readFileSync(join(modelsFolder, "knife.mdl")).equals(knife.mdl),
        "the source model was written to",
      );

      // an animation the game mixes from two: its motion is refused, its speed is not, and it keeps both
      const keyOnTheHand = {
        set: [{ path: ["anims", 1, "keys", "hand", "6"], value: [8, 0, 0, 0, 0.9, 0.3] }],
        what: "a key",
        by: "person",
      };
      let refusal = "";
      try {
        await call("patch", { model: "aim.mdl" }, keyOnTheHand);
      } catch (e) {
        refusal = e.message;
      }
      sure(/mixes/.test(refusal), "a key on a mixed animation was taken");
      await call(
        "patch",
        { model: "aim.mdl" },
        { set: [{ path: ["anims", 1, "fps"], value: 20 }], what: "slower", by: "person" },
      );
      const bakedAim = await call("bake", { model: "aim.mdl" }, {});
      const mixedAnimation = smak.sequences(readFileSync(bakedAim.out))[1];
      sure(
        mixedAnimation.blends === 2 && mixedAnimation.fps === 20,
        `the mixed animation came out with ${mixedAnimation.blends} and ${mixedAnimation.fps} fps`,
      );
      sure(/<canvas/.test(await (await fetch(address + "/")).text()), "the page");

      // pictures dropped on one texture, one after another: the one the project names and the last eight
      // before it stay, the older ones go
      const picture = smak.png(knife.texture.width, knife.texture.height, smak.rgbaOf(knife.texture));
      // drops the picture on texture 0 and gives the file the project now names for it
      const dropPicture = async () => {
        const response = await fetch(`${address}/api/upload?model=knife.mdl&i=0&name=again.png`, {
          method: "POST",
          body: picture,
        });
        return (await response.json()).project.textures["0"].file;
      };
      const droppedFiles = [];
      for (let n = 0; n < 12; n++) droppedFiles.push(await dropPicture());
      const keptFiles = readdirSync(join(workFolder, "knife.tex"));
      sure(
        new Set(droppedFiles).size === 12 &&
          keptFiles.length === 9 &&
          droppedFiles.slice(3).every((file) => existsSync(join(workFolder, file))) &&
          droppedFiles.slice(0, 3).every((file) => !existsSync(join(workFolder, file))),
        `of 12 pictures dropped on a texture ${keptFiles.length} files are kept`,
      );
      // an undo sets the texture's file back to an earlier one: a file that was kept is found
      await call(
        "patch",
        { model: "knife.mdl" },
        { set: [{ path: ["textures", "0", "file"], value: droppedFiles[4] }], what: "undo", by: "person" },
      );
      sure(
        (await fetch(`${address}/api/texture?model=knife.mdl&i=0`)).status === 200,
        "an undo back to a kept picture finds it",
      );
      // and one that was tidied away is refused
      let refusalOfGoneFile = "";
      try {
        await call(
          "patch",
          { model: "knife.mdl" },
          { set: [{ path: ["textures", "0", "file"], value: droppedFiles[0] }], what: "undo", by: "person" },
        );
      } catch (e) {
        refusalOfGoneFile = e.message;
      }
      sure(
        /not on the disk/.test(refusalOfGoneFile),
        "an undo back to a picture that was removed is refused in words",
      );

      // what the page asks every second: the model's file and the folder's list, so that it need not be
      // reloaded
      const revBefore = await call("rev", { model: "aim.mdl" });
      sure(
        revBefore.src === (await call("open", { model: "aim.mdl" })).stamp && revBefore.rev === 1,
        "the stamp of the model's file and the project's revision",
      );
      writeFileSync(join(modelsFolder, "aim.mdl"), smak.replaceSequence(knife.mdl, 1, { fps: 9 }));
      writeFileSync(join(modelsFolder, "late.mdl"), knife.mdl);
      const revAfter = await call("rev", { model: "aim.mdl" });
      sure(
        revAfter.src !== revBefore.src && revAfter.list !== revBefore.list,
        "a model written anew and another added went unseen",
      );
      sure((await call("rev", { model: "gone.mdl" })).src === null, "a model that is not there");
    } finally {
      server.close();
    }
  },
);
