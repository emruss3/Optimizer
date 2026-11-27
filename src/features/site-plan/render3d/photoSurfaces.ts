import type * as THREE from 'three';

/** Small, world-stable variation over the photographed materials. Coordinates
 * are in metres so the effect is continuous across street, apron and lawn pieces. */
const GROUND_LOOK = {
  grass: { tileBlend: 0.56, variation: 0.19, tone: [0.95, 1.02, 0.91] },
  asphalt: { tileBlend: 0.36, variation: 0.11, tone: [1.01, 1.00, 0.98] },
  concrete: { tileBlend: 0.23, variation: 0.075, tone: [1.02, 1.00, 0.96] },
} as const;

export type PhotoGround = keyof typeof GROUND_LOOK;

export function groundPhotoFinish(material: THREE.MeshStandardMaterial, kind: PhotoGround): void {
  const { tileBlend, variation, tone } = GROUND_LOOK[kind];
  material.customProgramCacheKey = () => 'pp-photo-ground-v1-' + kind;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 ppGround;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        ppGround = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 ppGround;
        float ppHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ppField(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(ppHash(i), ppHash(i+vec2(1,0)), f.x),
                     mix(ppHash(i+vec2(0,1)), ppHash(i+1.0), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 p = vMapUv;
          float coarse = ppField(ppGround * 0.21);
          float wear = mix(coarse, ppField(ppGround * 0.71 + vec2(9.2, 3.7)), 0.34);
          vec2 q = mat2(0.86, -0.51, 0.51, 0.86) * p * 1.43 + vec2(0.41, 0.22);
          vec4 primary = texture2D(map, p);
          vec3 secondaryColor = texture2D(map, q).rgb;
          vec3 base = mix(primary.rgb, secondaryColor, ${tileBlend.toFixed(3)} * smoothstep(0.13, 0.84, wear));
          float brightness = 1.0 + (wear - 0.5) * ${(variation * 2).toFixed(3)};
          diffuseColor *= vec4(base * brightness * vec3(${tone.map(v => v.toFixed(3)).join(', ')}), primary.a);
        #endif`);
  };
}
