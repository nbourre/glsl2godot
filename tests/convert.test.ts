import { describe, expect, it } from 'vitest';
import { convert } from '../src/converter';

const st = (body: string) => convert({ fragment: body });

describe('détection du dialecte', () => {
  it('Shadertoy', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ c = vec4(f / iResolution.xy, sin(iTime), 1.0); }');
    expect(r.ok).toBe(true);
    expect(r.dialect).toBe('shadertoy');
    expect(r.target).toBe('canvas_item');
    expect(r.shader).toContain('shader_type canvas_item;');
    expect(r.shader).toContain('sin(TIME)');
    expect(r.shader).toContain('uniform vec3 iResolution');
    expect(r.shader).toMatch(/mainImage\(_fragColor, vec2\(UV\.x, 1\.0 - UV\.y\) \* iResolution\.xy\)/);
    expect(r.script).toContain('set_shader_parameter("iResolution"');
  });

  it('GLSL Sandbox', () => {
    const r = st('precision mediump float; uniform float time; uniform vec2 resolution; void main(){ gl_FragColor = vec4(gl_FragCoord.xy / resolution, sin(time), 1.0); }');
    expect(r.dialect).toBe('glslsandbox');
    expect(r.shader).not.toContain('precision');
    expect(r.shader).toContain('void _glsl_main(in vec4 _gl_FragCoord, inout vec4 _fragColor)');
  });

  it('three.js avec vertex shader -> spatial', () => {
    const r = convert({
      vertex: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragment: 'varying vec2 vUv; uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor * vUv.x, 1.0); }',
    });
    expect(r.dialect).toBe('threejs');
    expect(r.target).toBe('spatial');
    expect(r.shader).toContain('varying vec2 vUv;');
    expect(r.shader).toContain('POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);');
    expect(r.shader).toContain('vUv = UV;');
    expect(r.shader).toContain('uniform vec3 uColor : source_color;');
  });
});

describe('règles de Godot', () => {
  it('convertit les entiers en flottants dans les opérations', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ float x = 1; x *= 2; vec2 p = f / 2; c = vec4(x > 0 ? 1 : 0); }');
    expect(r.shader).toContain('float x = 1.0;');
    expect(r.shader).toContain('x *= 2.0;');
    expect(r.shader).toContain('f / 2.0');
    expect(r.shader).toContain('x > 0.0');
  });

  it('préserve la division entière', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ float x = 1 / 2; c = vec4(x); }');
    expect(r.shader).toContain('float x = float(1 / 2);');
  });

  it('regroupe les constructeurs de matrice en colonnes', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ mat2 m = mat2(1., 0., 0., 1.); c = vec4(m[0], 0, 1); }');
    expect(r.shader).toContain('mat2(vec2(1., 0.), vec2(0., 1.))');
  });

  it('tronque explicitement vec3(vec4)', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ vec4 a = vec4(1.0); vec3 b = vec3(a); c = vec4(b, 1.0); }');
    expect(r.shader).toContain('vec3 b = a.xyz;');
  });

  it('réordonne les fonctions et retire les prototypes', () => {
    const r = st('float b(); float a(){ return b(); } float b(){ return 1.0; } void mainImage(out vec4 c, in vec2 f){ c = vec4(a()); }');
    expect(r.shader.indexOf('float b()')).toBeLessThan(r.shader.indexOf('float a()'));
    expect(r.shader).not.toMatch(/float b\(\);/);
  });

  it('passe les globales modifiables en paramètres inout', () => {
    const r = st('float g = 0.0; void inc(){ g += 1.0; } void mainImage(out vec4 c, in vec2 f){ inc(); c = vec4(g); }');
    expect(r.shader).toContain('void inc(inout float g)');
    expect(r.shader).toContain('inc(g);');
    expect(r.shader).toMatch(/float g = 0\.0;\s*inc\(g\);/);
  });

  it('rend constantes les globales jamais modifiées', () => {
    const r = st('vec3 tint = vec3(1.0, 0.5, 0.0); void mainImage(out vec4 c, in vec2 f){ c = vec4(tint, 1.0); }');
    expect(r.shader).toContain('const vec3 tint = vec3(1.0, 0.5, 0.0);');
  });

  it('renomme les identifiants réservés et les masquages', () => {
    const r = st('uniform float speed; float f(float instance){ float speed = 2.0; return instance * speed; } void mainImage(out vec4 c, in vec2 f2){ c = vec4(f(1.0)); }');
    expect(r.shader).toContain('float f(float instance_)');
    expect(r.shader).toContain('float speed_l = 2.0;');
  });

  it('retire PI si Godot le fournit', () => {
    const r = st('const float PI = 3.14159265; void mainImage(out vec4 c, in vec2 f){ c = vec4(sin(PI)); }');
    expect(r.shader).not.toContain('const float PI');
  });

  it('ajoute un break au dernier case d’un switch', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ int i = int(f.x); switch(i){ case 0: c = vec4(1.0); break; default: c = vec4(0.0); } }');
    expect(r.shader).toMatch(/default: c = vec4\(0\.0\);\s*break;/);
  });

  it('sépare les instructions avec virgule', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ float a, b; a = 1.0, b = 2.0; c = vec4(a + b); }');
    expect(r.shader).toContain('a = 1.0; b = 2.0;');
  });

  it('signale la récursion', () => {
    const r = st('float f(float n){ return n < 1.0 ? 0.0 : f(n - 1.0); } void mainImage(out vec4 c, in vec2 p){ c = vec4(f(3.0)); }');
    expect(r.messages.some((m) => m.text.includes('récursive'))).toBe(true);
  });
});

describe('ISF', () => {
  it('crée les uniforms depuis INPUTS', () => {
    const r = st('/*{ "INPUTS": [ { "NAME": "amount", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 } ] }*/\nvoid main(){ gl_FragColor = vec4(isf_FragNormCoord, amount, 1.0); }');
    expect(r.dialect).toBe('isf');
    expect(r.shader).toContain('uniform float amount : hint_range(0.0, 1.0) = 0.5;');
  });
});

describe('erreurs', () => {
  it('rapporte une erreur de syntaxe avec la ligne', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){\n  c = vec4(1.0)\n}');
    expect(r.ok).toBe(false);
    expect(r.messages[0].text).toMatch(/ligne 3/);
  });
});

describe('préprocesseur', () => {
  it('ignore les commentaires à la fin des #define', () => {
    const r = convert({
      fragment: '#define K 0.38 // un commentaire\n#define M(a) (a * 2.0) /* bloc */\nvoid mainImage(out vec4 c, in vec2 f){ float x = f.x * K; c = vec4(M(x)); }',
    });
    expect(r.ok).toBe(true);
    expect(r.shader).toContain('f.x * 0.38;');
  });

  it('donne la ligne de l’erreur dans le code collé, malgré les #define retirés', () => {
    const src = ['#define A 1.0', '#define B 2.0', '', 'void mainImage(out vec4 c, in vec2 f){', '  float x = A;', '  float y = B', '  c = vec4(x + y);', '}'].join('\n');
    const r = convert({ fragment: src, language: 'fr' });
    expect(r.ok).toBe(false);
    expect(r.messages[0].text).toMatch(/ligne 7/);
  });
});

describe('opérateurs entiers sur vecteurs', () => {
  it('convertit le scalaire en vecteur pour & | ^ et les décalages', () => {
    const r = st('void mainImage(out vec4 c, in vec2 f){ ivec2 px = ivec2(f); ivec2 a = px & 255; ivec2 b = 3 << px; c = vec4(vec2(a + b), 0.0, 1.0); }');
    expect(r.shader).toContain('px & ivec2(255)');
    expect(r.shader).toContain('ivec2(3) << px');
  });
});
