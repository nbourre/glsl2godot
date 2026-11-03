// Aperçu WebGL du shader d'origine (fragment seulement) : permet de vérifier
// que le code collé fonctionne avant de le porter dans Godot.

const VERT1 = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const VERT3 = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

const SHADERTOY_HEADER = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform float iSampleRate;
uniform vec3 iChannelResolution[4];
uniform float iChannelTime[4];
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
out vec4 _preview_out;
`;

export class Preview {
  private gl: WebGL2RenderingContext | null;
  private prog: WebGLProgram | null = null;
  private start = performance.now();
  private last = performance.now();
  private frame = 0;
  private mouse = [0, 0, 0, 0];
  private raf = 0;
  private visible = true;
  private defaults: UniformDefault[] = [];
  private locs = new Map<string, WebGLUniformLocation | null>();
  onStatus: (ok: boolean, msg: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!this.gl) return;
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // texture noire pour les iChannel
    const tex = gl.createTexture();
    for (let i = 0; i < 4; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    // Texture de test (damier coloré) pour les iChannel et les sampler2D
    const N = 256;
    const px = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        const check = ((x >> 5) + (y >> 5)) & 1 ? 1 : 0.72;
        px[i] = (40 + (x / N) * 200) * check;
        px[i + 1] = (60 + (y / N) * 160) * check;
        px[i + 2] = (200 - (x / N) * 120) * check;
        px[i + 3] = 255;
      }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * canvas.width, (1 - (e.clientY - r.top) / r.height) * canvas.height];
    };
    canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      this.mouse = [x, y, x, y];
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      if (this.mouse[2] > 0) {
        this.mouse[0] = x;
        this.mouse[1] = y;
      }
      (this as any).hover = [x, y];
    });
    canvas.addEventListener('pointerup', () => {
      this.mouse[2] = -Math.abs(this.mouse[2]);
      this.mouse[3] = -Math.abs(this.mouse[3]);
    });
    new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
    }).observe(canvas);
  }

  get supported() {
    return !!this.gl;
  }

  /** Compile le fragment shader selon sa convention probable. */
  load(source: string, language: 'en' | 'fr' = 'en') {
    const gl = this.gl;
    const fr = language === 'fr';
    if (!gl) return this.onStatus(false, fr ? 'WebGL 2 indisponible dans ce navigateur.' : 'WebGL 2 is not available in this browser.');
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = null;
    this.locs.clear();
    const built = source.trim() ? buildPreview(source) : null;
    if (!built) {
      cancelAnimationFrame(this.raf);
      return this.onStatus(false, fr ? 'Aperçu non disponible pour ce type de shader.' : 'Preview is not available for this shader type.');
    }
    if (typeof built === 'string') {
      cancelAnimationFrame(this.raf);
      return this.onStatus(false, fr ? `Aperçu non disponible : ${built}` : `Preview not available: ${built}`);
    }
    const compile = (type: number, src: string, offset: number) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) ?? '';
        gl.deleteShader(sh);
        throw new Error(formatLog(log, offset, fr));
      }
      return sh;
    };
    try {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, built.vs, 0));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, built.fs, built.offset));
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
      this.prog = prog;
      this.defaults = built.defaults;
      this.start = performance.now();
      this.frame = 0;
      const sim = built.simulated?.length ?? 0;
      this.onStatus(
        true,
        sim
          ? fr
            ? 'Fragment shader seul, sur une surface plane : les varyings viennent des UV, pas du vertex shader.'
            : 'Fragment shader only, on a flat surface: varyings come from UVs, not from the vertex shader.'
          : fr ? 'Shader d’origine, rendu par ton navigateur.' : 'Original shader, rendered by your browser.',
      );
      cancelAnimationFrame(this.raf);
      this.loop();
    } catch (e: any) {
      cancelAnimationFrame(this.raf);
      this.onStatus(false, (fr ? 'Le navigateur ne compile pas ce shader : ' : 'Your browser could not compile this shader: ') + String(e.message ?? e));
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const gl = this.gl;
    if (!gl || !this.prog || !this.visible) return;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr * 0.75);
    const h = Math.round(c.clientHeight * dpr * 0.75);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    const now = performance.now();
    const t = (now - this.start) / 1000;
    const dt = (now - this.last) / 1000;
    this.last = now;
    const u = (n: string) => {
      if (!this.locs.has(n)) this.locs.set(n, gl.getUniformLocation(this.prog!, n));
      return this.locs.get(n)!;
    };
    for (const d of this.defaults) {
      const l = u(d.name);
      if (!l) continue;
      const v = d.value;
      if (d.type === 'int' || d.type === 'bool') gl.uniform1i(l, Math.round(v[0]));
      else if (d.type.startsWith('ivec')) (gl as any)[`uniform${v.length}iv`](l, v.map(Math.round));
      else (gl as any)[`uniform${v.length}fv`](l, v);
    }
    const hover = (this as any).hover ?? [0, 0];
    const set1f = (names: string[], v: number) => names.forEach((n) => { const l = u(n); if (l) gl.uniform1f(l, v); });
    const set2f = (names: string[], a: number, b: number) => names.forEach((n) => { const l = u(n); if (l) gl.uniform2f(l, a, b); });
    set1f(['iTime', 'time', 'u_time', 'uTime', 'iGlobalTime', 'TIME'], t);
    set1f(['iTimeDelta', 'TIMEDELTA'], dt);
    set2f(['resolution', 'u_resolution', 'uResolution', 'RENDERSIZE'], w, h);
    set2f(['u_mouse', 'uMouse'], hover[0], hover[1]);
    set2f(['mouse'], hover[0] / w, hover[1] / h);
    const r3 = u('iResolution');
    if (r3) gl.uniform3f(r3, w, h, 1);
    const m4 = u('iMouse');
    if (m4) gl.uniform4f(m4, this.mouse[0], this.mouse[1], this.mouse[2], this.mouse[3]);
    const fl = u('iFrame') ?? u('FRAMEINDEX');
    if (fl) gl.uniform1i(fl, this.frame);
    this.frame++;
    const d = new Date();
    const dl = u('iDate') ?? u('DATE');
    if (dl) gl.uniform4f(dl, d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
    for (let i = 0; i < 4; i++) {
      const l = u('iChannel' + i);
      if (l) gl.uniform1i(l, i);
    }
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

/* ------------------------------------------------------------------ */
/* Préparation du code pour l'aperçu                                   */
/* ------------------------------------------------------------------ */

interface UniformDefault {
  name: string;
  type: string;
  value: number[];
}

interface Built {
  vs: string;
  fs: string;
  offset: number; // lignes ajoutées avant le code de l'utilisateur
  defaults: UniformDefault[];
  simulated?: string[]; // varyings simulés faute de vertex shader
}

const blankLines = (s: string) => s.replace(/[^\n]/g, '');
const countLines = (s: string) => (s.match(/\n/g) ?? []).length;

/** Remplace une ligne par une ligne vide pour garder la numérotation. */
function takeLines(src: string, re: RegExp): { src: string; lines: string[] } {
  const lines: string[] = [];
  const out = src.replace(re, (m) => {
    lines.push(m.trim());
    return blankLines(m);
  });
  return { src: out, lines };
}

/** Retire `= valeur` des uniforms (interdit en GLSL ES) et garde la valeur. */
function stripUniformInits(src: string, defaults: UniformDefault[]): string {
  return src.replace(
    /^([ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(float|int|bool|vec[234]|ivec[234])\s+(\w+))\s*=\s*([^;]+);/gm,
    (_m, decl: string, type: string, name: string, expr: string) => {
      const nums = (expr.match(/-?\d*\.?\d+(?:e[+-]?\d+)?|true|false/gi) ?? []).map((n) => (n === 'true' ? 1 : n === 'false' ? 0 : parseFloat(n)));
      const size = /\d$/.test(type) ? parseInt(type.slice(-1), 10) : 1;
      if (nums.length === 1 && size > 1) while (nums.length < size) nums.push(nums[0]);
      if (nums.length >= size) defaults.push({ name, type, value: nums.slice(0, size) });
      return decl + ';';
    },
  );
}

// Couleurs distinctes pour les uniforms de couleur que l'application fournirait normalement
const PREVIEW_PALETTE = [
  [1.0, 0.45, 0.2],
  [0.2, 0.55, 1.0],
  [0.35, 0.9, 0.5],
  [0.95, 0.8, 0.3],
  [0.85, 0.35, 0.8],
];

/** Uniforms de couleur sans valeur : une couleur de la palette plutôt que du noir. */
function colorDefaults(src: string, defaults: UniformDefault[]) {
  let k = 0;
  for (const m of src.matchAll(/^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(vec[34])\s+(\w*(?:colou?r|tint)\w*)\s*;/gim)) {
    if (defaults.some((d) => d.name === m[2])) continue;
    const c = PREVIEW_PALETTE[k++ % PREVIEW_PALETTE.length];
    defaults.push({ name: m[2], type: m[1], value: m[1] === 'vec3' ? c : [...c, 1] });
  }
}

/** Vertex shader qui fournit les varyings attendus par le fragment shader. */
function vertexFor(varyings: [string, string][], es3: boolean): string {
  const fill = (type: string, name: string) =>
    type === 'vec3' && /norm/i.test(name)
      ? 'normalize(vec3((uv - 0.5) * 1.5, 1.0))'
      : type === 'float' ? 'uv.x' : type === 'vec2' ? 'uv' : type === 'vec3' ? 'vec3(uv, 0.0)' : 'vec4(uv, 0.0, 1.0)';
  const head = es3 ? '#version 300 es\nin vec2 p;\n' : 'attribute vec2 p;\n';
  const decl = varyings.map(([t, n]) => `${es3 ? 'out' : 'varying'} ${t} ${n};`).join('\n');
  const body = varyings.map(([t, n]) => `${n} = ${fill(t, n)};`).join('\n');
  return `${head}${decl}\nvoid main(){ vec2 uv = p * 0.5 + 0.5;\n${body}\ngl_Position = vec4(p, 0.0, 1.0); }`;
}

const ES1_VARYING = /^\s*varying\s+(?:(?:lowp|mediump|highp)\s+)?(float|vec[234])\s+(\w+)\s*;/gm;
const ES3_IN = /^\s*(?:(?:flat|smooth|noperspective|centroid)\s+)*in\s+(?:(?:lowp|mediump|highp)\s+)?(float|vec[234])\s+(\w+)\s*;/gm;

function buildPreview(source: string): Built | string | null {
  const defaults: UniformDefault[] = [];
  let src = source.replace(/\r\n?/g, '\n');

  if (/^\s*#include\s*[<"]/m.test(src)) return null;

  /* ---- ISF ---- */
  const isf = src.match(/^\s*\/\*\s*(\{[\s\S]*?\})\s*\*\//);
  if (isf) {
    let meta: any;
    try {
      meta = JSON.parse(isf[1]);
    } catch {
      return 'JSON ISF invalide / invalid ISF JSON';
    }
    if (Array.isArray(meta.PASSES) && meta.PASSES.length > 1) return 'ISF multipass';
    src = blankLines(isf[0]) + src.slice(isf[0].length);
    const ext = takeLines(src, /^[ \t]*#extension[^\n]*/gm);
    src = ext.src.replace(/^[ \t]*#version[^\n]*/m, (m) => blankLines(m));
    const inputs: string[] = [];
    for (const inp of meta.INPUTS ?? []) {
      const n = inp.NAME;
      if (!n) continue;
      const d = inp.DEFAULT;
      switch (inp.TYPE) {
        case 'float':
          inputs.push(`uniform float ${n};`);
          if (d !== undefined) defaults.push({ name: n, type: 'float', value: [Number(d)] });
          break;
        case 'long':
          inputs.push(`uniform int ${n};`);
          if (d !== undefined) defaults.push({ name: n, type: 'int', value: [Number(d)] });
          break;
        case 'bool':
        case 'event':
          inputs.push(`uniform bool ${n};`);
          if (d !== undefined) defaults.push({ name: n, type: 'bool', value: [d ? 1 : 0] });
          break;
        case 'color':
          inputs.push(`uniform vec4 ${n};`);
          defaults.push({ name: n, type: 'vec4', value: Array.isArray(d) ? d.slice(0, 4).map(Number) : [1, 1, 1, 1] });
          break;
        case 'point2D':
          inputs.push(`uniform vec2 ${n};`);
          defaults.push({ name: n, type: 'vec2', value: Array.isArray(d) ? d.slice(0, 2).map(Number) : [0.5, 0.5] });
          break;
        case 'image':
        case 'audio':
        case 'audioFFT':
          inputs.push(`uniform sampler2D ${n};`);
          break;
      }
    }
    const header =
      [
        ...ext.lines,
        'precision highp float;',
        'uniform float TIME;',
        'uniform float TIMEDELTA;',
        'uniform vec2 RENDERSIZE;',
        'uniform int FRAMEINDEX;',
        'uniform vec4 DATE;',
        'varying vec2 isf_FragNormCoord;',
        '#define IMG_NORM_PIXEL(i, c) texture2D(i, c)',
        '#define IMG_PIXEL(i, c) texture2D(i, (c) / RENDERSIZE)',
        '#define IMG_THIS_NORM_PIXEL(i) texture2D(i, isf_FragNormCoord)',
        '#define IMG_THIS_PIXEL(i) texture2D(i, isf_FragNormCoord)',
        '#define IMG_NORM_PIXEL_RAW(i, c) texture2D(i, c)',
        '#define IMG_PIXEL_RAW(i, c) texture2D(i, (c) / RENDERSIZE)',
        '#define IMG_SIZE(i) RENDERSIZE',
        ...inputs,
      ].join('\n') + '\n';
    const varyings: [string, string][] = [['vec2', 'isf_FragNormCoord']];
    for (const m of src.matchAll(ES1_VARYING)) if (m[2] !== 'isf_FragNormCoord') varyings.push([m[1], m[2]]);
    return { vs: vertexFor(varyings, false), fs: header + src, offset: countLines(header), defaults };
  }

  /* ---- Shadertoy ---- */
  if (/\bmainImage\s*\(/.test(src) && !/\bvoid\s+main\s*\(/.test(src)) {
    const v = takeLines(src, /^[ \t]*#(version|extension)[^\n]*/gm);
    const header = SHADERTOY_HEADER;
    return {
      vs: VERT3,
      fs: header + v.src + '\nvoid main(){ _preview_out = vec4(0.0, 0.0, 0.0, 1.0); mainImage(_preview_out, gl_FragCoord.xy); _preview_out.a = 1.0; }',
      offset: countLines(header),
      defaults,
    };
  }

  /* ---- GLSL avec ou sans #version ---- */
  const ver = src.match(/^[ \t]*#version[ \t]+(\d+)(?:[ \t]+(\w+))?/m);
  const num = ver ? parseInt(ver[1], 10) : 100;
  const es = ver?.[2] === 'es';
  if (ver) src = src.replace(ver[0], '');
  const ext = takeLines(src, /^[ \t]*#extension[^\n]*/gm);
  src = stripUniformInits(ext.src, defaults);
  colorDefaults(src, defaults);
  const precision = /^\s*precision\s+\w+\s+float/m.test(src) ? '' : 'precision highp float;\n';

  if (num >= 130 || (es && num >= 300)) {
    // GLSL 3.x / 4.x desktop ou ES 3.0 : on compile en GLSL ES 3.00
    src = src.replace(/\btexture(2D|Cube|3D)\s*\(/g, 'texture(').replace(/\btexture(2D|Cube)Lod\s*\(/g, 'textureLod(');
    if (/\bgl_FragColor\b/.test(src) && !/^\s*(?:layout\s*\([^)]*\)\s*)?out\s+vec4/m.test(src)) {
      src = src.replace(/\bgl_FragColor\b/g, '_preview_out');
      ext.lines.push('out vec4 _preview_out;');
    }
    src = src.replace(/^([ \t]*)varying\b/gm, '$1in');
    const header = '#version 300 es\n' + [...ext.lines.filter((l) => l.startsWith('#'))].join('\n') + (ext.lines.some((l) => l.startsWith('#')) ? '\n' : '') +
      precision + 'precision highp int;\n' + ext.lines.filter((l) => !l.startsWith('#')).map((l) => l + '\n').join('');
    const varyings: [string, string][] = [...src.matchAll(ES3_IN)].map((m) => [m[1], m[2]]);
    return { vs: vertexFor(varyings, true), fs: header + src, offset: countLines(header), defaults, simulated: varyings.map((v) => v[1]) };
  }

  // GLSL ES 1.00 (WebGL 1) ou GLSL desktop 1.10 / 1.20
  const header = ext.lines.map((l) => l + '\n').join('') + precision;
  const varyings: [string, string][] = [...src.matchAll(ES1_VARYING)].map((m) => [m[1], m[2]]);
  return { vs: vertexFor(varyings, false), fs: header + src, offset: countLines(header), defaults, simulated: varyings.map((v) => v[1]) };
}

/** Garde la première erreur du compilateur, avec le numéro de ligne du code collé. */
function formatLog(log: string, offset: number, fr: boolean): string {
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines.find((l) => /^ERROR:/.test(l)) ?? lines[0] ?? '';
  const m = first.match(/^ERROR:\s*\d+:(\d+):\s*(.*)$/);
  if (!m) return first.replace(/^ERROR:\s*/, '');
  const line = parseInt(m[1], 10) - offset;
  const msg = m[2].replace(/^'([^']*)'\s*:\s*/, (_x, tok) => (tok ? `'${tok}' : ` : ''));
  return line > 0 ? `${fr ? 'ligne' : 'line'} ${line} : ${msg}` : msg;
}
