import * as THREE from 'three';

/** Pantalla de TV con estática animada. Barata: todo en el shader, sin texturas. */
export function createTVStaticMaterial(strength = 1.6): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: strength },
      uOn: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      uniform float uOn;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 px = floor(vUv * vec2(160.0, 120.0));
        float n = hash(px + floor(uTime * 24.0) * 1.37);
        float roll = smoothstep(0.0, 0.08, abs(fract(vUv.y - uTime * 0.21) - 0.5)) * 0.35 + 0.65;
        float lines = 0.85 + 0.15 * sin(vUv.y * 480.0);
        vec2 c = vUv - 0.5;
        float vig = 1.0 - dot(c, c) * 1.6;
        vec3 col = vec3(n * 0.9, n * 0.95, n) * roll * lines * vig * uStrength * uOn;
        gl_FragColor = vec4(col + vec3(0.004, 0.005, 0.006), 1.0);
      }
    `,
  });
}
