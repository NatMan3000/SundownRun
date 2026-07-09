import * as THREE from 'three'

// ============================================================
//  POOLED BILLBOARD PUFFS - tyre smoke and dust
// ------------------------------------------------------------
//  One InstancedBufferGeometry, one draw call, a fixed pool. A
//  puff is never allocated and never garbage collected: emitting
//  overwrites the oldest slot in a ring, and a dead puff is simply
//  a puff with scale 0.
//
//  Billboarding happens in the VERTEX shader off the modelView
//  matrix, so the CPU never touches a quaternion or a matrix -
//  the per-frame cost is writing four small typed arrays.
//
//  The quads are world-space (the mesh sits at the origin and is
//  never culled), which is what lets a puff stay behind on the
//  road while the car drives away from it.
// ============================================================

const vertexShader = /* glsl */ `
attribute vec3 aOffset;
attribute float aScale;
attribute float aAlpha;
attribute float aRot;

varying vec2 vUv;
varying float vAlpha;
varying float vSeed;

void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vSeed = aRot;

  vec4 mv = modelViewMatrix * vec4( aOffset, 1.0 );
  float c = cos( aRot );
  float s = sin( aRot );
  vec2 p = vec2( position.x * c - position.y * s, position.x * s + position.y * c );
  mv.xy += p * aScale;

  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;

varying vec2 vUv;
varying float vAlpha;
varying float vSeed;

void main() {
  vec2 p = vUv - 0.5;

  // Break the circle. A perfectly round puff is a bubble; a lumpy one is smoke.
  float ang = atan( p.y, p.x );
  float wobble = 0.86 + 0.14 * sin( ang * 3.0 + vSeed * 6.3 );
  float d = length( p ) * 2.0 / wobble;
  if ( d > 1.0 ) discard;

  // Very soft. These stack dozens deep behind a sliding tyre, so any hard
  // edge instantly turns the plume into a painted stripe on the road.
  float a = pow( 1.0 - d, 2.1 );

  // Undo the per-puff spin so the light direction is the SAME on every puff.
  // Rotating the blob but not its shading is what makes a plume look lit by
  // one sun rather than by a disco ball.
  float c = cos( vSeed );
  float s = sin( vSeed );
  vec2 q = vec2( p.x * c - p.y * s, p.x * s + p.y * c );
  float lit = 0.5 + 0.5 * ( q.x * 1.5 - q.y * 0.7 );
  vec3 col = mix( uShade, uLit, clamp( lit, 0.0, 1.0 ) );

  float alpha = a * vAlpha;
  if ( alpha < 0.003 ) discard;
  gl_FragColor = vec4( col, alpha );
  #include <colorspace_fragment>
}
`

export interface PuffOptions {
  count: number
  /** Colour of the side facing the sun, and of the side facing away. */
  lit: string
  shade: string
  /** Metres/second of upward drift, and how fast horizontal motion bleeds off. */
  rise: number
  drag: number
  renderOrder: number
}

/** Deterministic noise - the demo lap must record the same frames every run. */
let _seed = 0x9e3779b9
function rand(): number {
  _seed = (_seed * 1664525 + 1013904223) >>> 0
  return _seed / 4294967296
}

export class Puffs {
  readonly mesh: THREE.Mesh

  private readonly n: number
  private readonly rise: number
  private readonly drag: number

  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array //   seconds remaining
  private readonly ttl: Float32Array //    seconds total
  private readonly r0: Float32Array //     radius at birth
  private readonly r1: Float32Array //     radius at death
  private readonly peak: Float32Array //   peak alpha
  private readonly spin: Float32Array

  private readonly aOffset: THREE.InstancedBufferAttribute
  private readonly aScale: THREE.InstancedBufferAttribute
  private readonly aAlpha: THREE.InstancedBufferAttribute
  private readonly aRot: THREE.InstancedBufferAttribute

  // direct views on the attribute storage - no per-frame property lookups
  private readonly offsetBuf: Float32Array
  private readonly scaleBuf: Float32Array
  private readonly alphaBuf: Float32Array
  private readonly rotBuf: Float32Array

  private cursor = 0

  constructor(opts: PuffOptions) {
    const n = opts.count
    this.n = n
    this.rise = opts.rise
    this.drag = opts.drag

    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.life = new Float32Array(n)
    this.ttl = new Float32Array(n)
    this.r0 = new Float32Array(n)
    this.r1 = new Float32Array(n)
    this.peak = new Float32Array(n)
    this.spin = new Float32Array(n)

    const plane = new THREE.PlaneGeometry(1, 1)
    const geom = new THREE.InstancedBufferGeometry()
    geom.index = plane.index
    geom.setAttribute('position', plane.attributes.position)
    geom.setAttribute('uv', plane.attributes.uv)
    geom.instanceCount = n

    this.offsetBuf = new Float32Array(n * 3)
    this.scaleBuf = new Float32Array(n)
    this.alphaBuf = new Float32Array(n)
    this.rotBuf = new Float32Array(n)

    this.aOffset = new THREE.InstancedBufferAttribute(this.offsetBuf, 3)
    this.aScale = new THREE.InstancedBufferAttribute(this.scaleBuf, 1)
    this.aAlpha = new THREE.InstancedBufferAttribute(this.alphaBuf, 1)
    this.aRot = new THREE.InstancedBufferAttribute(this.rotBuf, 1)
    for (const a of [this.aOffset, this.aScale, this.aAlpha, this.aRot]) {
      a.setUsage(THREE.DynamicDrawUsage)
    }
    geom.setAttribute('aOffset', this.aOffset)
    geom.setAttribute('aScale', this.aScale)
    geom.setAttribute('aAlpha', this.aAlpha)
    geom.setAttribute('aRot', this.aRot)
    // world-space quads: never let the frustum test see the origin-bound bounds
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uLit: { value: new THREE.Color(opts.lit) },
        uShade: { value: new THREE.Color(opts.shade) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: false,
    })

    this.mesh = new THREE.Mesh(geom, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = opts.renderOrder
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
  }

  /** Overwrites the oldest slot. Never allocates. */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r0: number,
    r1: number,
    ttl: number,
    peak: number
  ): void {
    const i = this.cursor
    this.cursor = (i + 1) % this.n

    const j = i * 3
    this.pos[j] = x
    this.pos[j + 1] = y
    this.pos[j + 2] = z
    // Generous jitter. Without it every puff follows the same parabola and the
    // trail reads as a painted stripe rather than a billow.
    this.vel[j] = vx + (rand() - 0.5) * 1.9
    this.vel[j + 1] = vy + rand() * 0.75
    this.vel[j + 2] = vz + (rand() - 0.5) * 1.9
    this.life[i] = ttl
    this.ttl[i] = ttl
    this.r0[i] = r0
    this.r1[i] = r1
    this.peak[i] = peak
    this.spin[i] = rand() * Math.PI * 2
  }

  update(dt: number): void {
    const decay = Math.exp(-this.drag * dt)

    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.scaleBuf[i] = 0
        this.alphaBuf[i] = 0
        continue
      }

      this.life[i] -= dt
      const j = i * 3
      this.vel[j] *= decay
      this.vel[j + 1] = this.vel[j + 1] * decay + this.rise * dt
      this.vel[j + 2] *= decay
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt

      // age 0 at birth -> 1 at death
      const age = 1 - Math.max(0, this.life[i]) / this.ttl[i]
      // grow fast, then ease out. Smoke does not expand linearly.
      const grow = Math.sqrt(age)
      const fadeIn = Math.min(1, age * 12)
      const fadeOut = Math.pow(1 - age, 1.7)

      this.offsetBuf[j] = this.pos[j]
      this.offsetBuf[j + 1] = this.pos[j + 1]
      this.offsetBuf[j + 2] = this.pos[j + 2]
      this.scaleBuf[i] = this.r0[i] + (this.r1[i] - this.r0[i]) * grow
      this.alphaBuf[i] = this.peak[i] * fadeIn * fadeOut
      this.rotBuf[i] = this.spin[i] + age * 0.7
    }

    this.aOffset.needsUpdate = true
    this.aScale.needsUpdate = true
    this.aAlpha.needsUpdate = true
    this.aRot.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
