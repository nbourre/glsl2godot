// Petite inférence de types GLSL, juste assez pour corriger les conversions
// implicites int -> float que Godot refuse.

export const FLOAT_VEC = ['vec2', 'vec3', 'vec4'];
export const INT_VEC = ['ivec2', 'ivec3', 'ivec4'];
export const UINT_VEC = ['uvec2', 'uvec3', 'uvec4'];
export const BOOL_VEC = ['bvec2', 'bvec3', 'bvec4'];
export const MATS = ['mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4'];

export const isFloatScalar = (t?: string | null) => t === 'float';
export const isIntScalar = (t?: string | null) => t === 'int' || t === 'uint';
export const isFloatKind = (t?: string | null) =>
  !!t && (t === 'float' || FLOAT_VEC.includes(t) || MATS.includes(t));
export const isIntKind = (t?: string | null) =>
  !!t && (t === 'int' || INT_VEC.includes(t));
export const isVector = (t?: string | null) =>
  !!t && (FLOAT_VEC.includes(t) || INT_VEC.includes(t) || UINT_VEC.includes(t) || BOOL_VEC.includes(t));
export const isMatrix = (t?: string | null) => !!t && MATS.includes(t);

export function vecSize(t: string): number {
  const m = t.match(/(\d)$/);
  return m ? parseInt(m[1], 10) : 1;
}

export function scalarOf(t: string): string {
  if (t.startsWith('ivec')) return 'int';
  if (t.startsWith('uvec')) return 'uint';
  if (t.startsWith('bvec')) return 'bool';
  if (t.startsWith('vec') || t.startsWith('mat')) return 'float';
  return t;
}

export function vecOf(scalar: string, n: number): string {
  if (n === 1) return scalar;
  const p = scalar === 'int' ? 'ivec' : scalar === 'uint' ? 'uvec' : scalar === 'bool' ? 'bvec' : 'vec';
  return p + n;
}

/** Type résultant d'une opération arithmétique binaire. */
export function arithResult(op: string, a: string | null, b: string | null): string | null {
  if (!a || !b) return a || b;
  if (isMatrix(a) && isVector(b) && op === '*') return 'vec' + matRows(a);
  if (isVector(a) && isMatrix(b) && op === '*') return a;
  if (isMatrix(a)) return a;
  if (isMatrix(b)) return b;
  if (isVector(a)) return a;
  if (isVector(b)) return b;
  if (a === 'float' || b === 'float') return 'float';
  return a;
}

function matRows(t: string): number {
  const m = t.match(/mat(\d)(?:x(\d))?/);
  if (!m) return 4;
  return parseInt(m[2] ?? m[1], 10);
}

// Fonctions intégrées qui n'existent qu'en version flottante.
export const FLOAT_ONLY_BUILTINS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 'floor', 'ceil', 'fract', 'mod',
  'mix', 'step', 'smoothstep', 'radians', 'degrees', 'trunc', 'round', 'roundEven', 'length',
  'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract', 'faceforward', 'fwidth', 'dFdx', 'dFdy',
  'modf', 'fma',
]);
// Fonctions avec surcharges entières : on convertit seulement si un autre argument est flottant.
export const MIXED_BUILTINS = new Set(['min', 'max', 'clamp', 'abs', 'sign']);

/** Type de retour d'une fonction intégrée, à partir des types d'arguments. */
export function builtinReturn(name: string, args: (string | null)[]): string | null | undefined {
  const firstFloaty = args.find((a) => a && (isFloatKind(a) || isIntKind(a))) ?? args[0] ?? null;
  switch (name) {
    case 'length': case 'distance': case 'dot': case 'determinant':
      return 'float';
    case 'cross':
      return 'vec3';
    case 'texture': case 'texture2D': case 'textureLod': case 'texture2DLod': case 'textureCube':
    case 'textureCubeLod': case 'texelFetch': case 'textureGrad': case 'textureProj': case 'texture2DProj':
    case 'textureProjLod': case 'textureOffset': case 'texelFetchOffset': case 'textureLodOffset':
    case 'texture2DLodEXT': case 'texture2DGradEXT':
      return 'vec4';
    case 'textureSize':
      return 'ivec2';
    case 'any': case 'all':
      return 'bool';
    case 'not':
      return args[0];
    case 'lessThan': case 'lessThanEqual': case 'greaterThan': case 'greaterThanEqual': case 'equal': case 'notEqual':
      return args[0] ? vecOf('bool', vecSize(args[0])) : null;
    case 'floatBitsToInt': return args[0] ? vecOf('int', vecSize(args[0])) : 'int';
    case 'floatBitsToUint': return args[0] ? vecOf('uint', vecSize(args[0])) : 'uint';
    case 'intBitsToFloat': case 'uintBitsToFloat': return args[0] ? vecOf('float', vecSize(args[0])) : 'float';
    case 'transpose': case 'inverse':
      return args[0];
    case 'packHalf2x16': case 'packUnorm2x16': case 'packSnorm2x16': case 'packUnorm4x8': case 'packSnorm4x8':
      return 'uint';
    case 'unpackHalf2x16': case 'unpackUnorm2x16': case 'unpackSnorm2x16':
      return 'vec2';
    case 'unpackUnorm4x8': case 'unpackSnorm4x8':
      return 'vec4';
    case 'isnan': case 'isinf':
      return args[0] ? vecOf('bool', vecSize(args[0])) : 'bool';
  }
  if (FLOAT_ONLY_BUILTINS.has(name)) {
    const f = args.find((a) => a && isFloatKind(a));
    if (f) return f;
    if (firstFloaty) return vecOf('float', vecSize(firstFloaty));
    return 'float';
  }
  if (MIXED_BUILTINS.has(name)) {
    const f = args.find((a) => a && isVector(a)) ?? args.find((a) => a === 'float') ?? args[0];
    if (args.some((a) => isFloatKind(a)) && f) return vecOf('float', vecSize(f));
    return f ?? null;
  }
  return undefined; // inconnue
}

export const CONSTRUCTOR_TYPES = new Set([
  'float', 'int', 'uint', 'bool', ...FLOAT_VEC, ...INT_VEC, ...UINT_VEC, ...BOOL_VEC, ...MATS,
]);
