import * as THREE from 'three'
import { Effect } from 'postprocessing'

// ============================================================
//  COLOUR GRADE - the cinematic evening, in one merged pass
// ------------------------------------------------------------
//  Runs AFTER tone mapping, on display-referred colour, which is
//  the only place a split-tone means anything.
//
//  Two moves, both stolen from film:
//    - lift the shadows toward teal. Real evening shadows are lit
//      by the sky, not the sun, and the sky is blue. A neutral
//      black shadow next to a gold highlight reads as CG.
//    - push the highlights toward gold. Warm/cool separation is
//      the whole trick; everything else here is seasoning.
//
//  Then a gentle S-curve for contrast and a touch of saturation.
//  All of it is a handful of ALU on a fullscreen quad, and it is
//  merged into the same EffectPass as tone mapping and vignette,
//  so it costs one texture fetch, not four.
// ============================================================

const fragmentShader = /* glsl */ `
uniform float uShadowLift;
uniform float uWarmth;
uniform float uContrast;
uniform float uSaturation;
uniform float uOlive;

const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = inputColor.rgb;
  float l = dot( c, LUMA );

  float shadows = 1.0 - smoothstep( 0.0, 0.40, l );
  float highs = smoothstep( 0.40, 0.95, l );

  c += vec3( -0.008, 0.022, 0.048 ) * shadows * uShadowLift;
  c *= mix( vec3( 1.0 ), vec3( 1.060, 1.012, 0.918 ), highs * uWarmth );

  // Foliage lit head-on by a saturated warm sun comes back a vivid grass green,
  // which belongs to a different game. Bleed green toward gold - the standard
  // film move for olive landscapes - and leave every other hue alone.
  float greenish = clamp( c.g - max( c.r, c.b ), 0.0, 1.0 );
  c.r += greenish * uOlive * 0.62;
  c.b -= greenish * uOlive * 0.20;

  c = clamp( c, 0.0, 1.0 );

  // smoothstep IS an S-curve. Blending toward it is a contrast dial.
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), uContrast );

  float g = dot( c, LUMA );
  c = mix( vec3( g ), c, uSaturation );

  outputColor = vec4( clamp( c, 0.0, 1.0 ), inputColor.a );
}
`

export interface GradeOptions {
  shadowLift?: number
  warmth?: number
  contrast?: number
  saturation?: number
  olive?: number
}

export class GradeEffect extends Effect {
  constructor({
    shadowLift = 1,
    warmth = 1,
    contrast = 0.24,
    saturation = 1.1,
    olive = 0.55,
  }: GradeOptions = {}) {
    super('GradeEffect', fragmentShader, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uShadowLift', new THREE.Uniform(shadowLift)],
        ['uWarmth', new THREE.Uniform(warmth)],
        ['uContrast', new THREE.Uniform(contrast)],
        ['uSaturation', new THREE.Uniform(saturation)],
        ['uOlive', new THREE.Uniform(olive)],
      ]),
    })
  }
}
