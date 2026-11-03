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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

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
  load(source: string) {
    const gl = this.gl;
    if (!gl) return this.onStatus(false, 'WebGL 2 indisponible dans ce navigateur.');
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = null;
    if (!source.trim() || /^\s*\/\*\s*\{/.test(source) || /#include\s*</.test(source)) {
      cancelAnimationFrame(this.raf);
      return this.onStatus(false, "Aperçu non disponible pour ce type de shader.");
    }
    let vs = VERT1;
    let fs: string;
    if (/\bmainImage\s*\(/.test(source) && !/\bvoid\s+main\s*\(/.test(source)) {
      vs = VERT3;
      fs = SHADERTOY_HEADER + source + '\nvoid main(){ _preview_out = vec4(0.0, 0.0, 0.0, 1.0); mainImage(_preview_out, gl_FragCoord.xy); _preview_out.a = 1.0; }';
    } else if (/^\s*#version\s+300\s+es/m.test(source)) {
      vs = VERT3;
      fs = source;
    } else if (/^\s*#version\s+\d+/m.test(source)) {
      cancelAnimationFrame(this.raf);
      return this.onStatus(false, 'Aperçu limité au GLSL ES (WebGL).');
    } else {
      fs = (/precision\s+\w+\s+float/.test(source) ? '' : 'precision highp float;\n') + source;
      if (/^\s*varying\b/m.test(fs)) vs = 'attribute vec2 p; varying vec2 _pv; void main(){ _pv = p; gl_Position = vec4(p, 0.0, 1.0); }';
    }
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) ?? '';
        gl.deleteShader(sh);
        throw new Error(log.split('\n')[0]);
      }
      return sh;
    };
    try {
      // Les varyings non fournis par notre vertex shader empêchent l'édition des liens : on les remplit
      const varyings = [...fs.matchAll(/^\s*varying\s+(?:\w+\s+)?(vec[234]|float)\s+(\w+)\s*;/gm)];
      if (varyings.length && vs.startsWith('attribute')) {
        vs = 'attribute vec2 p;\n' + varyings.map((m) => `varying ${m[1]} ${m[2]};`).join('\n') +
          '\nvoid main(){ vec2 uv = p * 0.5 + 0.5;\n' +
          varyings.map((m) => `${m[2]} = ${m[1] === 'float' ? 'uv.x' : m[1] === 'vec2' ? 'uv' : m[1] === 'vec3' ? 'vec3(uv, 0.0)' : 'vec4(uv, 0.0, 1.0)'};`).join('\n') +
          '\ngl_Position = vec4(p, 0.0, 1.0); }';
      }
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
      this.prog = prog;
      this.start = performance.now();
      this.frame = 0;
      this.onStatus(true, 'Shader d’origine, rendu par ton navigateur.');
      cancelAnimationFrame(this.raf);
      this.loop();
    } catch (e: any) {
      cancelAnimationFrame(this.raf);
      this.onStatus(false, 'Le navigateur ne compile pas ce shader : ' + String(e.message ?? e).replace(/^ERROR: 0:\d+: /, ''));
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
    const u = (n: string) => gl.getUniformLocation(this.prog!, n);
    const hover = (this as any).hover ?? [0, 0];
    const set1f = (names: string[], v: number) => names.forEach((n) => { const l = u(n); if (l) gl.uniform1f(l, v); });
    const set2f = (names: string[], a: number, b: number) => names.forEach((n) => { const l = u(n); if (l) gl.uniform2f(l, a, b); });
    set1f(['iTime', 'time', 'u_time', 'uTime', 'iGlobalTime'], t);
    set1f(['iTimeDelta'], dt);
    set2f(['resolution', 'u_resolution', 'uResolution'], w, h);
    set2f(['u_mouse', 'uMouse'], hover[0], hover[1]);
    set2f(['mouse'], hover[0] / w, hover[1] / h);
    const r3 = u('iResolution');
    if (r3) gl.uniform3f(r3, w, h, 1);
    const m4 = u('iMouse');
    if (m4) gl.uniform4f(m4, this.mouse[0], this.mouse[1], this.mouse[2], this.mouse[3]);
    const fr = u('iFrame');
    if (fr) gl.uniform1i(fr, this.frame++);
    const d = new Date();
    const dl = u('iDate');
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
