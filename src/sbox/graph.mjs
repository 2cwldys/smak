// A ported model's animation graph (.vanmgrph, s&box's KV3 text): GoldSrc's way of choosing an animation and
// blending it, as nodes of s&box's graph.
//
//   graphOf({ sequences, poses, fade, preview })   the text of a .vanmgrph (sbox/port.mjs makes it)
//   GRAPH_SEQUENCE                                 the parameter that chooses the animation
//
// WHAT IT IS. GoldSrc's game code chose an animation by number (pev->sequence) and how far along its blends it was
// (pev->blending, Half-Life's aiming up and down: SetBlending's value between the blends' start and end). s&box
// blends only in a graph, so the graph is that: a selector on an enum parameter, `sequence`, an option an
// animation by its name (the game's code: renderer.Set( "sequence", "shoot" )), and under it each animation as it
// plays: one that does not blend as a sequence node, one that blends on one axis as a blend node over its blends at
// the values they stand for (blend_xr from -50 to 50), on two as a 2D blend of its four. Each axis is a float
// parameter named as the GMod port's pose parameter (blend_xr), ranging over the values of every animation that
// blends on it; a blend node holds a value past its own range at its end, as GoldSrc's SetBlending does.
//
// AS s&box WRITES IT: the classes and fields of s&box's own graphs (citizen.vanmgrph and its subgraphs):
// CSelectorAnimNode (SelectionSource_Enum, m_bResetOnChange: a new animation starts at its first frame, as
// GoldSrc's ResetSequenceInfo), CSequenceAnimNode, CBlendAnimNode (BlendKey_UserValue), CBlend2DAnimNode,
// CEnumAnimParameter, CFloatAnimParameter; a node's input or a parameter named by its id, 4294967295 for none.
import { kv3, KV3_INT } from "./vmdl.mjs";

const HEADER =
  "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:animgraph2:version{0f7898b8-5471-45c4-9867-cd9c46bcfdb5} -->";
/** The parameter that chooses the animation: an enum, an option each animation. */
export const GRAPH_SEQUENCE = "sequence";
/** No node, output or parameter. */
const NONE = 4294967295;
const id = (n) => ({ m_id: KV3_INT(n) });
const input = (node) => ({ m_nodeID: id(node), m_outputID: id(NONE) });
const NO_DAMPING = {
  _class: "CAnimInputDamping",
  m_speedFunction: "NoDamping",
  m_fSpeedScale: 1,
  m_fMinSpeed: 0,
  m_fMaxTension: 1000,
  m_fTension: 100,
  m_fDamping: 5,
};

/**
 * The text of a .vanmgrph.
 *   sequences: [{ name, loops, blends: [{ pose, start, end }], files: [the animation of each blend, by name] }]
 *              in the model's order: the first is what the graph plays until told
 *   poses:     [{ name, min, max }]  each blend axis's parameter; it starts at 0, held inside its range
 *   fade:      seconds one animation fades into the next (0: at once, a view model's)
 *   preview:   the model the graph's editor shows (its .vmdl, under Assets)
 */
export function graphOf({ sequences, poses = [], fade = 0.2, preview }) {
  let next = 1000;
  const nodes = [];
  const add = (node, at) => {
    const own = next++;
    nodes.push({ key: id(own), value: { ...node, m_vecPosition: at, m_nNodeID: id(own), m_sNote: "" } });
    return own;
  };
  const params = new Map();
  const param = (name) => {
    if (!params.has(name)) params.set(name, next++);
    return params.get(name);
  };
  const choose = param(GRAPH_SEQUENCE);
  const sequenceNode = (name, loops, at) =>
    add(
      { _class: "CSequenceAnimNode", m_sName: name, m_tagSpans: [], m_sequenceName: name, m_playbackSpeed: 1, m_bLoop: loops }, // prettier-ignore
      at,
    );
  const children = sequences.map((s, i) => {
    const y = i * 160;
    if (s.blends.length === 2)
      // GoldSrc's four: the first axis's two at the second's start, then at its end
      return add(
        {
          _class: "CBlend2DAnimNode",
          m_sName: s.name,
          m_items: s.files.map((file, k) => ({
            _class: "CBlend2DItem",
            m_tagSpans: [],
            m_sequenceName: file,
            m_blendValue: [k % 2 ? s.blends[0].end : s.blends[0].start, k < 2 ? s.blends[1].start : s.blends[1].end],
          })),
          m_blendSourceX: "Parameter",
          m_paramX: id(param(s.blends[0].pose)),
          m_blendSourceY: "Parameter",
          m_paramY: id(param(s.blends[1].pose)),
          m_bLoop: s.loops,
          m_bLockBlendOnReset: false,
          m_bLockWhenWaning: false,
          m_playbackSpeed: 1,
          m_damping: NO_DAMPING,
        },
        [-400, y],
      );
    if (s.blends.length === 1) {
      const [{ pose, start, end }] = s.blends;
      // a blend node's children in the order of their values
      const ends = [
        { file: s.files[0], value: start },
        { file: s.files[1], value: end },
      ].sort((a, b) => a.value - b.value);
      const inputs = ends.map((e, k) => ({ ...e, node: sequenceNode(e.file, s.loops, [-800, y + k * 80]) }));
      return add(
        {
          _class: "CBlendAnimNode",
          m_sName: s.name,
          m_children: inputs.map((e) => ({ m_inputConnection: input(e.node), m_name: e.file, m_blendValue: e.value })),
          m_blendValueSource: "Parameter",
          m_param: id(param(pose)),
          m_blendKeyType: "BlendKey_UserValue",
          m_bLockBlendOnReset: false,
          m_bSyncCycles: true,
          m_bLoop: s.loops,
          m_bLockWhenWaning: false,
          m_damping: NO_DAMPING,
        },
        [-400, y],
      );
    }
    return sequenceNode(s.name, s.loops, [-400, y]);
  });
  const selector = add(
    {
      _class: "CSelectorAnimNode",
      m_sName: GRAPH_SEQUENCE,
      m_children: children.map(input),
      m_tags: children.map(() => id(NONE)),
      m_selectionSource: "SelectionSource_Enum",
      m_boolParamID: id(NONE),
      m_enumParamID: id(choose),
      m_intParamID: id(NONE),
      m_intParamMinValue: KV3_INT(0),
      m_intParamMaxValue: KV3_INT(Math.max(0, sequences.length - 1)),
      m_blendDuration: fade,
      m_tagBehavior: "SelectorTagBehavior_OnWhileCurrent",
      m_bResetOnChange: true,
      m_bSyncCyclesOnChange: false,
    },
    [0, 0],
  );
  nodes.unshift({
    key: id(next),
    value: {
      _class: "CRootAnimNode",
      m_sName: "Unnamed",
      m_vecPosition: [300, 0],
      m_nNodeID: id(next),
      m_sNote: "",
      m_inputConnection: input(selector),
    },
  });
  const parameters = [
    {
      _class: "CEnumAnimParameter",
      m_name: GRAPH_SEQUENCE,
      m_id: id(choose),
      m_previewButton: "ANIMPARAM_BUTTON_NONE",
      m_bUseMostRecentValue: false,
      m_bAutoReset: false,
      m_defaultValue: KV3_INT(0),
      m_enumOptions: sequences.map((s) => s.name),
    },
    ...poses.map((p) => ({
      _class: "CFloatAnimParameter",
      m_name: p.name,
      m_id: id(param(p.name)),
      m_previewButton: "ANIMPARAM_BUTTON_NONE",
      m_bUseMostRecentValue: false,
      m_bAutoReset: false,
      m_fDefaultValue: Math.min(p.max, Math.max(p.min, 0)),
      m_fMinValue: p.min,
      m_fMaxValue: p.max,
    })),
  ];
  const graph = {
    _class: "CAnimationGraph",
    m_nodeManager: { _class: "CAnimNodeManager", m_nodes: nodes },
    m_pParameterList: { _class: "CAnimParameterList", m_Parameters: parameters },
    m_pTagManager: { _class: "CAnimTagManager", m_tags: [] },
    m_pMovementManager: {
      _class: "CAnimMovementManager",
      m_MotorList: { _class: "CAnimMotorList", m_motors: [] },
      m_MovementSettings: { _class: "CAnimMovementSettings", m_bShouldCalculateSlope: false },
    },
    m_pSettingsManager: {
      _class: "CAnimGraphSettingsManager",
      m_settingsGroups: [{ _class: "CAnimGraphGeneralSettings", m_iGridSnap: KV3_INT(16) }],
    },
    m_pActivityValuesList: { _class: "CActivityValueList", m_activities: [] },
    m_previewModels: preview ? [preview] : [],
    m_boneMergeModels: [],
    m_cameraSettings: { m_flFov: 60, m_sLockBoneName: "", m_bLockCamera: false, m_bViewModelCamera: false },
  };
  return `${HEADER}\n${kv3(graph)}\n`;
}
