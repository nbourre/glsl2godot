// Connaissances sur les différentes sources de GLSL : noms d'uniforms
// « magiques », attributs, matrices et varyings courants.

export type Dialect = 'shadertoy' | 'glslsandbox' | 'bookofshaders' | 'isf' | 'threejs' | 'generic';

export const DIALECT_LABELS: Record<Dialect, string> = {
  shadertoy: 'Shadertoy',
  glslsandbox: 'GLSL Sandbox',
  bookofshaders: 'The Book of Shaders / glslCanvas',
  isf: 'ISF (Interactive Shader Format)',
  threejs: 'three.js (ShaderMaterial)',
  generic: 'GLSL générique (WebGL / OpenGL)',
};

export const DIALECT_LABELS_EN: Record<Dialect, string> = {
  shadertoy: 'Shadertoy',
  glslsandbox: 'GLSL Sandbox',
  bookofshaders: 'The Book of Shaders / glslCanvas',
  isf: 'ISF (Interactive Shader Format)',
  threejs: 'three.js (ShaderMaterial)',
  generic: 'Generic GLSL (WebGL / OpenGL)',
};

export type Role = 'time' | 'resolution' | 'mouse' | 'frame' | 'timedelta' | 'date' | 'channel' | 'channelres' | 'channeltime' | 'samplerate';

export interface RoleDef {
  role: Role;
  type: string; // type par défaut si le nom n'est pas déclaré
  mouseFormat?: 'shadertoy' | 'normalized' | 'pixels';
}

/** Uniforms reconnus par leur nom. */
export const ROLE_NAMES: Record<string, RoleDef> = {
  iTime: { role: 'time', type: 'float' },
  iGlobalTime: { role: 'time', type: 'float' },
  time: { role: 'time', type: 'float' },
  u_time: { role: 'time', type: 'float' },
  uTime: { role: 'time', type: 'float' },
  u_Time: { role: 'time', type: 'float' },
  TIME: { role: 'time', type: 'float' },

  iResolution: { role: 'resolution', type: 'vec3' },
  resolution: { role: 'resolution', type: 'vec2' },
  u_resolution: { role: 'resolution', type: 'vec2' },
  uResolution: { role: 'resolution', type: 'vec2' },
  u_Resolution: { role: 'resolution', type: 'vec2' },
  RENDERSIZE: { role: 'resolution', type: 'vec2' },

  iMouse: { role: 'mouse', type: 'vec4', mouseFormat: 'shadertoy' },
  mouse: { role: 'mouse', type: 'vec2', mouseFormat: 'normalized' },
  u_mouse: { role: 'mouse', type: 'vec2', mouseFormat: 'pixels' },
  uMouse: { role: 'mouse', type: 'vec2', mouseFormat: 'pixels' },

  iFrame: { role: 'frame', type: 'int' },
  FRAMEINDEX: { role: 'frame', type: 'int' },
  u_frame: { role: 'frame', type: 'int' },

  iTimeDelta: { role: 'timedelta', type: 'float' },
  TIMEDELTA: { role: 'timedelta', type: 'float' },
  u_delta: { role: 'timedelta', type: 'float' },

  iDate: { role: 'date', type: 'vec4' },
  DATE: { role: 'date', type: 'vec4' },
  u_date: { role: 'date', type: 'vec4' },

  iChannel0: { role: 'channel', type: 'sampler2D' },
  iChannel1: { role: 'channel', type: 'sampler2D' },
  iChannel2: { role: 'channel', type: 'sampler2D' },
  iChannel3: { role: 'channel', type: 'sampler2D' },
  iChannelResolution: { role: 'channelres', type: 'vec3[4]' },
  iChannelTime: { role: 'channeltime', type: 'float[4]' },
  iSampleRate: { role: 'samplerate', type: 'float' },
};

const norm = (s: string) =>
  s
    .replace(/^(a_|attr_|in_|u_|v_)/, '')
    .replace(/^(a|in|u|attr|vertex)(?=[A-Z])/, '')
    .toLowerCase();

export interface AttrMap { expr: string; godotType: string }

/** Attribut de sommet -> builtin Godot (spatial). */
export function attributeFor(name: string): AttrMap | null {
  const n = norm(name);
  if (['position', 'pos', 'vertex', 'vertexposition', 'vert', 'p', 'xyz'].includes(n)) return { expr: 'VERTEX', godotType: 'vec3' };
  if (['normal', 'norm', 'n', 'vertexnormal'].includes(n)) return { expr: 'NORMAL', godotType: 'vec3' };
  if (['uv', 'uv0', 'texcoord', 'texcoord0', 'texcoords', 'tex', 'texc', 'st', 'coord', 'texturecoord', 'texturecoordinate', 'vertextexcoord'].includes(n))
    return { expr: 'UV', godotType: 'vec2' };
  if (['uv1', 'uv2', 'texcoord1', 'texcoord2', 'lightmapuv'].includes(n)) return { expr: 'UV2', godotType: 'vec2' };
  if (['color', 'colour', 'col', 'vertexcolor', 'rgba', 'rgb'].includes(n)) return { expr: 'COLOR', godotType: 'vec4' };
  if (['tangent', 'tan'].includes(n)) return { expr: 'TANGENT', godotType: 'vec3' };
  return null;
}

/** Matrices de transformation -> builtins Godot. */
export function matrixFor(name: string, type: string): string | null {
  const n = norm(name).replace(/matrix$|mat$|mtx$/, '');
  if (type === 'mat4') {
    if (['projection', 'proj', 'p', 'perspective', 'persp'].includes(n)) return 'PROJECTION_MATRIX';
    if (['view', 'v', 'camera', 'cam', 'viewing'].includes(n)) return 'VIEW_MATRIX';
    if (['model', 'm', 'world', 'object', 'modeltoworld', 'objecttoworld'].includes(n)) return 'MODEL_MATRIX';
    if (['modelview', 'mv', 'worldview'].includes(n)) return 'MODELVIEW_MATRIX';
    if (['modelviewprojection', 'mvp', 'pvm', 'projmodelview', 'projectionmodelview', 'worldviewprojection', 'wvp'].includes(n))
      return '(PROJECTION_MATRIX * MODELVIEW_MATRIX)';
    if (['viewprojection', 'vp', 'projview', 'projectionview'].includes(n)) return '(PROJECTION_MATRIX * VIEW_MATRIX)';
    if (['inverseview', 'invview', 'viewinverse'].includes(n)) return 'INV_VIEW_MATRIX';
    if (['inverseprojection', 'invprojection', 'projectioninverse'].includes(n)) return 'INV_PROJECTION_MATRIX';
  }
  if (type === 'mat3' && ['normal', 'n', 'normalmodelview'].includes(n)) return 'MODELVIEW_NORMAL_MATRIX';
  return null;
}

export const THREE_VERTEX_BUILTINS: Record<string, { expr: string; type: string }> = {
  position: { expr: 'VERTEX', type: 'vec3' },
  normal: { expr: 'NORMAL', type: 'vec3' },
  uv: { expr: 'UV', type: 'vec2' },
  uv1: { expr: 'UV2', type: 'vec2' },
  uv2: { expr: 'UV2', type: 'vec2' },
  color: { expr: 'COLOR.rgb', type: 'vec3' },
  tangent: { expr: 'vec4(TANGENT, 1.0)', type: 'vec4' },
  modelMatrix: { expr: 'MODEL_MATRIX', type: 'mat4' },
  viewMatrix: { expr: 'VIEW_MATRIX', type: 'mat4' },
  modelViewMatrix: { expr: 'MODELVIEW_MATRIX', type: 'mat4' },
  projectionMatrix: { expr: 'PROJECTION_MATRIX', type: 'mat4' },
  normalMatrix: { expr: 'MODELVIEW_NORMAL_MATRIX', type: 'mat3' },
  cameraPosition: { expr: 'CAMERA_POSITION_WORLD', type: 'vec3' },
};

export const THREE_FRAGMENT_BUILTINS: Record<string, { expr: string; type: string }> = {
  viewMatrix: { expr: 'VIEW_MATRIX', type: 'mat4' },
  projectionMatrix: { expr: 'PROJECTION_MATRIX', type: 'mat4' },
  modelMatrix: { expr: 'MODEL_MATRIX', type: 'mat4' },
  cameraPosition: { expr: 'CAMERA_POSITION_WORLD', type: 'vec3' },
  isOrthographic: { expr: '(PROJECTION_MATRIX[3][3] == 1.0)', type: 'bool' },
};

/** Varyings courants, utilisés quand aucun vertex shader n'est fourni. */
export function varyingFallback(name: string, canvas: boolean): { expr: string; type: string } | null {
  const n = name.replace(/^(v_|v|f_|frag|out_|io_)(?=[A-Za-z])/, '').toLowerCase();
  if (['uv', 'uv0', 'texcoord', 'texcoord0', 'texcoords', 'st', 'coord', 'tex', 'texc', 'texturecoord', 'surfaceposition'].includes(n))
    return { expr: canvas ? 'vec2(UV.x, 1.0 - UV.y)' : 'UV', type: 'vec2' };
  if (!canvas && ['normal', 'norm', 'viewnormal'].includes(n)) return { expr: 'NORMAL', type: 'vec3' };
  if (!canvas && ['position', 'pos', 'viewposition', 'mvposition'].includes(n)) return { expr: 'VERTEX', type: 'vec3' };
  if (['color', 'colour', 'col'].includes(n)) return { expr: 'COLOR', type: 'vec4' };
  return null;
}

// Identifiants réservés par Godot qu'on doit renommer s'ils sont déclarés par l'utilisateur.
export const GODOT_RESERVED = new Set([
  'shader_type', 'render_mode', 'varying', 'instance', 'global', 'group_uniforms', 'stencil_mode',
  'source_color', 'hint_range', 'hint_enum', 'hint_default_white', 'hint_default_black', 'hint_default_transparent',
  'hint_normal', 'hint_anisotropy', 'hint_roughness_r', 'hint_roughness_g', 'hint_roughness_b', 'hint_roughness_a',
  'hint_roughness_normal', 'hint_roughness_gray', 'hint_screen_texture', 'hint_depth_texture', 'hint_normal_roughness_texture',
  'filter_nearest', 'filter_linear', 'filter_nearest_mipmap', 'filter_linear_mipmap',
  'filter_nearest_mipmap_anisotropic', 'filter_linear_mipmap_anisotropic', 'repeat_enable', 'repeat_disable',
  'instance_index', 'flat', 'smooth',
  'VERTEX', 'NORMAL', 'TANGENT', 'BINORMAL', 'UV', 'UV2', 'COLOR', 'POINT_SIZE', 'POSITION', 'TIME', 'PI', 'TAU', 'E',
  'INSTANCE_ID', 'INSTANCE_CUSTOM', 'VERTEX_ID', 'ROUGHNESS', 'MODEL_MATRIX', 'VIEW_MATRIX', 'PROJECTION_MATRIX',
  'INV_VIEW_MATRIX', 'INV_PROJECTION_MATRIX', 'MODELVIEW_MATRIX', 'MODELVIEW_NORMAL_MATRIX', 'MODEL_NORMAL_MATRIX',
  'VIEWPORT_SIZE', 'FRAGCOORD', 'FRONT_FACING', 'SCREEN_UV', 'POINT_COORD', 'ALBEDO', 'ALPHA', 'ALPHA_SCISSOR_THRESHOLD',
  'ALPHA_HASH_SCALE', 'METALLIC', 'SPECULAR', 'EMISSION', 'AO', 'AO_LIGHT_AFFECT', 'NORMAL_MAP', 'NORMAL_MAP_DEPTH',
  'RIM', 'RIM_TINT', 'CLEARCOAT', 'CLEARCOAT_ROUGHNESS', 'ANISOTROPY', 'ANISOTROPY_FLOW', 'SSS_STRENGTH',
  'SSS_TRANSMITTANCE_COLOR', 'SSS_TRANSMITTANCE_DEPTH', 'SSS_TRANSMITTANCE_BOOST', 'BACKLIGHT', 'DEPTH', 'LIGHT',
  'LIGHT_COLOR', 'LIGHT_POSITION', 'LIGHT_DIRECTION', 'LIGHT_ENERGY', 'LIGHT_VERTEX', 'SHADOW_VERTEX', 'SHADOW_MODULATE',
  'ATTENUATION', 'DIFFUSE_LIGHT', 'SPECULAR_LIGHT', 'CAMERA_POSITION_WORLD', 'CAMERA_DIRECTION_WORLD',
  'NODE_POSITION_WORLD', 'NODE_POSITION_VIEW', 'TEXTURE', 'TEXTURE_PIXEL_SIZE', 'SCREEN_PIXEL_SIZE', 'CANVAS_MATRIX',
  'SCREEN_MATRIX', 'AT_LIGHT_PASS', 'SPECULAR_SHININESS', 'SPECULAR_SHININESS_TEXTURE', 'NORMAL_TEXTURE', 'CUSTOM0',
  'CUSTOM1', 'CUSTOM2', 'CUSTOM3', 'OUTPUT_IS_SRGB', 'EYE_OFFSET', 'VIEW_INDEX', 'VIEW_MONO_LEFT', 'VIEW_RIGHT',
  'CLIP_SPACE_FAR', 'Z_CLIP_SCALE', 'IN_SHADOW_PASS', 'PREMUL_ALPHA_FACTOR', 'LIGHT_IS_DIRECTIONAL', 'LIGHT_ENERGY',
  'SCREEN_TEXTURE', 'DEPTH_TEXTURE', 'NORMAL_ROUGHNESS_TEXTURE', 'LIGHT_PASS',
]);

export const GODOT_CONSTANTS: Record<string, number> = { PI: Math.PI, TAU: Math.PI * 2, E: Math.E };

/** Fonctions GLSL renommées dans Godot. */
export const FUNCTION_RENAMES: Record<string, string> = {
  texture2D: 'texture',
  texture2DLod: 'textureLod',
  texture2DLodEXT: 'textureLod',
  texture2DGradEXT: 'textureGrad',
  texture2DProj: 'textureProj',
  texture2DProjLod: 'textureProjLod',
  textureCube: 'texture',
  textureCubeLod: 'textureLod',
  textureCubeLodEXT: 'textureLod',
  texture3D: 'texture',
  texture3DLod: 'textureLod',
  shadow2D: 'texture',
};
