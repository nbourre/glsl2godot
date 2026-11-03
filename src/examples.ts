import shadertoyBasic from '../tests/corpus/shadertoy_basic.glsl?raw';
import shadertoyScene from '../tests/corpus/shadertoy_scene.glsl?raw';
import glslsandbox from '../tests/corpus/glslsandbox.glsl?raw';
import bookofshaders from '../tests/corpus/bookofshaders.glsl?raw';
import isf from '../tests/corpus/isf.glsl?raw';
import threeFrag from '../tests/corpus/threejs.glsl?raw';
import threeVert from '../tests/corpus/threejs.vert?raw';
import glFrag from '../tests/corpus/opengl330.glsl?raw';
import glVert from '../tests/corpus/opengl330.vert?raw';

export interface Example {
  id: string;
  label: string;
  fragment: string;
  vertex?: string;
}

export const EXAMPLES: Example[] = [
  { id: 'scene', label: 'Shadertoy (raymarching)', fragment: shadertoyScene },
  { id: 'shadertoy', label: 'Shadertoy', fragment: shadertoyBasic },
  { id: 'sandbox', label: 'GLSL Sandbox', fragment: glslsandbox },
  { id: 'bos', label: 'Book of Shaders', fragment: bookofshaders },
  { id: 'isf', label: 'ISF', fragment: isf },
  { id: 'three', label: 'three.js', fragment: threeFrag, vertex: threeVert },
  { id: 'opengl', label: 'OpenGL 3.3', fragment: glFrag, vertex: glVert },
];
