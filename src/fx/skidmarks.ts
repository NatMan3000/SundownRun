import * as THREE from 'three'

// ============================================================
//  SKID MARKS - a capped ring buffer of quads
// ------------------------------------------------------------
//  One mesh, one draw call, a fixed number of quad segments.
//  Every buffer is allocated once at construction; laying a mark
//  writes twelve floats into a slice of the position attribute
//  and flags it dirty. Nothing is created, nothing is collected.
//
//  Each segment carries the time it was laid. The vertex shader
//  turns that into an alpha ramp, so a mark fades out on its own
//  well before the ring wraps round and reuses its slot - which
//  is what makes the recycling invisible.
//
//  depthWrite is off and the polygon offset is negative: the mark
//  is 14 mm above the asphalt but must never fight it, and must
//  never write a depth value that a later transparent puff of
//  smoke would then test against.
// ============================================================

const MAX_SEGMENTS = 1400
const LIFETIME = 14 //   seconds before a mark is fully gone
const FADE_START = 10 // seconds before it starts going

const vertexShader = /* glsl */ `
attribute float aBirth;
attribute float aStrength;

uniform float uTime;
uniform float uLife;
uniform float uFadeStart;

varying float vAlpha;

void main() {
  float age = uTime - aBirth;
  vAlpha = aStrength * ( 1.0 - smoothstep( uFadeStart, uLife, age ) );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;

void main() {
  float a = vAlpha * uOpacity;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
  #include <colorspace_fragment>
}
`

export class SkidMarks {
  readonly mesh: THREE.Mesh

  private readonly positions: Float32Array
  private readonly births: Float32Array
  private readonly strengths: Float32Array
  private readonly posAttr: THREE.BufferAttribute
  private readonly birthAttr: THREE.BufferAttribute
  private readonly strengthAttr: THREE.BufferAttribute
  private readonly uTime: { value: number }

  private head = 0
  private time = 0

  constructor(color = '#140F0B', opacity = 0.8) {
    this.positions = new Float32Array(MAX_SEGMENTS * 4 * 3)
    this.births = new Float32Array(MAX_SEGMENTS * 4)
    this.strengths = new Float32Array(MAX_SEGMENTS * 4)

    // Births start far enough in the past that every unused slot is already
    // dead, so an untouched buffer draws nothing rather than a black sheet.
    this.births.fill(-LIFETIME * 2)

    const indices = new Uint16Array(MAX_SEGMENTS * 6)
    for (let s = 0; s < MAX_SEGMENTS; s++) {
      const v = s * 4
      const i = s * 6
      indices[i] = v
      indices[i + 1] = v + 2
      indices[i + 2] = v + 1
      indices[i + 3] = v + 1
      indices[i + 4] = v + 2
      indices[i + 5] = v + 3
    }

    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    this.birthAttr = new THREE.BufferAttribute(this.births, 1).setUsage(THREE.DynamicDrawUsage)
    this.strengthAttr = new THREE.BufferAttribute(this.strengths, 1).setUsage(
      THREE.DynamicDrawUsage
    )

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', this.posAttr)
    geom.setAttribute('aBirth', this.birthAttr)
    geom.setAttribute('aStrength', this.strengthAttr)
    geom.setIndex(new THREE.BufferAttribute(indices, 1))
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.uTime = { value: 0 }
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uTime,
        uLife: { value: LIFETIME },
        uFadeStart: { value: FADE_START },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      fog: false,
    })

    this.mesh = new THREE.Mesh(geom, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
  }

  /**
   * Lay one quad joining the previous cross section (a -> b) to the new one
   * (c -> d). Callers keep the previous pair; this class keeps no per-wheel
   * state, so any number of wheels can share one buffer.
   */
  push(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    strength: number
  ): void {
    const s = this.head
    this.head = (s + 1) % MAX_SEGMENTS

    const p = s * 12
    const pos = this.positions
    pos[p] = ax
    pos[p + 1] = ay
    pos[p + 2] = az
    pos[p + 3] = bx
    pos[p + 4] = by
    pos[p + 5] = bz
    pos[p + 6] = cx
    pos[p + 7] = cy
    pos[p + 8] = cz
    pos[p + 9] = dx
    pos[p + 10] = dy
    pos[p + 11] = dz

    const v = s * 4
    for (let k = 0; k < 4; k++) {
      this.births[v + k] = this.time
      this.strengths[v + k] = strength
    }

    // Only the touched slice goes back to the GPU.
    this.posAttr.addUpdateRange(p, 12)
    this.birthAttr.addUpdateRange(v, 4)
    this.strengthAttr.addUpdateRange(v, 4)
    this.posAttr.needsUpdate = true
    this.birthAttr.needsUpdate = true
    this.strengthAttr.needsUpdate = true
  }

  update(dt: number): void {
    this.time += dt
    this.uTime.value = this.time
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
