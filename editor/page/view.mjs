// The 3D picture: plain WebGL2, no library. The model's corners are moved to their bones in JavaScript (a
// view model is a few thousand of them) and drawn as smak's own renderer draws them, so the two pictures
// agree: the same camera for first person (the eye at the origin looking along +x; 90 degrees across a 4:3
// picture, more across a wider one, as the game does), the same stand-in light, chrome by the normal, index
// 255 of a masked texture as a hole, an additive texture added over the rest.

// The shaders' names: aP, aN, aUV a corner's point, normal and place in its picture; uP the camera's matrix;
// uRight, uUp the camera's own axes (for chrome); uLamp where the light comes from; uSize the picture's size
// in pixels; uChrome, uBright, uMask, uHas 1 or 0 for what the texture is; uTint the colour of a ghost; vL
// how lit a corner is.
const VERTEX_SHADER = `#version 300 es
in vec3 aP; in vec3 aN; in vec2 aUV;
uniform mat4 uP; uniform vec3 uRight, uUp, uLamp; uniform vec2 uSize; uniform float uChrome, uBright;
out vec2 vUV; out float vL;
void main() {
  // a normal stored as nothing (some of the game's own models) stays nothing, as in smak's renderer: half
  // lit, and not black
  float len = length(aN); vec3 n = len > 0.0 ? aN / len : vec3(0.0);
  vL = mix(0.38 + 0.62 * (0.5 + 0.5 * dot(n, uLamp)), 1.0, uBright);
  vUV = mix(aUV, vec2((0.5 + 0.5 * dot(n, uRight)) * uSize.x, (0.5 - 0.5 * dot(n, uUp)) * uSize.y), uChrome) / uSize;
  gl_Position = uP * vec4(aP, 1.0);
}`;
const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 vUV; in float vL; uniform sampler2D uT; uniform float uMask, uHas; uniform vec4 uTint; out vec4 o;
void main() {
  vec4 c = uHas > 0.5 ? texture(uT, vUV) : vec4(0.59, 0.59, 0.59, 1.0);
  if (uMask > 0.5 && c.a < 0.5) discard;
  o = uTint.a > 0.0 ? vec4(uTint.rgb * (0.6 + 0.4 * vL), uTint.a) : vec4(c.rgb * vL, 1.0);
}`;
const UNIFORM_NAMES = [
  "uP",
  "uRight",
  "uUp",
  "uLamp",
  "uSize",
  "uChrome",
  "uBright",
  "uT",
  "uMask",
  "uHas",
  "uTint",
];
const ATTRIBUTE_NAMES = ["aP", "aN", "aUV"];
// a texture's flags, as the model's file has them
const FLAG = { chrome: 2, fullbright: 4, additive: 32, masked: 64 };

// the camera a view begins with: first person; in orbit, from the front and a little above
const FIRST_CAMERA = { mode: "first", yaw: 30, pitch: 15, dist: 60, target: [12, 0, -4] };
// first person, as the game: 90 degrees across a 4:3 screen, and what is drawn from 1 unit to 4096
const GAME_ASPECT = 4 / 3;
const FIRST_NEAR = 1;
const FIRST_FAR = 4096;
// orbit: half the angle from the top of the picture to its bottom, in degrees; the near plane a fiftieth of
// the eye's distance and never under half a unit; the far plane twenty distances and 2000 units on
const ORBIT_HALF_ANGLE = 17.5;
const ORBIT_NEAR_SHARE = 50;
const ORBIT_NEAR_LEAST = 0.5;
const ORBIT_FAR_DISTANCES = 20;
const ORBIT_FAR_MORE = 2000;
// looking this nearly straight up or down, "right" is taken from the yaw alone
const STRAIGHT_UP = 0.999;
// nothing nearer the eye than this share of the near plane is projected or picked
const NEAR_SLACK = 0.5;
// the stand-in light, as smak's renderer has it: from behind the eye, above it and to its left
const LAMP = { back: 0.7, up: 0.6, left: 0.35 };
// the canvas has as many pixels as it is shown at, and no more than twice as many on a dense screen
const MAX_PIXEL_RATIO = 2;
const BACKGROUND = [58, 62, 70];
// a triangle the ray runs along is not hit
const PARALLEL = 1e-12;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const length = Math.hypot(...a) || 1;
  return a.map((v) => v / length);
};

/**
 * A view on a canvas: { cam, meshes, textures, linear (textures smoothed), both (both sides of every triangle
 * are drawn), basis (the camera as last drawn), width, height (the canvas in its own pixels), cssW, cssH (in
 * CSS pixels) } and the functions below.
 */
export function createView(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  const compile = (type, text) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  gl.useProgram(program);
  const uniforms = Object.fromEntries(
    UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, gl.getAttribLocation(program, name)]),
  );
  const view = {
    cam: { ...FIRST_CAMERA, target: [...FIRST_CAMERA.target] },
    meshes: [],
    textures: new Map(),
    linear: true,
    both: false,
    basis: null,
    width: 1,
    height: 1,
  };

  /**
   * The shapes shown: [{ tex: { n, flags, width, height } or null, p, n, uv, bone }], corners in their bones'
   * space. Each is kept with `src`, `srcN` (its points and normals as given), `points`, `normals` (the same
   * moved to their bones at the pose drawn), `ghostPoints`, `ghostNormals` (at a ghost's pose) and what WebGL
   * draws it from.
   */
  view.setMeshes = (list) => {
    for (const mesh of view.meshes) {
      gl.deleteBuffer(mesh.pointBuffer);
      gl.deleteBuffer(mesh.normalBuffer);
      gl.deleteBuffer(mesh.uvBuffer);
      gl.deleteVertexArray(mesh.vao);
    }
    view.meshes = list.map((given) => {
      const count = given.bone.length;
      const mesh = {
        ...given,
        count,
        src: Float32Array.from(given.p),
        srcN: Float32Array.from(given.n),
        points: new Float32Array(count * 3),
        normals: new Float32Array(count * 3),
        ghostPoints: new Float32Array(count * 3),
        ghostNormals: new Float32Array(count * 3),
        vao: gl.createVertexArray(),
        pointBuffer: gl.createBuffer(),
        normalBuffer: gl.createBuffer(),
        uvBuffer: gl.createBuffer(),
      };
      gl.bindVertexArray(mesh.vao);
      // each buffer, the shader's input it feeds, how many numbers a corner, and what it holds to begin with
      for (const [buffer, attribute, size, data] of [
        [mesh.pointBuffer, attributes.aP, 3, mesh.points],
        [mesh.normalBuffer, attributes.aN, 3, mesh.normals],
        [mesh.uvBuffer, attributes.aUV, 2, Float32Array.from(given.uv)],
      ]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 0, 0);
      }
      return mesh;
    });
    gl.bindVertexArray(null);
  };
  /**
   * A texture's picture (an Image that has loaded) for texture number `number`. Masked ones are never
   * smoothed: their holes would fringe.
   */
  view.setTexture = (number, image, flags) => {
    const had = view.textures.get(number);
    if (had) gl.deleteTexture(had.texture);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    view.textures.set(number, { texture, flags });
  };
  /** A mesh's corners moved to their bones at a pose (12 numbers a bone), into `points` and `normals`. */
  const skin = (mesh, pose, points, normals) => {
    const { src, srcN, bone } = mesh;
    for (let i = 0, at = 0; i < mesh.count; i++, at += 3) {
      const m = pose[bone[i]];
      const x = src[at];
      const y = src[at + 1];
      const z = src[at + 2];
      const nx = srcN[at];
      const ny = srcN[at + 1];
      const nz = srcN[at + 2];
      points[at] = m[0] * x + m[1] * y + m[2] * z + m[3];
      points[at + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
      points[at + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
      normals[at] = m[0] * nx + m[1] * ny + m[2] * nz;
      normals[at + 1] = m[4] * nx + m[5] * ny + m[6] * nz;
      normals[at + 2] = m[8] * nx + m[9] * ny + m[10] * nz;
    }
  };
  /**
   * The camera for the canvas as it is now: { right, up, fwd, eye, fx, fy, near, far, hfov }. `fx`, `fy`: how
   * far from the middle of the picture, as a share of its half width and half height, a point one unit to the
   * side and one unit ahead is drawn.
   */
  view.camera = () => {
    const aspect = view.width / view.height;
    const cam = view.cam;
    if (cam.mode === "first") {
      // 90 degrees across a 4:3 picture; a wider one sees more at the sides, a narrower one keeps its 90
      const fy = aspect >= GAME_ASPECT ? GAME_ASPECT : aspect;
      const fx = fy / aspect;
      return {
        right: [0, -1, 0],
        up: [0, 0, 1],
        fwd: [1, 0, 0],
        eye: [0, 0, 0],
        fx,
        fy,
        near: FIRST_NEAR,
        far: FIRST_FAR,
        hfov: (2 * Math.atan(1 / fx) * 180) / Math.PI,
      };
    }
    const radians = Math.PI / 180;
    // from the point looked at towards the eye
    const toEye = [
      Math.cos(cam.pitch * radians) * Math.cos(cam.yaw * radians),
      Math.cos(cam.pitch * radians) * Math.sin(cam.yaw * radians),
      Math.sin(cam.pitch * radians),
    ];
    const fwd = toEye.map((v) => -v);
    const right = unit(
      Math.abs(toEye[2]) > STRAIGHT_UP
        ? [-Math.sin(cam.yaw * radians), Math.cos(cam.yaw * radians), 0]
        : cross(fwd, [0, 0, 1]),
    );
    const up = cross(right, fwd);
    const fy = 1 / Math.tan(ORBIT_HALF_ANGLE * radians);
    return {
      right,
      up,
      fwd,
      eye: cam.target.map((v, k) => v + toEye[k] * cam.dist),
      fx: fy / aspect,
      fy,
      near: Math.max(ORBIT_NEAR_LEAST, cam.dist / ORBIT_NEAR_SHARE),
      far: cam.dist * ORBIT_FAR_DISTANCES + ORBIT_FAR_MORE,
      hfov: (2 * Math.atan(aspect / fy) * 180) / Math.PI,
    };
  };
  /** A point of the model on the canvas, in CSS pixels: [x, y, depth], or null behind the eye. */
  view.project = (point) => {
    const basis = view.basis;
    const fromEye = sub(point, basis.eye);
    const depth = dot(fromEye, basis.fwd);
    if (depth < basis.near * NEAR_SLACK) return null;
    return [
      ((1 + (dot(fromEye, basis.right) * basis.fx) / depth) * view.cssW) / 2,
      ((1 - (dot(fromEye, basis.up) * basis.fy) / depth) * view.cssH) / 2,
      depth,
    ];
  };
  /** How many units of the model a CSS pixel is worth at a point. */
  view.unitsPerPixel = (point) => {
    const basis = view.basis;
    const depth = Math.max(basis.near, dot(sub(point, basis.eye), basis.fwd));
    return (2 * depth) / (basis.fx * view.cssW);
  };
  /** The ray under a point of the canvas (CSS pixels): { from, dir }. */
  view.ray = (x, y) => {
    const basis = view.basis;
    const across = ((2 * x) / view.cssW - 1) / basis.fx;
    const upwards = (1 - (2 * y) / view.cssH) / basis.fy;
    const dir = unit([0, 1, 2].map((k) => basis.fwd[k] + basis.right[k] * across + basis.up[k] * upwards));
    return { from: basis.eye, dir };
  };
  /** The bone of the nearest corner of the triangle under a point of the canvas, or -1. */
  view.pick = (x, y) => view.hit(x, y).bone;
  /**
   * What is under a point of the canvas: { bone (as pick), point (where on the model, or null) }. Either side
   * of a triangle counts.
   */
  view.hit = (x, y) => {
    const { from, dir } = view.ray(x, y);
    let nearest = Infinity;
    let bone = -1;
    for (const mesh of view.meshes)
      for (let i = 0; i < mesh.count; i += 3) {
        // the ray against one triangle (the Moller-Trumbore way): `u`, `v` are where in the triangle it goes
        // through, as shares of its two edges from the first corner, and `along` how far down the ray
        const points = mesh.points;
        const corner = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
        const edge1 = [
          points[i * 3 + 3] - corner[0],
          points[i * 3 + 4] - corner[1],
          points[i * 3 + 5] - corner[2],
        ];
        const edge2 = [
          points[i * 3 + 6] - corner[0],
          points[i * 3 + 7] - corner[1],
          points[i * 3 + 8] - corner[2],
        ];
        const h = cross(dir, edge2);
        const det = dot(edge1, h);
        if (Math.abs(det) < PARALLEL) continue;
        const toRay = sub(from, corner);
        const u = dot(toRay, h) / det;
        if (u < 0 || u > 1) continue;
        const q = cross(toRay, edge1);
        const v = dot(dir, q) / det;
        if (v < 0 || u + v > 1) continue;
        const along = dot(edge2, q) / det;
        if (along < view.basis.near * NEAR_SLACK || along >= nearest) continue;
        nearest = along;
        // the corner the point is nearest to: the first when both shares are small, else the one with the
        // larger
        bone = mesh.bone[i + (u + v < 1 / 3 ? 0 : u > v ? 1 : 2)];
      }
    return { bone, point: bone < 0 ? null : from.map((v, k) => v + dir[k] * nearest) };
  };

  /** The canvas given the pixels of the size it is shown at, and the view told both sizes. */
  const fitCanvas = () => {
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    view.width = width;
    view.height = height;
    view.cssW = canvas.clientWidth || 1;
    view.cssH = canvas.clientHeight || 1;
  };
  /**
   * The camera as the shader wants it: a matrix of four rows that takes a point of the model to the screen.
   */
  const cameraMatrix = (basis) => {
    // the depth written: -1 at the near plane, 1 at the far
    const depthScale = (basis.far + basis.near) / (basis.far - basis.near);
    const depthShift = (-2 * basis.far * basis.near) / (basis.far - basis.near);
    const eye = [dot(basis.eye, basis.right), dot(basis.eye, basis.up), dot(basis.eye, basis.fwd)];
    const rows = [
      [...basis.right.map((v) => v * basis.fx), -eye[0] * basis.fx],
      [...basis.up.map((v) => v * basis.fy), -eye[1] * basis.fy],
      [...basis.fwd.map((v) => v * depthScale), -eye[2] * depthScale + depthShift],
      [...basis.fwd, -eye[2]],
    ];
    // WebGL takes it column by column
    return new Float32Array([0, 1, 2, 3].flatMap((column) => rows.map((row) => row[column])));
  };
  /**
   * One mesh drawn from points and normals already moved to their bones; `tint`: as a ghost of that colour.
   */
  const drawMesh = (mesh, points, normals, tint) => {
    const picture = mesh.tex ? view.textures.get(mesh.tex.n) : null;
    const flags = mesh.tex?.flags ?? 0;
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pointBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, points);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals);
    gl.uniform1f(uniforms.uHas, picture ? 1 : 0);
    gl.uniform1f(uniforms.uMask, flags & FLAG.masked ? 1 : 0);
    gl.uniform1f(uniforms.uChrome, flags & FLAG.chrome && mesh.tex ? 1 : 0);
    gl.uniform1f(uniforms.uBright, flags & (FLAG.fullbright | FLAG.additive) ? 1 : 0);
    gl.uniform2f(uniforms.uSize, mesh.tex?.width ?? 1, mesh.tex?.height ?? 1);
    gl.uniform4fv(uniforms.uTint, tint ?? [0, 0, 0, 0]);
    if (picture) {
      gl.bindTexture(gl.TEXTURE_2D, picture.texture);
      const smooth = view.linear && !(flags & FLAG.masked);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smooth ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, smooth ? gl.LINEAR : gl.NEAREST);
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  };
  /**
   * Draws the model at a pose (12 numbers a bone), and before it, faintly, the `ghosts`: [{ pose, colour: [r,
   * g, b, a] }].
   */
  view.draw = (pose, ghosts = [], background = BACKGROUND) => {
    fitCanvas();
    const basis = (view.basis = view.camera());
    gl.viewport(0, 0, view.width, view.height);
    gl.clearColor(background[0] / 255, background[1] / 255, background[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uP, false, cameraMatrix(basis));
    gl.uniform3fv(uniforms.uRight, basis.right);
    gl.uniform3fv(uniforms.uUp, basis.up);
    const lamp = [0, 1, 2].map(
      (k) => -basis.fwd[k] * LAMP.back + basis.up[k] * LAMP.up - basis.right[k] * LAMP.left,
    );
    gl.uniform3fv(uniforms.uLamp, unit(lamp));
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (view.both) gl.disable(gl.CULL_FACE);
    else gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    gl.cullFace(gl.BACK);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(uniforms.uT, 0);

    const glows = (mesh) => (mesh.tex?.flags ?? 0) & FLAG.additive;
    for (const mesh of view.meshes) skin(mesh, pose, mesh.points, mesh.normals);
    // the solid meshes, then the glowing ones added over them
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const mesh of view.meshes) if (!glows(mesh)) drawMesh(mesh, mesh.points, mesh.normals);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const mesh of view.meshes) if (glows(mesh)) drawMesh(mesh, mesh.points, mesh.normals);
    // the ghosts, see-through: a ghost only where it is not the model itself
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LESS);
    for (const ghost of ghosts)
      for (const mesh of view.meshes)
        if (!glows(mesh)) {
          skin(mesh, ghost.pose, mesh.ghostPoints, mesh.ghostNormals);
          drawMesh(mesh, mesh.ghostPoints, mesh.ghostNormals, ghost.colour);
        }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  };
  return view;
}
