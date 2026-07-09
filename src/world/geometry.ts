import * as THREE from 'three'
import { valueNoise2D, hash2D, fbm2D } from '../core/random'
import { getSunDirection } from './sun'

// ============================================================
// Procedural geometry. Everything is flat-shaded and low-poly:
// facets read beautifully at 190 km/h and cost almost nothing.
// ============================================================

const c = new THREE.Color()
function lin(hex: string): [number, number, number] {
  c.set(hex) //  three converts sRGB -> working (linear) space here
  return [c.r, c.g, c.b]
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

interface Part {
  geo: THREE.BufferGeometry // must be non-indexed
  colour: (x: number, y: number, z: number) => [number, number, number]
  weight: (y: number) => number // per-vertex sway/blade factor
}

/** Concatenate non-indexed parts into one buffer with position/normal/color + a float attribute. */
function bake(parts: Part[], weightName: string): THREE.BufferGeometry {
  let total = 0
  for (const p of parts) total += p.geo.attributes.position.count

  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const color = new Float32Array(total * 3)
  const weight = new Float32Array(total)

  let o = 0
  for (const p of parts) {
    const pos = p.geo.attributes.position as THREE.BufferAttribute
    const nor = p.geo.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      position[o * 3] = x
      position[o * 3 + 1] = y
      position[o * 3 + 2] = z
      normal[o * 3] = nor.getX(i)
      normal[o * 3 + 1] = nor.getY(i)
      normal[o * 3 + 2] = nor.getZ(i)
      const col = p.colour(x, y, z)
      color[o * 3] = col[0]
      color[o * 3 + 1] = col[1]
      color[o * 3 + 2] = col[2]
      weight[o] = p.weight(y)
      o++
    }
    p.geo.dispose()
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.setAttribute(weightName, new THREE.BufferAttribute(weight, 1))
  g.computeBoundingSphere()
  return g
}

/** Push every vertex along its own radius by noise - turns a sphere into a canopy blob. */
function roughen(g: THREE.BufferGeometry, amp: number, freq: number, seed: number): void {
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n =
      0.5 * valueNoise2D(x * freq + seed, z * freq + seed * 1.7) +
      0.5 * valueNoise2D(y * freq + seed * 2.3, (x + z) * 0.5 * freq + seed)
    const s = 1 + (n - 0.5) * amp
    p.setXYZ(i, x * s, y * s, z * s)
  }
}

/** Split shared vertices (if any) and recompute flat normals. */
function faceted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  // Polyhedron geometries already arrive non-indexed; calling toNonIndexed on those
  // logs a warning, and the checker reads the console.
  const n = g.index ? g.toNonIndexed() : g
  if (n !== g) g.dispose()
  n.computeVertexNormals()
  return n
}

function blob(
  radius: number,
  scale: [number, number, number],
  offset: [number, number, number],
  seed: number,
  detail = 1
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail)
  roughen(g, 0.42, 1.5, seed)
  g.scale(scale[0], scale[1], scale[2])
  g.translate(offset[0], offset[1], offset[2])
  return faceted(g)
}

function trunk(rTop: number, rBottom: number, h: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 6, 1, true)
  g.translate(0, h / 2, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    // a slight lean so no two trunks read as the same extrusion
    const y = p.getY(i)
    const t = y / h
    p.setX(i, p.getX(i) + Math.sin(seed) * 0.18 * t * t)
    p.setZ(i, p.getZ(i) + Math.cos(seed * 1.7) * 0.18 * t * t)
  }
  return faceted(g)
}

// ---------- trees ----------

export type TreeSpecies = 'broadleaf' | 'slim' | 'autumn'

const BARK_DARK = lin('#3B2F24')
const BARK_LIGHT = lin('#5C4837')

interface CanopyRamp {
  dark: [number, number, number]
  light: [number, number, number]
}
const OLIVE: CanopyRamp = { dark: lin('#3C4B26'), light: lin('#6C8043') }
const OLIVE_DEEP: CanopyRamp = { dark: lin('#334126'), light: lin('#556A34') }
const AUTUMN: CanopyRamp = { dark: lin('#9C4826'), light: lin('#DE8F4C') }

export function makeTreeGeometry(species: TreeSpecies): THREE.BufferGeometry {
  const parts: Part[] = []
  let treeHeight: number
  let ramp: CanopyRamp
  let yLo: number
  let yHi: number

  const barkColour = (_x: number, y: number, _z: number): [number, number, number] =>
    mix3(BARK_DARK, BARK_LIGHT, Math.min(1, y / 4) * 0.8)

  if (species === 'slim') {
    treeHeight = 11.3
    ramp = OLIVE_DEEP
    yLo = 5.4
    yHi = 11.3
    parts.push({ geo: trunk(0.12, 0.24, 5.4, 1.3), colour: barkColour, weight: () => 0 })
    parts.push({
      geo: blob(1.55, [0.9, 2.0, 0.9], [0, 7.2, 0], 3.1),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
    parts.push({
      geo: blob(1.15, [0.85, 1.5, 0.85], [0.25, 9.6, 0.1], 8.7),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
  } else if (species === 'autumn') {
    treeHeight = 7.3
    ramp = AUTUMN
    yLo = 2.9
    yHi = 7.3
    parts.push({ geo: trunk(0.15, 0.29, 2.9, 2.7), colour: barkColour, weight: () => 0 })
    parts.push({
      geo: blob(2.2, [1.15, 0.95, 1.1], [0, 4.4, 0], 5.5),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
    parts.push({
      geo: blob(1.6, [1.0, 0.9, 1.0], [0.85, 5.6, -0.45], 12.2),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
    parts.push({
      geo: blob(1.35, [1.05, 0.85, 1.0], [-0.95, 3.9, 0.6], 19.4, 0),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
  } else {
    treeHeight = 8.4
    ramp = OLIVE
    yLo = 3.4
    yHi = 8.4
    parts.push({ geo: trunk(0.16, 0.3, 3.4, 0.6), colour: barkColour, weight: () => 0 })
    parts.push({
      geo: blob(2.6, [1.2, 0.92, 1.1], [0, 5.1, 0], 2.2),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
    parts.push({
      geo: blob(1.85, [1.0, 0.9, 1.0], [0.95, 6.5, -0.5], 9.9),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
    parts.push({
      geo: blob(1.6, [1.05, 0.85, 1.0], [-1.15, 4.6, 0.7], 15.1, 0),
      colour: canopyColour(ramp, yLo, yHi),
      weight: swayWeight(treeHeight),
    })
  }

  return bake(parts, 'aSway')
}

function canopyColour(ramp: CanopyRamp, yLo: number, yHi: number) {
  return (x: number, y: number, z: number): [number, number, number] => {
    const t = Math.min(1, Math.max(0, (y - yLo) / (yHi - yLo)))
    const n = valueNoise2D(x * 1.9 + 4.1, z * 1.9 + 2.3)
    return mix3(ramp.dark, ramp.light, t * 0.72 + n * 0.28)
  }
}

function swayWeight(height: number) {
  return (y: number): number => {
    const t = Math.min(1, Math.max(0, y / height))
    return t * t
  }
}

// ---------- rocks ----------

const ROCK_DARK = lin('#5F584C')
const ROCK_LIGHT = lin('#9A8F7C')

export function makeRockGeometry(): THREE.BufferGeometry {
  // detail 0 = 20 facets. With this much roughen it reads as a boulder, and at 640
  // instances x 2 passes (colour + shadow) every triangle counts.
  const g = new THREE.IcosahedronGeometry(1, 0)
  roughen(g, 0.72, 2.4, 6.6)
  return bake(
    [
      {
        geo: faceted(g),
        colour: (x, y, z) => {
          // sun-bleached on top, dark and lichen-shadowed underneath
          const up = Math.min(1, Math.max(0, y * 0.5 + 0.5))
          const grain = valueNoise2D(x * 2.6 + 3.3, z * 2.6 + 7.7)
          return mix3(ROCK_DARK, ROCK_LIGHT, up * 0.7 + grain * 0.3)
        },
        weight: () => 0,
      },
    ],
    'aSway'
  )
}

// ---------- grass ----------

const GRASS_ROOT = lin('#3B4A22')
const GRASS_TIP = lin('#8A9350')

/**
 * Three crossed blades on a UNIT height - Grass.tsx scales instances down to
 * 0.2-0.8 m. Normals all point up so a tuft lights like the ground it sits on.
 * The tip keeps some width: taper it to a needle and a tuft reads as a pale cone.
 */
export function makeGrassGeometry(): THREE.BufferGeometry {
  const H = 1.0
  const WBASE = 0.17
  const WTIP = 0.06
  const LEAN = 0.15
  const BLADES = 3

  const verts: number[] = []
  const blade: number[] = []
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const rot = (px: number, pz: number): [number, number] => [px * ca - pz * sa, px * sa + pz * ca]
    const lean = LEAN * (0.6 + 0.8 * hash2D(b * 3.7, 1.1))
    const [x0, z0] = rot(-WBASE, 0)
    const [x1, z1] = rot(WBASE, 0)
    const [x2, z2] = rot(WTIP, lean)
    const [x3, z3] = rot(-WTIP, lean)
    // two triangles, wound so the tuft is legible from the front
    verts.push(x0, 0, z0, x1, 0, z1, x2, H, z2)
    verts.push(x0, 0, z0, x2, H, z2, x3, H, z3)
    blade.push(0, 0, 1, 0, 1, 1)
  }

  const count = verts.length / 3
  const position = new Float32Array(verts)
  const normal = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const aBlade = new Float32Array(blade)
  for (let i = 0; i < count; i++) {
    normal[i * 3 + 1] = 1
    const col = mix3(GRASS_ROOT, GRASS_TIP, aBlade[i] * aBlade[i])
    color[i * 3] = col[0]
    color[i * 3 + 1] = col[1]
    color[i * 3 + 2] = col[2]
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.setAttribute('aBlade', new THREE.BufferAttribute(aBlade, 1))
  g.computeBoundingSphere()
  return g
}

// ---------- mountains ----------
//
// THE THIRD DEPTH PLANE, and it took four goes.
//
// v1 stood on the terrain at r=900-1170. That put them behind the far plane from most of
// the bowl (the camera only reaches 1200 m), so half the time there were no mountains at
// all, and where they survived the sun rig lit them into a pale rock wall on top of the
// rim.
//
// v2 made them a camera-locked backdrop, unlit, with the haze mixed into their vertex
// colours. Better, but it earned the note that killed it: a solid flat lavender band with
// a hard top edge cutting across the sky, which "lifts" to reveal the real rim as you
// approach. That is what ANY opaque silhouette does when its colour is a single fogged
// tone and the sky behind it is a gradient. Fog toward one colour can never match a
// gradient, so the shape reads as a curtain hung in front of the sky.
//
// v3 is the fix, and it is a different idea: the mountains do not fade toward a COLOUR,
// they fade toward TRANSPARENCY. Alpha runs to zero at every summit and grows downward,
// so at the silhouette the actual sky is what you see - by construction, not by
// approximation, and at every elevation and every bearing. There is no top edge to find
// because the geometry's top edge is invisible. Approaching the rim now reads as haze
// receding behind a hill, because that is literally what is happening.
//
// Three consequences, all deliberate:
//   - `fog={false}`: the scene fog is a warm #CDA184 and would drag the alpha-blended
//     result back toward the solid tone we are escaping. This material drives its own
//     fade and nothing else touches it.
//   - the rings are emitted FAR-FIRST, because depthWrite is off and painter's order is
//     all that separates them. Near-over-far is what makes them layer.
//   - the sun shading is still baked in from the face normal, so the silhouettes keep
//     their shape without ever brightening past the haze they are dissolving into.

const MOUNTAIN_BASE = lin('#4E587A')
const MOUNTAIN_TOP = lin('#838AAA')
/** A touch of pre-haze, so the far rings sit behind the near ones before alpha even acts. */
const MOUNTAIN_HAZE = lin('#B9B4C2')

interface Ring {
  radius: number
  wobble: number
  /** absolute world height of this ring's lowest and highest peaks */
  topMin: number
  topMax: number
  haze: number
  /** peak opacity, reached `fade` metres below the summit */
  maxAlpha: number
  /** metres over which alpha climbs from 0 at the summit */
  fade: number
  seed: number
  spikes: number
}

// Near to far. Peaks clear the terrain ridge by 1-3 degrees and no more, so the sky owns
// everything above them. Distances stay under the 1200 m far plane with room for the
// peaks: sqrt(1102^2 + 184^2) = 1117.
const RINGS: Ring[] = [
  { radius: 985, wobble: 55, topMin: 148, topMax: 164, haze: 0.10, maxAlpha: 0.68, fade: 92, seed: 11.3, spikes: 4 },
  { radius: 1035, wobble: 55, topMin: 156, topMax: 174, haze: 0.22, maxAlpha: 0.50, fade: 84, seed: 47.9, spikes: 6 },
  { radius: 1085, wobble: 45, topMin: 165, topMax: 184, haze: 0.36, maxAlpha: 0.36, fade: 76, seed: 83.1, spikes: 3 },
]

const SEG = 224
/** 7, not 5: the alpha ramp is interpolated across these, and the summit needs headroom. */
const LAYERS = 7
/** Well below the bowl floor. The terrain hides it from inside; nothing else can see it. */
const BASE_Y = -140

export function makeMountainGeometry(): THREE.BufferGeometry {
  const sun = getSunDirection()
  const tris = RINGS.length * SEG * LAYERS * 2
  const position = new Float32Array(tris * 9)
  const aCol = new Float32Array(tris * 9)
  const aAlpha = new Float32Array(tris * 3)
  let o = 0
  let ao = 0

  const push = (x: number, y: number, z: number, col: [number, number, number], a: number) => {
    position[o] = x
    position[o + 1] = y
    position[o + 2] = z
    aCol[o] = col[0]
    aCol[o + 1] = col[1]
    aCol[o + 2] = col[2]
    o += 3
    aAlpha[ao++] = a
  }

  // Flat-face lambert, evaluated once at build time. A quad's normal is close enough to
  // its own outward radial for a silhouette 1 km away.
  const shadeAt = (th: number): number => {
    const d = Math.cos(th) * sun.x + Math.sin(th) * sun.z
    return 0.74 + 0.26 * Math.max(0, d)
  }

  // FAR FIRST. depthWrite is off, so whatever is drawn last wins the blend.
  for (let ri = RINGS.length - 1; ri >= 0; ri--) {
    const ring = RINGS[ri]
    const baseCol = mix3(MOUNTAIN_BASE, MOUNTAIN_HAZE, ring.haze)
    const topCol = mix3(MOUNTAIN_TOP, MOUNTAIN_HAZE, ring.haze * 0.85)

    const px: number[][] = []
    const py: number[][] = []
    const pz: number[][] = []
    const pa: number[][] = []
    const shade: number[] = []
    for (let i = 0; i < SEG; i++) {
      const th = (i / SEG) * Math.PI * 2
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const n1 = fbm2D(ct * 3.2 + ring.seed, st * 3.2 + ring.seed, 3)
      const n2 = fbm2D(ct * 8.6 + ring.seed * 2, st * 8.6 + ring.seed * 2, 2)
      const spike = Math.pow(Math.max(0, Math.sin(th * ring.spikes + ring.seed)), 6) * 0.45
      const t = Math.min(1, Math.max(0, n1 * 0.8 + n2 * 0.4 - 0.12 + spike))
      const top = ring.topMin + (ring.topMax - ring.topMin) * t
      const R = ring.radius + (n2 - 0.5) * ring.wobble

      const cx: number[] = []
      const cy: number[] = []
      const cz: number[] = []
      const ca: number[] = []
      for (let l = 0; l <= LAYERS; l++) {
        const f = l / LAYERS
        const jitter = (hash2D(i * 1.7 + ring.seed, l * 3.1) - 0.5) * 15 * (1 - f * 0.55)
        const rr = R * (1 - 0.1 * f * f) + jitter
        const y = BASE_Y + (top - BASE_Y) * Math.pow(f, 0.85)
        cx.push(Math.cos(th) * rr)
        cy.push(y)
        cz.push(Math.sin(th) * rr)
        // ZERO at the summit. This is the whole trick: the silhouette is the sky.
        const k = Math.min(1, Math.max(0, (top - y) / ring.fade))
        ca.push(ring.maxAlpha * Math.pow(k, 0.75))
      }
      px.push(cx)
      py.push(cy)
      pz.push(cz)
      pa.push(ca)
      shade.push(shadeAt(th))
    }

    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG
      const sh = (shade[i] + shade[j]) * 0.5
      for (let l = 0; l < LAYERS; l++) {
        const f0 = l / LAYERS
        const f1 = (l + 1) / LAYERS
        const a = mix3(baseCol, topCol, f0)
        const b = mix3(baseCol, topCol, f1)
        const c0: [number, number, number] = [a[0] * sh, a[1] * sh, a[2] * sh]
        const c1: [number, number, number] = [b[0] * sh, b[1] * sh, b[2] * sh]
        push(px[i][l], py[i][l], pz[i][l], c0, pa[i][l])
        push(px[j][l], py[j][l], pz[j][l], c0, pa[j][l])
        push(px[j][l + 1], py[j][l + 1], pz[j][l + 1], c1, pa[j][l + 1])
        push(px[i][l], py[i][l], pz[i][l], c0, pa[i][l])
        push(px[j][l + 1], py[j][l + 1], pz[j][l + 1], c1, pa[j][l + 1])
        push(px[i][l + 1], py[i][l + 1], pz[i][l + 1], c1, pa[i][l + 1])
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3))
  g.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1))
  g.computeBoundingSphere()
  return g
}
