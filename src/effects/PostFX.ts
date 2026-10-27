import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Un único pase de post-proceso que simula el sensor de una videocámara de fines de los 90:
 * exposición/ganancia, tone mapping, ruido de sensor, scanlines, aberración cromática,
 * glitches, tracking de cinta, visión nocturna y la "vista a ojo desnudo".
 */
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uSeed;
  uniform float uExposure;
  uniform float uEye;
  uniform float uNV;
  uniform float uTape;
  uniform float uNoise;
  uniform float uScan;
  uniform float uChroma;
  uniform float uGlitch;
  uniform float uTracking;
  uniform float uVignette;
  uniform float uBlackout;
  uniform float uStatic;
  uniform float uDistort;
  uniform float uBleed;
  uniform float uSqueeze;
  uniform float uFlash;
  varying vec2 vUv;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime;

    // encendido / apagado: la imagen colapsa a una línea
    float sq = max(1.0 - uSqueeze, 0.003);
    uv.y = (uv.y - 0.5) / sq + 0.5;

    // temblor de líneas (cinta, tracking)
    float row = floor(vUv.y * 240.0);
    float jitter = (hash(vec2(row, floor(t * 29.97))) - 0.5) * (0.0014 * uTape + 0.006 * uTracking);
    // bloques de glitch desplazados
    float blk = floor(vUv.y * 22.0);
    float gr = hash(vec2(blk, floor(t * 14.0) + uSeed * 17.0));
    float gOn = step(1.0 - uGlitch * 0.45, gr);
    float gShift = gOn * (hash(vec2(blk * 1.7, floor(t * 20.0))) - 0.5) * 0.2 * uGlitch;
    // banda de tracking que sube por la pantalla
    float bandY = fract(t * 0.12 + uSeed * 0.07);
    float band = exp(-pow((vUv.y - bandY) * 16.0, 2.0)) * uTracking;
    // ruido de cabezal en la parte inferior (VHS)
    float headSw = smoothstep(0.04, 0.0, vUv.y) * (uTape + uTracking * 0.6);
    uv.x += jitter + gShift + band * (hash(vec2(row, t)) - 0.5) * 0.09 + headSw * hash(vec2(row, floor(t * 60.0))) * 0.05;
    // distorsión cuando la entidad está cerca
    uv += uDistort * vec2(sin(vUv.y * 38.0 + t * 9.0), cos(vUv.x * 27.0 + t * 6.0)) * 0.004;

    vec2 dc = uv - 0.5;
    float ca = uChroma * (0.3 + dot(dc, dc) * 2.2) + abs(gShift) * 0.12 + uTape * 0.0016;
    vec3 col;
    col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;

    // sangrado de color de la cinta: croma borroso, luma nítida
    if (uBleed > 0.001) {
      vec3 b = texture2D(tDiffuse, uv + vec2(0.004, 0.0)).rgb
             + texture2D(tDiffuse, uv + vec2(0.009, 0.0)).rgb
             + texture2D(tDiffuse, uv - vec2(0.003, 0.0)).rgb;
      b /= 3.0;
      float l0 = dot(col, vec3(0.299, 0.587, 0.114));
      float lb = dot(b, vec3(0.299, 0.587, 0.114));
      col = mix(col, max(b - lb + l0, 0.0), uBleed);
    }

    float glow = 0.0;
    if (uNV > 0.01) {
      float g = 0.0;
      g += dot(texture2D(tDiffuse, uv + vec2(0.007, 0.0)).rgb, vec3(0.33));
      g += dot(texture2D(tDiffuse, uv - vec2(0.007, 0.0)).rgb, vec3(0.33));
      g += dot(texture2D(tDiffuse, uv + vec2(0.0, 0.01)).rgb, vec3(0.33));
      g += dot(texture2D(tDiffuse, uv - vec2(0.0, 0.01)).rgb, vec3(0.33));
      glow = max(g * 0.25 * uExposure - 0.7, 0.0) * 0.35;
    }

    col *= uExposure;
    col = aces(col);
    col = pow(col, vec3(1.0 / 2.2));
    float lum = dot(col, vec3(0.299, 0.587, 0.114));

    // cámara: leve calidez, negros aplastados, saturación reducida
    vec3 camCol = mix(vec3(lum), col, 0.78) * vec3(1.04, 1.0, 0.93);
    camCol = max(camCol - 0.012, 0.0) * 1.03;
    // ojo desnudo: visión escotópica, azulada y desaturada
    vec3 eyeCol = mix(col, vec3(lum) * vec3(0.72, 0.84, 1.0), 0.62);
    // visión nocturna: fósforo verde/gris
    float nvl = pow(clamp(lum, 0.0, 1.0), 0.85) * 1.2 + glow;
    vec3 nvCol = vec3(0.34, 1.0, 0.45) * nvl + vec3(0.015, 0.04, 0.02);

    vec3 outc = mix(camCol, eyeCol, uEye);
    outc = mix(outc, nvCol, uNV);
    vec3 tapeCol = mix(vec3(lum), outc, 0.72) * vec3(1.06, 0.98, 0.88) * 0.9 + 0.028;
    outc = mix(outc, tapeCol, uTape);

    // ruido de sensor: más fuerte en las sombras (ganancia)
    vec2 fc = gl_FragCoord.xy;
    float n = hash(fc * 0.73 + fract(t * 7.13) * 917.0) - 0.5;
    float nAmt = uNoise * (0.55 + (1.0 - lum) * 0.9);
    outc += n * nAmt * mix(vec3(1.0), vec3(0.4, 1.0, 0.5), uNV);
    // puntos calientes del sensor en la banda de tracking
    outc += band * hash(vec2(fc.x * 0.2, row + t)) * 0.35;
    outc += headSw * hash(fc + t) * 0.25;

    // scanlines
    float scan = 0.5 + 0.5 * sin(fc.y * 2.0943951);
    outc *= 1.0 - uScan * scan;

    // estática completa
    float st = hash(floor(fc * 0.5) + floor(t * 30.0) * 3.1);
    outc = mix(outc, vec3(st) * vec3(0.92, 0.95, 1.0), uStatic);

    // viñeta (circular en visión nocturna)
    float vig = smoothstep(0.25, 0.95, length(dc * vec2(1.05, 1.0)) * 1.25);
    outc *= 1.0 - uVignette * vig;
    outc *= 1.0 - uNV * smoothstep(0.55, 0.78, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 0.9) * 0.8;

    outc += uFlash;
    outc *= 1.0 - uBlackout;
    // fuera de la zona visible durante el colapso: negro, más la línea brillante final
    if (uv.y < 0.0 || uv.y > 1.0) outc = vec3(0.0);
    outc += vec3(0.9) * smoothstep(0.9, 1.0, uSqueeze) * exp(-abs(vUv.y - 0.5) * uRes.y * 0.35) * (1.0 - uBlackout);

    // dither para evitar bandas en la oscuridad
    outc += (hash(fc + 0.5) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
  }
`;

export interface FXParams {
  exposure: number;
  eye: number;
  nv: number;
  tape: number;
  noise: number;
  scan: number;
  chroma: number;
  glitch: number;
  tracking: number;
  vignette: number;
  blackout: number;
  static: number;
  distort: number;
  bleed: number;
  squeeze: number;
  flash: number;
}

export class PostFX {
  readonly rt: THREE.WebGLRenderTarget;
  readonly material: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly params: FXParams = {
    exposure: 1,
    eye: 1,
    nv: 0,
    tape: 0,
    noise: 0.04,
    scan: 0.05,
    chroma: 0.001,
    glitch: 0,
    tracking: 0,
    vignette: 0.6,
    blackout: 1,
    static: 0,
    distort: 0,
    bleed: 0,
    squeeze: 0,
    flash: 0,
  };
  readonly hdr: boolean;
  renderScale = 1;

  constructor(renderer: THREE.WebGLRenderer) {
    const ext = renderer.extensions;
    this.hdr = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSeed: { value: 0 },
        uExposure: { value: 1 },
        uEye: { value: 1 },
        uNV: { value: 0 },
        uTape: { value: 0 },
        uNoise: { value: 0 },
        uScan: { value: 0 },
        uChroma: { value: 0 },
        uGlitch: { value: 0 },
        uTracking: { value: 0 },
        uVignette: { value: 0 },
        uBlackout: { value: 0 },
        uStatic: { value: 0 },
        uDistort: { value: 0 },
        uBleed: { value: 0 },
        uSqueeze: { value: 0 },
        uFlash: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  setSize(cssW: number, cssH: number, pixelRatio: number): void {
    const w = Math.max(2, Math.floor(cssW * pixelRatio * this.renderScale));
    const h = Math.max(2, Math.floor(cssH * pixelRatio * this.renderScale));
    this.rt.setSize(w, h);
    (this.material.uniforms.uRes.value as THREE.Vector2).set(cssW * pixelRatio, cssH * pixelRatio);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const u = this.material.uniforms;
    const p = this.params;
    u.uTime.value = time;
    u.uSeed.value = Math.random();
    u.uExposure.value = p.exposure;
    u.uEye.value = p.eye;
    u.uNV.value = p.nv;
    u.uTape.value = p.tape;
    u.uNoise.value = p.noise;
    u.uScan.value = p.scan;
    u.uChroma.value = p.chroma;
    u.uGlitch.value = p.glitch;
    u.uTracking.value = p.tracking;
    u.uVignette.value = p.vignette;
    u.uBlackout.value = p.blackout;
    u.uStatic.value = p.static;
    u.uDistort.value = p.distort;
    u.uBleed.value = p.bleed;
    u.uSqueeze.value = p.squeeze;
    u.uFlash.value = p.flash;

    if (p.blackout < 0.999) {
      renderer.setRenderTarget(this.rt);
      renderer.clear();
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }
}
