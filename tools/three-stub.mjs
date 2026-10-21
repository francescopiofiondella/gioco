// Stub minimale di three per verificare la logica di gioco in Node (senza GPU).
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setY(y) { this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyQuaternion() { return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
}
export class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(e) { return this.set(e.x, e.y, e.z); } }
export class Quaternion { setFromAxisAngle() { return this; } setFromEuler() { return this; } }
export class Matrix4 { compose() { return this; } }
export class Color { constructor() { this.r = this.g = this.b = 1; } setHex() { return this; } set() { return this; } }
export class Object3D {
  constructor() { this.position = new Vector3(); this.rotation = new Euler(); this.scale = new Vector3(1, 1, 1); this.children = []; this.parent = null; this.userData = {}; this.visible = true; this.matrixWorld = { elements: new Array(16).fill(0) }; }
  add(...o) { for (const c of o) { c.parent = this; this.children.push(c); } return this; }
  remove(...o) { for (const c of o) { this.children = this.children.filter((x) => x !== c); c.parent = null; } return this; }
  removeFromParent() { this.parent?.remove(this); return this; }
  attach(o) { this.add(o); return this; }
  lookAt() {} updateMatrixWorld() {}
  getWorldPosition(v = new Vector3()) { let x = this.position.x, y = this.position.y, z = this.position.z; for (let p = this.parent; p; p = p.parent) { x += p.position.x; y += p.position.y; z += p.position.z; } return v.set(x, y, z); }
  getWorldDirection(v = new Vector3()) { return v.set(0, 0, -1); }
  getWorldQuaternion(q) { return q; }
}
export class Group extends Object3D {}
export class Scene extends Object3D {}
export class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
export class Sprite extends Mesh {}
export class Line extends Mesh {}
export class LineSegments extends Mesh {}
export class InstancedMesh extends Mesh { setMatrixAt() {} setColorAt() {} }
class Light extends Object3D { constructor(c, i = 1, d = 0) { super(); this.color = c; this.intensity = i; this.distance = d; this.shadow = { mapSize: new Vector2(), camera: {}, autoUpdate: true }; this.target = new Object3D(); } }
export class PointLight extends Light {} export class SpotLight extends Light {} export class DirectionalLight extends Light {} export class HemisphereLight extends Light {}
export class PerspectiveCamera extends Object3D { constructor(fov) { super(); this.fov = fov; } updateProjectionMatrix() {} }
class Attr { constructor() { this.arr = new Float32Array(2000); } getX(i) { return this.arr[i * 2]; } getY(i) { return this.arr[i * 2 + 1]; } setXY(i, x, y) { this.arr[i * 2] = x; this.arr[i * 2 + 1] = y; } }
export class BufferGeometry { constructor() { this.attributes = { uv: new Attr(), position: { array: new Float32Array(100), needsUpdate: false } }; } setAttribute(n, a) { this.attributes[n] = a; } setFromPoints() { return this; } rotateX() { return this; } }
class Geo extends BufferGeometry {}
export class BoxGeometry extends Geo {} export class PlaneGeometry extends Geo {} export class CylinderGeometry extends Geo {} export class SphereGeometry extends Geo {}
export class ConeGeometry extends Geo {} export class TorusGeometry extends Geo {} export class RingGeometry extends Geo {}
export class BufferAttribute { constructor(a) { this.array = a; this.needsUpdate = false; } }
class Mat { constructor(o = {}) { Object.assign(this, o); this.color = { set() {} }; } }
export class MeshLambertMaterial extends Mat {} export class MeshBasicMaterial extends Mat {} export class LineBasicMaterial extends Mat {} export class SpriteMaterial extends Mat {}
export class CanvasTexture { constructor() { this.repeat = new Vector2(); } }
export class FogExp2 {} export class Clock { getDelta() { return 0.016; } }
export class Raycaster { set() {} intersectObjects() { return []; } intersectObject() { return []; } }
export class WebGLRenderer {}
export const MathUtils = { degToRad: (d) => d * Math.PI / 180 };
export const ACESFilmicToneMapping = 1, AdditiveBlending = 2, DoubleSide = 2, PCFSoftShadowMap = 2, RepeatWrapping = 1000, SRGBColorSpace = 'srgb';
