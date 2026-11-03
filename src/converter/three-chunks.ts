// Remplacements pour les chunks three.js les plus utilisés (#include <common>,
// <packing>, <colorspace_fragment>...). Les formules suivent celles de three.js
// (licence MIT). On n'injecte que ce que le shader utilise vraiment.

interface Chunk {
  code: string;
  deps?: string[];
}

const DEFINES: Record<string, string> = {
  PI2: '#define PI2 6.283185307179586',
  PI_HALF: '#define PI_HALF 1.5707963267948966',
  RECIPROCAL_PI: '#define RECIPROCAL_PI 0.3183098861837907',
  RECIPROCAL_PI2: '#define RECIPROCAL_PI2 0.15915494309189535',
  EPSILON: '#define EPSILON 1e-6',
  LOG2: '#define LOG2 1.442695',
  saturate: '#define saturate(a) clamp(a, 0.0, 1.0)',
  whiteComplement: '#define whiteComplement(a) (1.0 - saturate(a))',
};

const FUNCS: Record<string, Chunk> = {
  pow2: { code: 'float pow2(const in float x) { return x * x; }\nvec3 pow2(const in vec3 x) { return x * x; }' },
  pow3: { code: 'float pow3(const in float x) { return x * x * x; }' },
  pow4: { code: 'float pow4(const in float x) { float x2 = x * x; return x2 * x2; }' },
  max3: { code: 'float max3(const in vec3 v) { return max(max(v.x, v.y), v.z); }' },
  average: { code: 'float average(const in vec3 v) { return dot(v, vec3(0.3333333)); }' },
  rand: {
    code: 'float rand(const in vec2 uv) {\n\tfloat dt = dot(uv.xy, vec2(12.9898, 78.233));\n\tfloat sn = mod(dt, PI);\n\treturn fract(sin(sn) * 43758.5453);\n}',
  },
  luminance: { code: 'float luminance(const in vec3 rgb) {\n\treturn dot(vec3(0.2126729, 0.7151522, 0.0721750), rgb);\n}' },
  packNormalToRGB: { code: 'vec3 packNormalToRGB(const in vec3 normal) { return normalize(normal) * 0.5 + 0.5; }' },
  unpackRGBToNormal: { code: 'vec3 unpackRGBToNormal(const in vec3 rgb) { return 2.0 * rgb - 1.0; }' },
  packDepthToRGBA: {
    code: 'vec4 packDepthToRGBA(const in float v) {\n\tvec4 r = vec4(fract(v * vec3(16777216.0, 65536.0, 256.0)), v);\n\tr.yzw -= r.xyz * (1.0 / 256.0);\n\treturn r * (256.0 / 255.0);\n}',
  },
  unpackRGBAToDepth: {
    code: 'float unpackRGBAToDepth(const in vec4 v) {\n\treturn dot(v, (255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0));\n}',
  },
  packDepthToRG: { code: 'vec2 packDepthToRG(const in float v) { return packDepthToRGBA(v).yx; }', deps: ['packDepthToRGBA'] },
  unpackRGToDepth: { code: 'float unpackRGToDepth(const in vec2 v) { return unpackRGBAToDepth(vec4(v.xy, 0.0, 0.0)); }', deps: ['unpackRGBAToDepth'] },
  viewZToOrthographicDepth: { code: 'float viewZToOrthographicDepth(const in float viewZ, const in float near, const in float far) {\n\treturn (viewZ + near) / (near - far);\n}' },
  orthographicDepthToViewZ: { code: 'float orthographicDepthToViewZ(const in float depth, const in float near, const in float far) {\n\treturn depth * (near - far) - near;\n}' },
  viewZToPerspectiveDepth: { code: 'float viewZToPerspectiveDepth(const in float viewZ, const in float near, const in float far) {\n\treturn ((near + viewZ) * far) / ((far - near) * viewZ);\n}' },
  perspectiveDepthToViewZ: { code: 'float perspectiveDepthToViewZ(const in float depth, const in float near, const in float far) {\n\treturn (near * far) / ((far - near) * depth - far);\n}' },
  sRGBTransferOETF: {
    code: 'vec4 sRGBTransferOETF(const in vec4 value) {\n\treturn vec4(mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92, vec3(lessThanEqual(value.rgb, vec3(0.0031308)))), value.a);\n}',
  },
  LinearTosRGB: { code: 'vec4 LinearTosRGB(const in vec4 value) { return sRGBTransferOETF(value); }', deps: ['sRGBTransferOETF'] },
  sRGBTransferEOTF: {
    code: 'vec4 sRGBTransferEOTF(const in vec4 value) {\n\treturn vec4(mix(pow(value.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), value.rgb * 0.0773993808, vec3(lessThanEqual(value.rgb, vec3(0.04045)))), value.a);\n}',
  },
  sRGBToLinear: { code: 'vec4 sRGBToLinear(const in vec4 value) { return sRGBTransferEOTF(value); }', deps: ['sRGBTransferEOTF'] },
  linearToOutputTexel: { code: 'vec4 linearToOutputTexel(vec4 value) { return sRGBTransferOETF(value); }', deps: ['sRGBTransferOETF'] },
};

const SUPPORTED_INCLUDES = new Set(['common', 'packing', 'colorspace_pars_fragment', 'encodings_pars_fragment']);

/**
 * Remplace les #include three.js connus par les définitions utilisées.
 * Retourne le source modifié et la liste des includes non résolus.
 */
export function resolveThreeIncludes(src: string): { src: string; resolved: string[]; unresolved: string[]; injected?: string[] } {
  const includes = [...src.matchAll(/^\s*#include\s*<([\w]+)>/gm)].map((m) => m[1]);
  const resolved = includes.filter((i) => SUPPORTED_INCLUDES.has(i));
  const unresolved = includes.filter((i) => !SUPPORTED_INCLUDES.has(i) && !/^(colorspace_fragment|encodings_fragment|tonemapping_fragment|premultiplied_alpha_fragment|dithering_fragment)$/.test(i));
  // Les chunks de fin de shader (colorspace_fragment...) ne font qu'ajuster gl_FragColor : on les retire.
  let body = src.replace(/^\s*#include\s*<[\w]+>.*$/gm, '');
  // three.js ajoute <common> à tous les ShaderMaterial : on fournit les fonctions
  // utilisées mais non définies, même sans #include explicite.

  const used = new Set<string>();
  const want = (name: string) => {
    if (used.has(name)) return;
    used.add(name);
    for (const d of FUNCS[name]?.deps ?? []) want(d);
    if (name === 'whiteComplement') want('saturate');
  };
  const defined = (name: string) =>
    new RegExp(`\\b(float|vec[234]|void|int|bool)\\s+${name}\\s*[(=;\\[]|#define\\s+${name}\\b|\\bconst\\s+\\w+\\s+${name}\\b`).test(body);
  for (const name of Object.keys(DEFINES)) if (new RegExp(`\\b${name}\\b`).test(body) && !defined(name)) want(name);
  for (const name of Object.keys(FUNCS)) if (new RegExp(`\\b${name}\\s*\\(`).test(body) && !defined(name)) want(name);
  if (!used.size) return { src: body, resolved, unresolved };
  const head: string[] = [];
  for (const name of Object.keys(DEFINES)) if (used.has(name) && !defined(name)) head.push(DEFINES[name]);
  for (const name of Object.keys(FUNCS)) if (used.has(name) && !defined(name)) head.push(FUNCS[name].code);
  if (head.length) body = '// --- fonctions three.js (common / packing / colorspace) ---\n' + head.join('\n') + '\n// ---\n' + body;
  return { src: body, resolved, unresolved, injected: [...used] };
}
