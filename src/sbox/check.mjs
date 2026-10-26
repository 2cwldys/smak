// A port held to its original in s&box's own editor: the compiled model read back there and played, frame by frame,
// and each bone's place set beside where GoldSrc's animation puts it.
//
//   probeCode(vmdl, samples)                       the C# that reads a compiled model and poses it (run_csharp)
//   expectedOf(src, port, { groups, samples })     what the original says: its bones' names, animations' lengths,
//                                                  parts, skins, attachments, hit boxes, and its poses
//   compareSbox(expected, read, { tolerance })     -> { passed, faults, said, worst }
//   physicsProbeCode(vmdl, poses), comparePhysics(expected, read)   its physics read back, and tried
//   checkSboxPort(file, { project, name, folder, kind, collision, surfaceprop, mass, sbox, perSequence, shot })
//                                                  -> the whole check, in the editor
//
// WHAT IS HELD. The compiled model must have every bone of the port, under its parent; every animation, of its
// length ((frames - 1) / fps); every bodypart with its choices; a material group a skin (none when one); every
// attachment and hit box. Then each animation is played at its first frame and its middle one (more with
// perSequence), stopped there, and every bone's place in the model's space read: it must be where GoldSrc's frame
// puts it (mdl.poseAt), within `tolerance` units. A model turned, a bone misnamed (its channel then moves nothing),
// a bone dropped, a walk whose travel was not taken out all show as bones off their place.
//
// THE EDITOR. The check runs in the project's editor (editor.mjs: the one open, else one opened and closed
// after). Its probe object is made in the scene being edited and removed before the check ends; the scene is not
// saved. Its picture (`shot`) is the editor's camera on the model posed in its first animation.
import { readStudio, sequenceFilesOf } from "../studio-file.mjs";
import { sequenceGroups, poseAt, sequences as sequencesOf, readSequence } from "../mdl.mjs";
import { portToSbox } from "./port.mjs";
import { sourceName } from "../source/port.mjs";
import { editorFor, runCsharp, sboxCall, projectFolder } from "./editor.mjs";
import { compileVmdl, findSbox } from "./compile.mjs";
import { restOf, insideLimits, jointStretch, quaternionOfTurn } from "./physics.mjs";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** How far a bone may be from GoldSrc's place, in units: s&box compresses its animations (Half-Life's barney,
 * houndeye, scientist and hgrunt, 918 poses: 0.025 at most). */
export const POSE_TOLERANCE = 0.1;
/** And how much farther, per unit of the bone's chain (its links to the root, end to end, in the pose): a rotation
 * compressed turns a long chain's end by more (all 210 of Half-Life's models: tentacle2's, nihilanth's, the osprey's
 * and the loader's ends of chain up to 0.19 off). 0.0005 is a turn of 0.03 degrees; a model turned by one degree
 * is 35 times that. */
export const REACH_TOLERANCE = 0.0005;
/** The probe object's name in the scene, and where it stands: away from anything of the person's. */
const PROBE = "smak_sbox_check";
const PROBE_AT = [0, 0, -10000];

const csString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The C# that reads the compiled model at `vmdl` and poses it at each of `samples` ([{ sequence, time }]). It
 * returns { error } or { bones, sequences, parts, groups, attachments, hitboxes, poses }; the probe object is left
 * posed at the first sample for a picture, and removed by removeProbeCode.
 */
export function probeCode(vmdl, samples) {
  const list = samples.map((s) => `(${csString(s.sequence)}, ${Number(s.time).toFixed(6)}f)`).join(", ");
  return `
var model = Model.Load( ${csString(vmdl)} );
if ( model is null || model.IsError ) return new { error = "the model did not load: " + ${csString(vmdl)} };
var scene = Editor.SceneEditorSession.Active?.Scene ?? Game.ActiveScene;
foreach ( var old in scene.GetAllObjects( true ).Where( g => g.Name == ${csString(PROBE)} ).ToList() ) old.Destroy();
var r3 = ( Vector3 v ) => new[] { MathF.Round( v.x, 4 ), MathF.Round( v.y, 4 ), MathF.Round( v.z, 4 ) };
var bones = Enumerable.Range( 0, model.BoneCount ).Select( i => new object[] { model.GetBoneName( i ), model.GetBoneParent( i ) } ).ToArray();
var sequences = Enumerable.Range( 0, model.AnimationCount ).Select( i => model.GetAnimationName( i ) ).ToArray();
var parts = model.Parts.All.Select( p => new object[] { p.Name, p.Choices.Select( c => c.Name ).ToArray() } ).ToArray();
var groups = Enumerable.Range( 0, model.MaterialGroupCount ).Select( i => model.GetMaterialGroupName( i ) ).ToArray();
var attachments = Enumerable.Range( 0, model.AttachmentCount ).Select( i => model.GetAttachmentName( i ) ).ToArray();
var hitboxes = ( model.HitboxSet?.All ?? new HitboxSet.Box[0] ).Select( h => new object[] { h.Name, h.Bone?.Name, string.Join( ",", h.Tags?.TryGetAll() ?? new string[0] ) } ).ToArray();
var go = scene.CreateObject();
go.Name = ${csString(PROBE)};
go.WorldPosition = new Vector3( ${PROBE_AT.join(", ")} );
var r = go.Components.Create<SkinnedModelRenderer>();
r.Model = model;
r.UseAnimGraph = false;
r.PlayAnimationsInEditorScene = true;
var poses = new System.Collections.Generic.List<object>();
var durations = new System.Collections.Generic.Dictionary<string, float>();
var samples = new (string, float)[] { ${list} };
foreach ( var (name, time) in samples.Reverse() )
{
	r.Sequence.Name = name;
	r.Sequence.PlaybackRate = 0;
	// a looping renderer wraps an animation's very end to its start: not looping, it holds its last frame
	r.Sequence.Looping = false;
	var t = time;
	r.Sequence.Time = t;
	await Task.Delay( 40 );
	r.Sequence.Time = t;
	await Task.Delay( 40 );
	durations[name] = r.Sequence.Duration;
	var world = r.GetBoneTransforms( true );
	poses.Insert( 0, new { sequence = name, time, at = r.Sequence.Time, bones = world.Select( t => r3( t.Position - go.WorldPosition ) ).ToArray() } );
}
return new { bones, sequences, durations, parts, groups, attachments, hitboxes, poses };
`;
}

/** How far a ragdoll's pieces may move when held at rest with their collisions on, in units: none push another. */
export const REST_HOLD = 0.1;
/** How far a piece may move when the ragdoll is held in a pose inside its joints' limits (collisions off), in
 * units: s&box's joints swing in a cone, Source's turn about three axes, so a pose near a limit settles a little
 * (barney's, 0.4 at most). */
export const POSE_HOLD = 1;
/** How far inside every joint's limits a pose must be to be held, in degrees. */
export const LIMIT_MARGIN = 5;
/** How far a pose may move a joint's bone off the piece above and be held, in units (jointStretch). */
export const STRETCH_MOST = 0.5;
/** How far a hull's box may be from the port's, each way, in units (the compiler simplifies a hull). */
export const HULL_TOLERANCE = 0.5;
/**
 * Dropped: s&box's gravity (a scene's, 850 units a second each second), from this high above a floor, until it is
 * still (no piece has moved `still` units in the last second) or `most` seconds have gone: barney is still in 2,
 * osprey (1169 units long) in 8.
 */
const DROP = { gravity: 850, above: 20, still: 1, most: 15 };
/** How far a dropped model may sink into the floor, or its joints come apart, in units: 1, or a hundredth of its
 * size when that is more (loader's, 661 units, 3 apart under its own weight). */
export const DROP_TOLERANCE = { units: 1, share: 0.01 };

const csTransform = ([x, y, z, qx, qy, qz, qw]) =>
  `new Transform( new Vector3( ${[x, y, z].map((v) => `${v.toFixed(4)}f`).join(", ")} ), new Rotation( ${[qx, qy, qz, qw].map((v) => `${v.toFixed(6)}f`).join(", ")} ) )`; // prettier-ignore

/**
 * The C# that reads a compiled model's physics and tries it in worlds of its own (PhysicsWorld, made and deleted
 * here; the scene is not touched): held at rest with its collisions on, held in each of `poses` ([{ name, bodies:
 * { bone: [x, y, z, qx, qy, qz, qw] } }]) with them off, and dropped onto a floor. Returns { bodies, joints,
 * restMoved, held, dropped } ({ bodies: [] } when it has none).
 */
export function physicsProbeCode(vmdl, poses) {
  const list = poses
    .map(
      (p) =>
        `( ${csString(p.name)}, new System.Collections.Generic.Dictionary<string, Transform> { ${Object.entries(
          p.bodies,
        )
          .map(([bone, t]) => `[${csString(bone)}] = ${csTransform(t)}`)
          .join(", ")} } )`,
    ) // prettier-ignore
    .join(",\n");
  return `
var model = Model.Load( ${csString(vmdl)} );
var phys = model?.Physics;
if ( phys is null || phys.Parts.Count == 0 ) return new { bodies = new object[0] };
var r3 = ( Vector3 v ) => new[] { MathF.Round( v.x, 4 ), MathF.Round( v.y, 4 ), MathF.Round( v.z, 4 ) };
var parts = phys.Parts.ToList();
var bodies = parts.Select( b => new { bone = b.BoneName, mass = b.Mass, surface = b.Hulls.FirstOrDefault()?.Surface?.ResourceName, points = b.Hulls.SelectMany( h => h.GetPoints().Select( p => r3( b.Transform.PointToWorld( p ) ) ) ).ToArray() } ).ToArray();
var joints = phys.Joints.Select( j => {
	var a = parts[j.Body1]; var b = parts[j.Body2];
	var f1 = a.Transform.ToWorld( j.Frame1 ); var f2 = b.Transform.ToWorld( j.Frame2 );
	return new { type = j.Type.ToString(), parent = a.BoneName, child = b.BoneName, at1 = r3( f1.Position ), at2 = r3( f2.Position ), z1 = r3( f1.Rotation.Up ), swing = j.SwingMax, twist = new[] { j.TwistMin, j.TwistMax } };
} ).ToArray();
var rest = parts.Select( b => b.Transform ).ToArray();
var hullPoints = parts.Select( b => b.Hulls.SelectMany( h => h.GetPoints() ).ToArray() ).ToArray();
(PhysicsWorld, System.Collections.Generic.List<PhysicsBody>) Make( Transform[] start, bool collide, Vector3 gravity )
{
	var world = new PhysicsWorld();
	world.Gravity = gravity;
	var made = world.SetupPhysicsFromModel( model, Transform.Zero, PhysicsMotionType.Dynamic ).Bodies.ToList();
	for ( int k = 0; k < made.Count; k++ )
	{
		made[k].Transform = start[k]; made[k].Velocity = 0; made[k].AngularVelocity = 0;
		if ( !collide ) foreach ( var shape in made[k].Shapes ) shape.EnableSolidCollisions = false;
	}
	return (world, made);
}
float Moved( System.Collections.Generic.List<PhysicsBody> made, Transform[] start ) => made.Select( ( b, k ) => b.Transform.Position.Distance( start[k].Position ) ).Max();
void Run( PhysicsWorld world, float seconds ) { for ( int s = 0; s < (int)( seconds * 60 ); s++ ) world.Step( 1f / 60f ); }
// held at rest, colliding with each other
var (atRest, restBodies) = Make( rest, true, Vector3.Zero );
Run( atRest, 1 );
var restMoved = Moved( restBodies, rest );
// what each body weighs to the physics (the description's mass is 0 when s&box works it out from its surface)
var weighs = restBodies.Select( b => b.Mass ).ToArray();
atRest.Delete();
// held in poses inside their joints' limits, not colliding
var poses = new (string, System.Collections.Generic.Dictionary<string, Transform>)[] { ${list} };
var held = new System.Collections.Generic.List<object>();
foreach ( var (name, pose) in poses )
{
	var start = parts.Select( ( b, k ) => pose.TryGetValue( b.BoneName, out var t ) ? t : rest[k] ).ToArray();
	var (posed, posedBodies) = Make( start, false, Vector3.Zero );
	Run( posed, 1 );
	var moved = posedBodies.Select( ( b, k ) => (b.Transform.Position.Distance( start[k].Position ), parts[k].BoneName) ).MaxBy( x => x.Item1 );
	held.Add( new { name, moved = moved.Item1, bone = moved.Item2 } );
	posed.Delete();
}
// dropped onto a floor at 0
var lift = ${DROP.above}f - parts.Select( ( b, k ) => hullPoints[k].Length == 0 ? b.Transform.Position.z : hullPoints[k].Min( p => b.Transform.PointToWorld( p ).z ) ).Min();
var (drop, dropBodies) = Make( rest.Select( t => t.WithPosition( t.Position + Vector3.Up * lift ) ).ToArray(), true, Vector3.Down * ${DROP.gravity}f );
drop.Body.AddBoxShape( new BBox( new Vector3( -100000, -100000, -100 ), new Vector3( 100000, 100000, 0 ) ), Rotation.Identity, false );
// still: no piece moved ${DROP.still} unit in the last second (a piece lying on the floor trembles, and goes nowhere)
float settled = -1;
var second = new System.Collections.Generic.Queue<Vector3[]>();
for ( int s = 0; s < ${DROP.most} * 60 && settled < 0; s++ )
{
	drop.Step( 1f / 60f );
	second.Enqueue( dropBodies.Select( b => b.Position ).ToArray() );
	if ( second.Count > 60 ) second.Dequeue();
	if ( second.Count == 60 )
	{
		var then = second.Peek();
		if ( dropBodies.Select( ( b, k ) => b.Position.Distance( then[k] ) ).Max() < ${DROP.still}f ) settled = ( s + 1 ) / 60f;
	}
}
var gaps = phys.Joints.Select( j => (dropBodies[j.Body1].Transform.ToWorld( j.Frame1 ).Position.Distance( dropBodies[j.Body2].Transform.ToWorld( j.Frame2 ).Position ), parts[j.Body2].BoneName) ).ToList();
var widest = gaps.Count > 0 ? gaps.MaxBy( g => g.Item1 ) : (0f, "");
var lows = dropBodies.Select( ( b, k ) => (hullPoints[k].Length == 0 ? b.Transform.Position.z : hullPoints[k].Min( p => b.Transform.PointToWorld( p ).z ), parts[k].BoneName) ).MinBy( x => x.Item1 );
var dropped = new { settled, speed = dropBodies.Max( b => b.Velocity.Length ), lowest = lows.Item1, lowestPiece = lows.Item2, gap = widest.Item1, gapAt = widest.Item2 };
drop.Delete();
return new { bodies, joints, restMoved, held, dropped, weighs };
`;
}

/** The C# that removes the probe object. */
export const removeProbeCode = () =>
  `var scene = Editor.SceneEditorSession.Active?.Scene ?? Game.ActiveScene;
foreach ( var old in scene.GetAllObjects( true ).Where( g => g.Name == ${csString(PROBE)} ).ToList() ) old.Destroy();
return "removed";`;

/**
 * What the original says the compiled model must hold, from its bytes (`src`) and its port (portToSbox's). The
 * samples: each animation at its first frame and its middle one, `perSequence` frames in all (1 to its length).
 */
export function expectedOf(src, port, { groups, perSequence = 2 } = {}) {
  const list = sequencesOf(src);
  const samples = [];
  const poses = [];
  const physics = physicsExpected(port);
  const names = port.facts.bones;
  for (const s of port.parts.sequences) {
    const index = s.index;
    if (index === undefined) continue;
    const frames = readSequence(src, index, 0, groups).frames.length;
    const picks = [...new Set(Array.from({ length: Math.min(perSequence, frames) }, (_, k) => Math.round((k * (frames - 1)) / Math.max(1, perSequence - 1))))]; // prettier-ignore
    for (const frame of picks) {
      const time = frame / s.fps;
      const matrices = poseAt(src, index, frame, 0, groups);
      const pose = matrices.map((m) => [m[0][3], m[1][3], m[2][3]]);
      samples.push({ sequence: port.facts.sequences[port.parts.sequences.indexOf(s)], time });
      poses.push({ name: list[index].name, frame, bones: pose });
      // a ragdoll held in the pose, when every joint is well inside its limits there and holds its bone where the
      // pose has it
      if (physics?.limits.length) {
        const turns = matrices.map((m) => m.map((row) => row.slice(0, 3)));
        const placed = turns.map((turn, i) => ({ turn, at: pose[i] }));
        const inside = Math.min(...physics.limits.map((j) => insideLimits(j.limits, physics.rest.map((p) => p.turn), turns, j.above, j.bone))); // prettier-ignore
        const stretch = Math.max(
          ...physics.limits.map((j) => jointStretch(physics.rest, placed, j.above, j.bone)),
        );
        if (inside >= LIMIT_MARGIN && stretch <= STRETCH_MOST)
          physics.poses.push({
            name: `${list[index].name} frame ${frame}`,
            bodies: Object.fromEntries(physics.shapes.map((shape) => {
              const i = names.indexOf(shape.bone);
              return [shape.bone, [...pose[i], ...quaternionOfTurn(turns[i])]];
            })),
          }); // prettier-ignore
      }
    }
  }
  return {
    bones: port.facts.bones.map((name, i) => [name, port.parts.bones[i].parent]),
    sequences: port.facts.sequences.map((name, i) => ({ name, duration: (readSequence(src, port.parts.sequences[i].index, 0, groups).frames.length - 1) / port.parts.sequences[i].fps })), // prettier-ignore
    parts: port.facts.bodygroups,
    skins: port.facts.skins,
    attachments: port.facts.attachments,
    hitboxes: port.facts.hitboxes,
    samples,
    poses,
    physics,
  };
}

/**
 * What the port's physics must be, from what it wrote (port.physics): its pieces' hulls on their bones, masses,
 * surfaces, and its joints with their anchors at the child bone's place at rest and their axes on its axis. The
 * poses to hold it in are added by expectedOf. Null when it collides as nothing.
 */
function physicsExpected(port) {
  const { physics } = port;
  if (!physics) return null;
  const collision = port.parts.collision;
  const names = port.facts.bones;
  const placed = restOf(port.parts.bones, port.parts.smd.get(collision.file).frames[0]);
  const original = new Map(collision.pieces.map((piece, k) => [piece.bone, physics.shapes[k].bone]));
  return {
    shapes: physics.shapes.map((s) => ({ bone: s.bone, surface: s.surface, points: s.points })),
    masses: physics.bodies,
    joints: physics.joints.map((j) => {
      const child = placed[names.indexOf(j.child)];
      return { ...j, at: child.at, along: child.turn.map((row) => row[j.axis]) };
    }),
    // each joint's limits as Source's port measured them, against the piece above, for the poses
    limits: collision.joints.map((j) => ({
      limits: j.limits,
      above: names.indexOf(original.get(j.above)),
      bone: names.indexOf(original.get(j.bone)),
    })),
    rest: placed,
    poses: [],
  };
}

const far3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const boxOf = (points) =>
  [0, 1, 2].map((a) => [Math.min(...points.map((p) => p[a])), Math.max(...points.map((p) => p[a]))]);

/** The compiled model's physics (physicsProbeCode's answer) held to what the port wrote. -> { faults, said } */
export function comparePhysics(expected, read) {
  const faults = [];
  const bodies = new Map(read.bodies.map((b) => [b.bone, b]));
  const missing = expected.shapes.filter((s) => !bodies.has(s.bone)).map((s) => s.bone);
  if (missing.length) faults.push(`no physics body on ${missing.join(", ")}`);
  if (read.bodies.length !== expected.shapes.length)
    faults.push(`${read.bodies.length} physics bodies, not ${expected.shapes.length}`);
  // each hull's box against the port's, each way
  let hullOff = { off: 0 };
  for (const shape of expected.shapes) {
    const body = bodies.get(shape.bone);
    if (!body) continue;
    if (body.surface !== shape.surface)
      faults.push(`${shape.bone} collides as ${body.surface}, not ${shape.surface}`);
    if (!body.points.length) {
      faults.push(`${shape.bone} has no hull`);
      continue;
    }
    const want = boxOf(shape.points);
    const got = boxOf(body.points);
    const off = Math.max(
      ...[0, 1, 2].flatMap((a) => [Math.abs(got[a][0] - want[a][0]), Math.abs(got[a][1] - want[a][1])]),
    );
    if (off > hullOff.off) hullOff = { off, bone: shape.bone };
  }
  if (hullOff.off > HULL_TOLERANCE)
    faults.push(`${hullOff.bone}'s hull ${hullOff.off.toFixed(2)} units off the port's`);
  for (const { bone, mass } of expected.masses) {
    const body = bodies.get(bone);
    const weighs = read.weighs?.[read.bodies.indexOf(body)];
    if (body && !(Math.abs(weighs - mass) <= 0.01 * mass + 0.01))
      faults.push(`${bone} weighs ${weighs?.toFixed(2)} kg, not ${mass.toFixed(2)}`);
  }
  // each joint between its pieces, of its kind and limits, at the child's place at rest, about its axis
  for (const j of expected.joints) {
    const got = read.joints.find((r) => r.parent === j.parent && r.child === j.child);
    if (!got) {
      faults.push(`no joint from ${j.parent} to ${j.child}`);
      continue;
    }
    const kind = j.kind === "hinge" ? "Hinge" : "Ball";
    if (got.type !== kind) faults.push(`${j.child}'s joint a ${got.type}, not a ${kind}`);
    const limitsOff =
      j.kind === "hinge"
        ? Math.abs(got.twist[1] - got.twist[0] - (j.max - j.min))
        : Math.max(Math.abs(got.swing - j.swing), Math.abs(got.twist[0] - j.twist[0]), Math.abs(got.twist[1] - j.twist[1])); // prettier-ignore
    if (limitsOff > 0.05) faults.push(`${j.child}'s joint's limits ${limitsOff.toFixed(2)} degrees off`);
    const anchorOff = Math.max(far3(got.at1, j.at), far3(got.at2, j.at));
    if (anchorOff > 0.05) faults.push(`${j.child}'s joint ${anchorOff.toFixed(2)} units off the bone`);
    if (got.z1[0] * j.along[0] + got.z1[1] * j.along[1] + got.z1[2] * j.along[2] < 0.999)
      faults.push(`${j.child}'s joint turns about another axis than its bone's ${"xyz"[j.axis]}`);
  }
  if (read.joints.length !== expected.joints.length)
    faults.push(`${read.joints.length} joints, not ${expected.joints.length}`);
  // tried: at rest, in poses, dropped
  if (read.restMoved > REST_HOLD)
    faults.push(`held at rest, its pieces pushed each other ${read.restMoved.toFixed(2)} units`);
  const slipped = (read.held ?? []).filter((h) => h.moved > POSE_HOLD);
  if (slipped.length) faults.push(`${slipped.length} of ${read.held.length} poses inside its joints' limits not held: ${slipped.slice(0, 4).map((h) => `${h.name} (${h.bone} ${h.moved.toFixed(1)} units)`).join("; ")}`); // prettier-ignore
  const dropped = read.dropped;
  if (dropped) {
    // what a model of its size may sink or stretch
    const points = expected.shapes.flatMap((s) => s.points);
    const size = points.length ? Math.max(...[0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])) - Math.min(...points.map((p) => p[a])))) : 0; // prettier-ignore
    const allowed = Math.max(DROP_TOLERANCE.units, DROP_TOLERANCE.share * size);
    if (dropped.settled < 0)
      faults.push(`dropped, still moving after ${DROP.most} s (${dropped.speed.toFixed(0)} units a second)`);
    if (dropped.lowest < -allowed) faults.push(`dropped, ${dropped.lowestPiece} went ${(-dropped.lowest).toFixed(1)} units through the floor`); // prettier-ignore
    if (dropped.gap > allowed)
      faults.push(`dropped, ${dropped.gapAt}'s joint came ${dropped.gap.toFixed(1)} units apart`);
  }
  const heldMost = Math.max(0, ...(read.held ?? []).map((h) => h.moved));
  const weight = (read.weighs ?? []).reduce((sum, m) => sum + m, 0);
  const said = [
    `physics: ${read.bodies.length} bodies (${weight.toFixed(1)} kg), ${read.joints.length} joints; hulls within ${hullOff.off.toFixed(2)} units of the port's`,
    `at rest its pieces moved ${(read.restMoved ?? 0).toFixed(2)} units; ${(read.held ?? []).length} poses held within ${heldMost.toFixed(2)}; dropped, ${dropped?.settled >= 0 ? `it was still in ${dropped.settled.toFixed(1)} s` : "it did not come to rest"}, its lowest point at ${dropped ? dropped.lowest.toFixed(1) : "?"} (the floor at 0), its joints within ${dropped ? dropped.gap.toFixed(2) : "?"}`, // prettier-ignore
  ];
  return { faults, said };
}

/** The compiled model read back (`read`, probeCode's answer) held to `expected`. */
export function compareSbox(expected, read, { tolerance = POSE_TOLERANCE } = {}) {
  const faults = [];
  if (read.error) return { passed: false, faults: [read.error], said: [], worst: null };
  const names = read.bones.map(([name]) => name);
  const missing = expected.bones.filter(([name]) => !names.includes(name)).map(([name]) => name);
  if (missing.length)
    faults.push(
      `${missing.length} bones of the port not in the compiled model: ${missing.slice(0, 6).join(", ")}`,
    );
  const reparented = expected.bones.filter(([name, parent]) => {
    const at = names.indexOf(name);
    if (at < 0) return false;
    const want = parent < 0 ? null : expected.bones[parent][0];
    const has = read.bones[at][1] < 0 ? null : names[read.bones[at][1]];
    return want !== has;
  });
  if (reparented.length)
    faults.push(
      `bones under another parent than the port's: ${reparented
        .map(([n]) => n)
        .slice(0, 6)
        .join(", ")}`,
    );
  const lost = expected.sequences.filter((s) => !read.sequences.includes(s.name)).map((s) => s.name);
  if (lost.length)
    faults.push(`${lost.length} animations not in the compiled model: ${lost.slice(0, 6).join(", ")}`);
  const longer = expected.sequences.filter((s) => read.durations[s.name] !== undefined && Math.abs(read.durations[s.name] - s.duration) > 0.002); // prettier-ignore
  if (longer.length) faults.push(`animations of another length: ${longer.slice(0, 4).map((s) => `${s.name} ${read.durations[s.name].toFixed(3)} s, not ${s.duration.toFixed(3)}`).join("; ")}`); // prettier-ignore
  const choices = expected.parts.map((g) => {
    const part = read.parts.find(([name]) => name === g.name);
    return part
      ? part[1].length === g.choices
        ? null
        : `${g.name} has ${part[1].length} choices, not ${g.choices}`
      : `bodygroup ${g.name} not there`;
  });
  faults.push(...choices.filter(Boolean));
  const groups = expected.skins > 1 ? expected.skins : read.groups.length <= 1 ? read.groups.length : -1;
  if (read.groups.length !== groups)
    faults.push(`${read.groups.length} material groups, not ${expected.skins} (a skin each)`);
  const attachmentsLost = expected.attachments.filter((a) => !read.attachments.includes(a));
  if (attachmentsLost.length) faults.push(`attachments not there: ${attachmentsLost.join(", ")}`);
  if ((read.hitboxes ?? []).length !== expected.hitboxes)
    faults.push(`${read.hitboxes.length} hit boxes, not ${expected.hitboxes}`);
  // the poses: each bone of the port where GoldSrc's frame puts it, within `tolerance` and REACH_TOLERANCE of its
  // chain's length in that pose
  let worst = { off: 0 };
  const offPoses = [];
  const link = (pose, i) => {
    const parent = expected.bones[i][1];
    return parent < 0 ? 0 : Math.hypot(...[0, 1, 2].map((a) => pose.bones[i][a] - pose.bones[parent][a]));
  };
  expected.samples.forEach((sample, k) => {
    const got = read.poses[k];
    const want = expected.poses[k];
    if (!got) return;
    const chain = [];
    expected.bones.forEach(
      ([, parent], i) => (chain[i] = (parent < 0 ? 0 : (chain[parent] ?? 0)) + link(want, i)),
    );
    let off = 0;
    let over = 0;
    let bone = "";
    let overBone = "";
    expected.bones.forEach(([name], i) => {
      const at = names.indexOf(name);
      if (at < 0 || !got.bones[at]) return;
      const d = Math.hypot(...[0, 1, 2].map((a) => got.bones[at][a] - want.bones[i][a]));
      if (d > off) [off, bone] = [d, name];
      const beyond = d - (tolerance + REACH_TOLERANCE * chain[i]);
      if (beyond > over) [over, overBone] = [beyond, `${name} ${d.toFixed(2)} units off`];
    });
    if (off > worst.off) worst = { off, bone, sequence: sample.sequence, frame: want.frame };
    if (over > 0) offPoses.push(`${sample.sequence} frame ${want.frame}: ${overBone}`);
  });
  if (offPoses.length) faults.push(`${offPoses.length} of ${expected.samples.length} poses with a bone off GoldSrc's place: ${offPoses.slice(0, 5).join("; ")}`); // prettier-ignore
  const physics = expected.physics
    ? comparePhysics(expected.physics, read.physics ?? { bodies: [], joints: [] })
    : null;
  if (physics) faults.push(...physics.faults);
  const said = [
    `${read.bones.length} bones, ${read.sequences.length} animations, ${read.parts.length} bodygroups, ${read.groups.length} material groups, ${read.attachments.length} attachments, ${read.hitboxes.length} hit boxes`, // prettier-ignore
    `${expected.samples.length} poses held to GoldSrc's: the farthest bone ${worst.off.toFixed(3)} units off${worst.bone ? ` (${worst.bone}, ${worst.sequence} frame ${worst.frame})` : ""}`, // prettier-ignore
    ...(physics?.said ?? []),
  ];
  return { passed: !faults.length, faults, said, worst };
}

/**
 * The whole check of a model's port in s&box: the port made again (as sbox-port made it: same name, folder and
 * kind), compiled if its .vmdl_c is not there, read back and posed in the project's editor, and held to the
 * original. `shot`: a file to save the editor's picture of it to. Returns { passed, faults, said, worst, shot }.
 */
export async function checkSboxPort(
  file,
  { project, name, folder, kind, collision, surfaceprop, mass, sbox, perSequence = 2, shot, tolerance } = {},
) {
  const engine = sbox ?? findSbox();
  const root = projectFolder(project);
  const assets = join(root, "Assets");
  const { src } = readStudio(file);
  const groups = sequenceGroups(src).length > 1 ? sequenceFilesOf(file, src) : undefined;
  const own = String(file).replace(/\\/g, "/").split("/").pop();
  const port = portToSbox(src, {
    name: name ?? sourceName(own),
    folder,
    groups,
    kind,
    collision,
    surfaceprop,
    mass,
  });
  if (!existsSync(join(assets, port.vmdl)))
    throw new Error(
      `${port.vmdl} is not in ${assets}: port it there first (smak sbox-port ${own} -o ${assets})`,
    );
  if (!existsSync(join(assets, `${port.vmdl}_c`))) compileVmdl(assets, port.vmdl, { sbox: engine });
  const expected = expectedOf(src, port, { groups, perSequence });
  const editor = await editorFor(root, { sbox: engine });
  try {
    // the editor compiles what changed on disk; asked again, so the check reads this port's compile
    sboxCall(root, "asset_compile", { path: port.vmdl }, { sbox: engine });
    const read = runCsharp(root, probeCode(port.vmdl, expected.samples), { sbox: engine });
    if (expected.physics && !read.error)
      read.physics = runCsharp(root, physicsProbeCode(port.vmdl, expected.physics.poses), { sbox: engine });
    const result = compareSbox(expected, read, { tolerance });
    if (shot && !read.error) {
      const size = Math.max(16, ...expected.poses[0].bones.map((p) => Math.hypot(...p))) * 2.2;
      const at = PROBE_AT;
      const pictured = sboxCall(root, "call_tools", { calls: [
        { name: "set_editor_camera", arguments: { position: `${at[0] + size},${at[1] - size * 0.6},${at[2] + size * 0.45}`, angles: "18,150,0" } },
        { name: "editor_camera_screenshot", arguments: { width: 960, height: 720 } },
      ] }, { sbox: engine }); // prettier-ignore
      const made = String(typeof pictured === "string" ? pictured : JSON.stringify(pictured)).match(
        /[A-Za-z]:\\[^\r\n"]+\.png/,
      );
      if (made) {
        copyFileSync(made[0], shot);
        result.shot = shot;
      }
    }
    runCsharp(root, removeProbeCode(), { sbox: engine });
    return { ...result, opened: editor.opened };
  } finally {
    await editor.close();
  }
}
