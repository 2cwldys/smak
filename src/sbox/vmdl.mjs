// What s&box's model compiler reads besides the meshes and animations: the model's document (.vmdl, ModelDoc's
// KV3 text) and each texture's material (.vmat).
//
//   kv3(value)                        a value as KV3 text (KV3_FLOAT and KV3_INT mark a number's kind)
//   vmdlOf(model)                     the text of a .vmdl: { meshes, materials, skins, bones, bodygroups,
//                                     sequences, attachments, hitboxes, physics } (sbox/port.mjs makes it)
//   vmatOf({ color, mask, illum, flags })   the text of a .vmat for a GoldSrc texture
//
// THE DOCUMENT is a RootNode whose children are lists, each of its nodes as ModelDoc writes them (s&box's own
// citizen*.vmdl and its prefabs; the classes and their fields in modeldoc_utils.dll):
//   MaterialGroupList   DefaultMaterialGroup (each material's name in a mesh to its .vmat), a MaterialGroup a skin
//   BoneMarkupList      bone_cull_type "None": the compiler otherwise drops a bone no vertex is on (barney's root
//                       Bip01, and with it the turn it rests in and a walk's travel)
//   RenderMeshList      a RenderMeshFile a mesh (.dmx). Its name has no hyphen: "barney-x" fails as "Node ...
//                       resolve failure", with nothing else said
//   BodyGroupList       a BodyGroup a GoldSrc bodypart, a BodyGroupChoice a submodel (none of its meshes: blank)
//   AnimationList       an AnimFile an animation (.dmx), its events (AnimEvent) and its travel (ExtractMotion)
//   AttachmentList      an Attachment on its bone
//   HitboxSetList       one HitboxSet of Hitbox boxes on their bones, GoldSrc's hit group as a tag
//   PhysicsShapeList    a PhysicsHullFile a piece (its .dmx made one hull, on its bone)
//   PhysicsBodyMarkupList  a PhysicsBodyMarkup a piece whose mass is given (mass_override), a ragdoll's its inertia
//                       and damping as Source's port's QC has them
//   PhysicsJointList    a PhysicsJointRevolute or PhysicsJointConical a ragdoll's joint (physics.mjs)
// and the RootNode's anim_graph_name the model's animation graph, when it has one (graph.mjs).
//
// THE MATERIAL is complex.shader's (the shader every s&box model's material names): the picture as its colour, no
// shine (GoldSrc lit a model by its normals alone), and a texture's flags as its features: masked (64) alpha-tested
// on a mask of its holes, additive (32) added to what is behind it, fullbright (4) lit by itself.
import { png } from "../image.mjs";

/** A number written as a float (1.0) or as an int (1): KV3 keeps the kind. */
export const KV3_FLOAT = (v) => ({ kv3: "float", v });
export const KV3_INT = (v) => ({ kv3: "int", v });
const float = (v) => {
  const text = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
  return text === "-0.0" ? "0.0" : text;
};
const string = (s) => `"${String(s).replace(/\\/g, "/").replace(/"/g, "'")}"`;

/** A value as KV3 text: strings, booleans, numbers (floats unless marked), lists, and objects of keys. */
export function kv3(value, tab = "") {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return string(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return float(value);
  if (value.kv3 === "float") return float(value.v);
  if (value.kv3 === "int") return String(Math.round(value.v));
  if (Array.isArray(value)) {
    if (!value.length) return "[  ]";
    // a short list of numbers on one line, as ModelDoc writes a vector
    if (value.length <= 4 && value.every((v) => typeof v === "number"))
      return `[ ${value.map(float).join(", ")} ]`;
    return `[\n${value.map((v) => `${tab}\t${kv3(v, `${tab}\t`)},`).join("\n")}\n${tab}]`;
  }
  const lines = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .map(([key, v]) => `${tab}\t${key} = ${kv3(v, `${tab}\t`)}`);
  return `{\n${lines.join("\n")}\n${tab}}`;
}

const HEADER =
  "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:modeldoc29:version{3cec427c-1b0e-4d48-a90a-0436f33a6041} -->";

/** A list node of ModelDoc's: its class and children, and its own fields after. */
const list = (_class, children, more = {}) => ({ _class, children, ...more });

/**
 * The text of a .vmdl.
 *   meshes:      [{ name, file }]                     each mesh's node name (no hyphen) and its .dmx, under Assets/
 *   materials:   [{ name, path }]                      each material's name in the meshes and its .vmat
 *   skins:       [[{ from, to }]]                      each skin after the first: the .vmat each material becomes
 *   bones:       [name]                                kept whether or not a vertex is on them
 *   bodygroups:  [{ name, choices: [{ name, meshes }] }]
 *   sequences:   [{ name, file, fps, loops, activity, weight, fade, travel: ["LX"...], root, events: [{ frame, event, options }] }]
 *                an event with a `sound` (a .sound, under Assets) plays it: AE_CL_PLAYSOUND, at its `attachment`
 *                when it has one (AE_CL_PLAYSOUND_ATTACHMENT); any other is AE_GENERIC_EVENT
 *   attachments: [{ name, bone, pos }]
 *   hitboxes:    [{ name, bone, group, min, max }]
 *   physics:     physics.mjs's { shapes, bodies, joints }, or null
 *   graph:       the model's animation graph (.vanmgrph, under Assets), or none
 */
export function vmdlOf({
  meshes = [],
  materials = [],
  skins = [],
  bodygroups = [],
  sequences = [],
  attachments = [],
  hitboxes = [],
  physics = null,
  graph = "",
}) {
  const children = [];
  children.push(
    list("MaterialGroupList", [
      {
        _class: "DefaultMaterialGroup",
        remaps: materials.map((m) => ({ from: `${m.name}.vmat`, to: m.path })),
        use_global_default: false,
        global_default_material: "materials/default.vmat",
      },
      ...skins.map((remaps, k) => ({ _class: "MaterialGroup", name: `skin${k + 1}`, remaps })),
    ]),
  );
  children.push(list("BoneMarkupList", [], { bone_cull_type: "None" }));
  children.push(
    list(
      "RenderMeshList",
      meshes.map((m) => ({
        _class: "RenderMeshFile",
        name: m.name,
        filename: m.file,
        import_translation: [0, 0, 0],
        import_rotation: [0, 0, 0],
        import_scale: 1,
        align_origin_x_type: "None",
        align_origin_y_type: "None",
        align_origin_z_type: "None",
        parent_bone: "",
        import_filter: { exclude_by_default: false, exception_list: [] },
      })),
    ),
  );
  if (bodygroups.length)
    children.push(
      list(
        "BodyGroupList",
        bodygroups.map((g) => ({
          _class: "BodyGroup",
          name: g.name,
          children: g.choices.map((c) => ({ _class: "BodyGroupChoice", name: c.name, meshes: c.meshes })),
          hidden_in_tools: false,
        })),
      ),
    );
  if (sequences.length)
    children.push(
      list(
        "AnimationList",
        sequences.map((s) => {
          const inside = [];
          if (s.travel?.length)
            inside.push({
              _class: "ExtractMotion",
              extract_tx: s.travel.includes("LX"),
              extract_ty: s.travel.includes("LY"),
              extract_tz: s.travel.includes("LZ"),
              extract_rz: false,
              linear: true,
              quadratic: false,
              root_bone_name: s.root ?? "",
              motion_type: "Single",
            });
          for (const e of s.events ?? [])
            inside.push(
              e.sound
                ? {
                    _class: "AnimEvent",
                    event_class: e.attachment ? "AE_CL_PLAYSOUND_ATTACHMENT" : "AE_CL_PLAYSOUND",
                    event_frame: KV3_INT(e.frame),
                    event_keys: e.attachment ? { name: e.sound, attachment: e.attachment } : { name: e.sound },
                  }
                : {
                    _class: "AnimEvent",
                    event_class: "AE_GENERIC_EVENT",
                    event_frame: KV3_INT(e.frame),
                    event_keys: { TypeName: "goldsrc", Int: KV3_INT(e.event), StringData: e.options ?? "" },
                  },
            );
          return {
            _class: "AnimFile",
            name: s.name,
            children: inside.length ? inside : undefined,
            activity_name: s.activity ?? "",
            activity_weight: KV3_INT(s.weight ?? 1),
            weight_list_name: "",
            fade_in_time: s.fade ?? 0.2,
            fade_out_time: s.fade ?? 0.2,
            looping: Boolean(s.loops),
            delta: false,
            worldSpace: false,
            hidden: false,
            anim_markup_ordered: false,
            disable_compression: false,
            disable_interpolation: false,
            enable_scale: false,
            source_filename: s.file,
            start_frame: KV3_INT(-1),
            end_frame: KV3_INT(-1),
            framerate: s.fps,
            take: KV3_INT(0),
            reverse: false,
          };
        }),
        { default_root_bone_name: "" },
      ),
    );
  if (attachments.length)
    children.push(
      list(
        "AttachmentList",
        attachments.map((a) => ({
          _class: "Attachment",
          name: a.name,
          parent_bone: a.bone,
          relative_origin: a.pos,
          relative_angles: a.angles ?? [0, 0, 0],
          weight: 1,
          ignore_rotation: false,
        })),
      ),
    );
  if (hitboxes.length)
    children.push(
      list("HitboxSetList", [
        {
          _class: "HitboxSet",
          name: "default",
          children: hitboxes.map((h) => ({
            _class: "Hitbox",
            name: h.name,
            parent_bone: h.bone,
            surface_property: "flesh",
            translation_only: false,
            tags: `hitgroup_${h.group}`,
            hitbox_mins: h.min,
            hitbox_maxs: h.max,
          })),
        },
      ]),
    );
  if (physics?.shapes.length)
    children.push(
      list(
        "PhysicsShapeList",
        physics.shapes.map((s) => ({
          _class: "PhysicsHullFile",
          name: s.name,
          parent_bone: s.bone,
          surface_prop: s.surface,
          collision_tags: "solid",
          recenter_on_parent_bone: false,
          offset_origin: [0, 0, 0],
          offset_angles: [0, 0, 0],
          align_origin_x_type: "None",
          align_origin_y_type: "None",
          align_origin_z_type: "None",
          filename: s.file,
          import_scale: 1,
          faceMergeAngle: 10,
          maxHullVertices: KV3_INT(0),
          import_mode: "SingleHull",
          optimization_algorithm: "Exact",
          import_filter: { exclude_by_default: false, exception_list: [] },
        })),
      ),
    );
  if (physics?.bodies.length)
    children.push(
      list(
        "PhysicsBodyMarkupList",
        physics.bodies.map((b) => ({
          _class: "PhysicsBodyMarkup",
          target_body: b.bone,
          mass_override: b.mass,
          // a ragdoll's pieces as Source's: $inertia, $damping, $rotdamping
          inertia_scale: b.inertia,
          linear_damping: b.damping,
          angular_damping: b.rotdamping,
        })),
      ),
    );
  if (physics?.joints.length)
    children.push(
      list("PhysicsJointList", [
        ...physics.joints.map((j) => {
          const joint = {
            parent_body: j.parent,
            child_body: j.child,
            anchor_origin: j.origin,
            anchor_angles: j.angles,
            collision_enabled: false,
          };
          return j.kind === "hinge"
            ? {
                _class: "PhysicsJointRevolute",
                ...joint,
                enable_limit: true,
                min_angle: j.min,
                max_angle: j.max,
              }
            : {
                _class: "PhysicsJointConical",
                ...joint,
                enable_swing_limit: true,
                swing_limit: j.swing,
                swing_offset_angle: [0, 0, 0],
                enable_twist_limit: true,
                min_twist_angle: j.twist[0],
                max_twist_angle: j.twist[1],
              };
        }),
      ]),
    );
  const root = {
    rootNode: {
      _class: "RootNode",
      children,
      model_archetype: "",
      primary_associated_entity: "",
      anim_graph_name: graph,
    },
  };
  return `${HEADER}\n${kv3(root)}\n`;
}

/** GoldSrc's texture flags (STUDIO_NF_ of studio.h). */
const NF = { fullbright: 4, additive: 32, masked: 64 };

/** A picture all white (4 by 4), for a fullbright texture's `illum`. */
export const WHITE_PNG = png(4, 4, new Uint8Array(64).fill(255));

/**
 * The text of a .vmat for a GoldSrc texture: `color` its picture, `mask` (a masked texture's) the picture of its
 * holes, black where the last colour of its palette was, `illum` (a fullbright one's) a white picture (WHITE_PNG),
 * where it lights itself.
 */
export function vmatOf({ color, mask, illum, flags = 0, tint }) {
  const lines = [
    "// Made by SMAK (sbox-port) from a GoldSrc texture.",
    "",
    "Layer0",
    "{",
    '\tshader "shaders/complex.shader"',
  ];
  if (flags & NF.masked && mask) lines.push("\tF_ALPHA_TEST 1");
  if (flags & NF.additive) lines.push("\tF_TRANSLUCENT 1", "\tF_ADDITIVE_BLEND 1");
  if (flags & NF.fullbright) lines.push("\tF_SELF_ILLUM 1");
  lines.push(
    `\tTextureColor ${string(color)}`,
    '\tTextureRoughness "[1.000000 1.000000 1.000000 0.000000]"',
    '\tg_flMetalness "0.000"',
  );
  // a colour the texture is multiplied by: a brush entity's renderamt drawn additive (GoldSrc's kRenderTransAdd)
  if (tint !== undefined) lines.push(`\tg_vColorTint "[${tint.map((t) => t.toFixed(6)).join(" ")} 0.000000]"`);
  if (flags & NF.masked && mask)
    lines.push(`\tTextureTranslucency ${string(mask)}`, '\tg_flAlphaTestReference "0.500"');
  if (flags & NF.fullbright)
    // its mask a picture: complex.shader's mask given as a colour ("[1 1 1 0]") is made a texture under
    // materials/default/ that s&box does not have, and the face is drawn red (stalkyard's lamps, 2026-10-27)
    lines.push(`\tTextureSelfIllumMask ${illum ? string(illum) : '"[1.000000 1.000000 1.000000 0.000000]"'}`, '\tg_vSelfIllumTint "[1.000000 1.000000 1.000000 0.000000]"', '\tg_flSelfIllumAlbedoFactor "1.000"', '\tg_flSelfIllumBrightness "0.000"', '\tg_flSelfIllumScale "1.000"'); // prettier-ignore
  lines.push("}", "");
  return lines.join("\n");
}
