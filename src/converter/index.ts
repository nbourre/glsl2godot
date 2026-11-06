// glsl2godot : convertit un shader GLSL (Shadertoy, GLSL Sandbox, Book of Shaders,
// ISF, three.js, WebGL/OpenGL brut) en shader Godot 4 (.gdshader).
//
// Pipeline : préprocesseur -> parseur -> analyse (portées, graphe d'appels,
// globales) -> transformation de l'AST -> émission du code Godot.

import { parse, generate } from '@shaderfrog/glsl-parser';
import preprocess from '@shaderfrog/glsl-parser/preprocessor/index.js';
import {
  arithResult, builtinReturn, CONSTRUCTOR_TYPES, isFloatKind, isIntScalar, isMatrix, isVector,
  scalarOf, vecOf, vecSize,
} from './types';
import {
  attributeFor, DIALECT_LABELS, DIALECT_LABELS_EN, Dialect, FUNCTION_RENAMES, GODOT_CONSTANTS, GODOT_RESERVED, matrixFor,
  Role, ROLE_NAMES, THREE_FRAGMENT_BUILTINS, THREE_VERTEX_BUILTINS, varyingFallback,
} from './dialects';
import { generateScript, ScriptRole } from './script';
import { resolveThreeIncludes } from './three-chunks';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

export type Target = 'auto' | 'canvas_item' | 'spatial';

export interface ConvertOptions {
  fragment: string;
  vertex?: string;
  target?: Target;
  language?: 'en' | 'fr';
}

export interface Message {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface ConvertResult {
  ok: boolean;
  shader: string;
  script: string | null;
  dialect: Dialect;
  dialectLabel: string;
  target: 'canvas_item' | 'spatial';
  messages: Message[];
  setup: string[];
}

/* ------------------------------------------------------------------ */
/* Utilitaires AST                                                     */
/* ------------------------------------------------------------------ */

const gen = (n: Node): string => (n ? generate(n) : '');
const genTrim = (n: Node) => gen(n).trim();

/** Remplace un nœud par du texte brut en gardant son espacement final. */
function replaceText(node: Node, text: string, type?: string | null) {
  const code = gen(node);
  const trailing = code.match(/\s*$/)?.[0] ?? '';
  for (const k of Object.keys(node)) delete node[k];
  node.type = 'literal';
  node.literal = text;
  node.whitespace = trailing;
  if (type !== undefined) node.__type = type;
}

const lit = (text: string): Node => ({ type: 'literal', literal: text, whitespace: '' });

function specText(spec: Node): string {
  // type_specifier -> "vec3", "float[3]", "MyStruct"
  return genTrim(spec);
}

function typeFromSpecifier(spec: Node): string {
  if (!spec) return 'unknown';
  const s = spec.specifier;
  let base: string;
  if (s.type === 'keyword') base = s.token;
  else if (s.type === 'struct') base = s.typeName?.identifier ?? 'struct';
  else base = s.identifier;
  if (spec.quantifier && spec.quantifier.length) base += '[]';
  return base;
}

function quantText(q: Node[] | null | undefined): string {
  return q && q.length ? q.map((x) => genTrim(x)).join('') : '';
}

function qualifierTokens(fst: Node): string[] {
  return (fst?.qualifiers ?? []).map((q: Node) => (q.type === 'keyword' ? q.token : q.type === 'layout_qualifier' ? 'layout' : q.type));
}

function isComma(n: Node) {
  return n && n.type === 'literal' && n.literal === ',';
}

function callArgs(call: Node): Node[] {
  return (call.args ?? []).filter((a: Node) => !isComma(a));
}

function stripTrailing(s: string) {
  return s.replace(/\s+$/, '');
}

const KNOWN_BUILTINS = new Set([
  'matrixCompMult', 'outerProduct', 'bitfieldExtract', 'bitfieldInsert', 'bitfieldReverse', 'bitCount', 'findLSB', 'findMSB',
  'uaddCarry', 'usubBorrow', 'umulExtended', 'imulExtended', 'frexp', 'ldexp', 'textureQueryLod', 'textureQueryLevels',
  'texture', 'textureLod', 'textureGrad', 'textureProj', 'texelFetch', 'textureSize', 'packHalf2x16', 'unpackHalf2x16',
  'floatBitsToInt', 'floatBitsToUint', 'intBitsToFloat', 'uintBitsToFloat', 'isnan', 'isinf', 'not', 'any', 'all', 'determinant', 'inverse', 'transpose',
  ...Object.keys(FUNCTION_RENAMES), 'IMG_NORM_PIXEL', 'IMG_PIXEL', 'IMG_THIS_PIXEL', 'IMG_THIS_NORM_PIXEL', 'IMG_SIZE', 'IMG_NORM_PIXEL_RAW', 'IMG_PIXEL_RAW',
]);

const SWIZZLE = /^([xyzw]{1,4}|[rgba]{1,4}|[stpq]{1,4})$/;

/* ------------------------------------------------------------------ */
/* Structures                                                          */
/* ------------------------------------------------------------------ */

type StageKind = 'vertex' | 'fragment';

interface GlobalVar {
  name: string;
  type: string; // type pour l'inférence (ex: vec3, float[])
  spec: string; // texte du type
  quant: string; // texte du tableau
  storage: 'uniform' | 'in' | 'out' | 'attribute' | 'varying' | 'const' | 'none';
  precision: string;
  interp: string; // flat / smooth
  init: Node | null;
  written: boolean;
  usedBy: Set<string>;
  declOrder: number;
}

interface FnInfo {
  name: string;
  nodes: Node[];
  calls: Set<string>;
  refs: Set<string>; // globales / builtins référencés directement
  writes: Set<string>;
  order: number;
}

interface Stage {
  kind: StageKind;
  ast: Node;
  globals: Map<string, GlobalVar>;
  structs: Map<string, Map<string, string>>;
  functions: Map<string, FnInfo>;
  prototypes: Set<string>;
  otherTop: { node: Node; order: number }[]; // structs, etc.
  undeclared: Set<string>;
  root: string | null; // main ou mainImage
}

interface ThreadVar {
  name: string; // nom d'origine
  param: string; // nom du paramètre / local
  type: string; // texte du type
  quant: string;
  qual: 'inout' | 'in';
  kind: 'global' | 'builtin' | 'output' | 'varying';
  expr?: string; // expression Godot à passer depuis l'entrée
  init?: string; // initialisation (globales)
}

interface Plan {
  stage: Stage;
  canvas: boolean;
  // actions sur les identifiants (globales et non déclarés)
  identMap: Map<string, { text: string; type: string }>;
  threads: Map<string, ThreadVar>;
  fnUses: Map<string, string[]>; // fonction -> variables enfilées (ordre stable)
  fnRename: Map<string, string>;
  rootInline: boolean;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

export function convert(opts: ConvertOptions): ConvertResult {
  const language = opts.language ?? 'en';
  const messages: Message[] = [];
  const warn = (text: string) => messages.push({ level: 'warning', text });
  const info = (text: string) => messages.push({ level: 'info', text });
  const fail = (text: string, dialect: Dialect = 'generic'): ConvertResult => ({
    ok: false,
    shader: '',
    script: null,
    dialect,
    dialectLabel: DIALECT_LABELS[dialect],
    target: 'canvas_item',
    messages: [{ level: 'error', text }, ...messages],
    setup: [],
  });

  let fragSrc = opts.fragment ?? '';
  let vertSrc = (opts.vertex ?? '').trim() ? opts.vertex! : '';

  if (!fragSrc.trim() && !vertSrc.trim()) return fail('Colle un shader pour commencer.');

  // Un seul champ contenant un vertex shader ?
  if (!vertSrc && /\bgl_Position\b/.test(fragSrc) && !/\bgl_FragColor\b|\bmainImage\b/.test(fragSrc)) {
    vertSrc = fragSrc;
    fragSrc = '';
  }

  /* --- ISF : en-tête JSON --- */
  let isf: any = null;
  const isfMatch = fragSrc.match(/^\s*\/\*\s*(\{[\s\S]*?\})\s*\*\//);
  let fragLineOffset = 0;
  if (isfMatch) {
    try {
      isf = JSON.parse(isfMatch[1]);
      fragLineOffset = (isfMatch[0].match(/\n/g) ?? []).length;
      fragSrc = fragSrc.slice(isfMatch[0].length);
    } catch {
      isf = null;
    }
  }

  /* --- Préprocesseur --- */
  const prep = (src: string, label: string): string => {
    let s = src.replace(/\r\n?/g, '\n');
    const inc = resolveThreeIncludes(s);
    s = inc.src;
    if (inc.injected?.length) info(`${label} : fonctions three.js ajoutées (${inc.injected.join(', ')}).`);
    if (inc.unresolved.length)
      warn(`${label} : #include <${inc.unresolved.join('>, <')}> ne peut pas être résolu automatiquement et a été retiré. Colle le contenu du chunk si le shader en dépend.`);
    if (/^\s*#include\s*"/m.test(s)) {
      warn(`${label} : les #include "fichier" ne peuvent pas être résolus ici. Colle le code inclus directement.`);
      s = s.replace(/^\s*#include\s*".*$/gm, '');
    }
    s = s.replace(/^\s*#\s*(version|extension|pragma)\b.*$/gm, '');
    s = stripDefineComments(s);
    try {
      return preprocess(s, { preserveComments: true } as any);
    } catch (e: any) {
      warn(`${label} : le préprocesseur a échoué (${String(e.message ?? e).split('\n')[0]}). Conversion tentée sans développer les macros.`);
      return s;
    }
  };

  const fragPre = fragSrc.trim() ? prep(fragSrc, 'Fragment') : '';
  const vertPre = vertSrc.trim() ? prep(vertSrc, 'Vertex') : '';

  /* --- Parse --- */
  const GLSL3_WORDS = /\b(sample|input|output|filter|active|common|partition|patch|buffer|shared|resource|precise|noperspective|superp|coherent|volatile|restrict|readonly|writeonly)\b/g;
  const parseStage = (src: string, kind: StageKind, original: string, lineOffset = 0): Stage | string => {
    try {
      let ast: Node;
      try {
        ast = parse(src, { quiet: true, stage: kind } as any);
      } catch (e) {
        // Code GLSL ES 1.0 qui utilise des mots réservés en GLSL 3 comme noms de variables
        const words = new Set([...src.matchAll(GLSL3_WORDS)].map((m) => m[1]));
        if (!words.size) throw e;
        const fixed = src.replace(GLSL3_WORDS, '$1_');
        ast = parse(fixed, { quiet: true, stage: kind } as any);
        info(`Identifiants réservés en GLSL 3 renommés : ${[...words].map((w) => `${w} → ${w}_`).join(', ')}.`);
      }
      return buildStage(ast, kind);
    } catch (e: any) {
      const loc = e.location?.start;
      // Le préprocesseur retire les #define : on retrouve la ligne correspondante dans le code collé
      const line = loc ? mapLine(src.split('\n'), original.replace(/\r\n?/g, '\n').split('\n'), loc.line - 1) + 1 + lineOffset : 0;
      const where = loc ? ` (ligne ${line}, colonne ${loc.column})` : '';
      return `Erreur de syntaxe GLSL dans le ${kind === 'vertex' ? 'vertex' : 'fragment'} shader${where} : ${String(e.message ?? e).split('\n')[0]}`;
    }
  };

  let frag: Stage | null = null;
  let vert: Stage | null = null;
  if (fragPre) {
    const r = parseStage(fragPre, 'fragment', fragSrc, fragLineOffset);
    if (typeof r === 'string') return fail(r);
    frag = r;
  }
  if (vertPre) {
    const r = parseStage(vertPre, 'vertex', vertSrc);
    if (typeof r === 'string') return fail(r);
    vert = r;
  }

  /* --- Détection du dialecte --- */
  const allText = fragSrc + '\n' + vertSrc;
  let dialect: Dialect = 'generic';
  const undecl = new Set<string>([...(frag?.undeclared ?? []), ...(vert?.undeclared ?? [])]);
  const declaredUniform = (n: string) =>
    [frag, vert].some((s) => s?.globals.get(n)?.storage === 'uniform');
  if (isf) dialect = 'isf';
  else if (frag?.functions.has('mainImage') && !frag.functions.has('main')) dialect = 'shadertoy';
  else if (['projectionMatrix', 'modelViewMatrix', 'modelMatrix', 'viewMatrix', 'cameraPosition', 'normalMatrix'].some((n) => undecl.has(n)) || /#include\s*</.test(allText))
    dialect = 'threejs';
  else if (['u_time', 'u_resolution', 'u_mouse'].some((n) => declaredUniform(n))) dialect = 'bookofshaders';
  else if (['time', 'resolution', 'mouse'].some((n) => declaredUniform(n))) dialect = 'glslsandbox';

  /* --- Cible --- */
  let target: 'canvas_item' | 'spatial';
  if (opts.target && opts.target !== 'auto') target = opts.target;
  else target = vert || dialect === 'threejs' ? 'spatial' : 'canvas_item';
  const canvas = target === 'canvas_item';

  if (canvas && vert) {
    warn("La cible 2D (canvas_item) n'utilise pas le vertex shader fourni : il a été ignoré. Choisis la cible 3D (spatial) pour le convertir.");
    vert = null;
  }
  if (!frag) {
    info("Aucun fragment shader fourni : un fragment() minimal a été généré.");
  }

  /* --- Rôles (uniforms magiques) --- */
  const roles = new Map<string, { role: Role; type: string; mouseFormat?: string; declared: boolean }>();
  for (const st of [frag, vert]) {
    if (!st) continue;
    for (const [name, def] of Object.entries(ROLE_NAMES)) {
      const g = st.globals.get(name);
      const used = g ? g.storage === 'uniform' : st.undeclared.has(name);
      if (!used || roles.has(name)) continue;
      // ISF : TIME/RENDERSIZE ne sont des rôles qu'en ISF; mouse etc. seulement si uniform
      if (!g && !['shadertoy', 'isf'].includes(dialect) && !name.startsWith('i')) continue;
      if (!g && dialect !== 'isf' && name === name.toUpperCase()) continue;
      let mouseFormat = def.mouseFormat;
      if (name === 'mouse' && dialect !== 'glslsandbox') mouseFormat = 'pixels';
      roles.set(name, { role: def.role, type: g ? g.type : def.type, mouseFormat, declared: !!g });
    }
  }

  const needResolution = () => {
    for (const [n, r] of roles) if (r.role === 'resolution') return n;
    let name = 'iResolution';
    while ([frag, vert].some((s) => s?.globals.has(name) || s?.undeclared.has(name))) name = '_' + name;
    roles.set(name, { role: 'resolution', type: 'vec3', declared: false });
    return name;
  };

  /* --- Plans par étape --- */
  const plans: Plan[] = [];
  const extraUniforms: string[] = [];
  const varyings = new Map<string, { type: string; quant: string; interp: string }>();

  const fragOutputName = frag ? findFragOutput(frag) : null;

  // Varyings : vertex out/varying + fragment in/varying
  if (frag?.root === 'mainImage') needResolution();
  if (vert) {
    for (const st of [vert, frag]) {
      if (!st) continue;
      for (const g of st.globals.values()) {
        const isVar = g.storage === 'varying' || (st.kind === 'vertex' && g.storage === 'out') || (st.kind === 'fragment' && g.storage === 'in');
        if (!isVar) continue;
        if (!varyings.has(g.name)) varyings.set(g.name, { type: g.spec, quant: g.quant, interp: g.interp });
      }
    }
  }

  for (const st of [vert, frag]) {
    if (!st) continue;
    const plan: Plan = {
      stage: st,
      canvas,
      identMap: new Map(),
      threads: new Map(),
      fnUses: new Map(),
      fnRename: new Map(),
      rootInline: st.kind === 'vertex',
    };
    plans.push(plan);
    const isFrag = st.kind === 'fragment';
    const threadBuiltin = (name: string, type: string, expr: string, quant = '') => {
      plan.threads.set(name, { name, param: name.startsWith('gl_') ? '_' + name : name, type, quant, qual: 'in', kind: 'builtin', expr });
    };

    // Rôles
    for (const [name, r] of roles) {
      if (!(st.globals.get(name)?.storage === 'uniform' || st.undeclared.has(name))) continue;
      if (r.role === 'time' && r.type === 'float') plan.identMap.set(name, { text: 'TIME', type: 'float' });
    }

    // Builtins GLSL
    for (const name of st.undeclared) {
      if (roles.has(name)) continue;
      if (isFrag) {
        if (name === 'gl_FragCoord') {
          let expr: string;
          if (canvas || !vert) {
            const res = needResolution();
            expr = canvas
              ? `vec4(vec2(UV.x, 1.0 - UV.y) * ${res}.xy, FRAGCOORD.z, 1.0)`
              : `vec4(vec2(UV.x, 1.0 - UV.y) * ${res}.xy, FRAGCOORD.z, 1.0)`;
          } else expr = 'vec4(FRAGCOORD.x, VIEWPORT_SIZE.y - FRAGCOORD.y, FRAGCOORD.z, FRAGCOORD.w)';
          threadBuiltin(name, 'vec4', expr);
        } else if (name === 'gl_FrontFacing') threadBuiltin(name, 'bool', canvas ? 'true' : 'FRONT_FACING');
        else if (name === 'gl_PointCoord') threadBuiltin(name, 'vec2', 'POINT_COORD');
        else if (name === 'isf_FragNormCoord') threadBuiltin(name, 'vec2', 'vec2(UV.x, 1.0 - UV.y)');
        else if (name === 'gl_FragDepth') warn("gl_FragDepth n'est pas converti automatiquement : écris DEPTH dans fragment() à la main (cible 3D).");
        else if (name === 'gl_FragData') warn('gl_FragData (rendu multiple) n\'existe pas dans Godot : seule la première sortie est gérée. Remplace gl_FragData[0] par gl_FragColor.');
        else if (!canvas && THREE_FRAGMENT_BUILTINS[name]) {
          const b = THREE_FRAGMENT_BUILTINS[name];
          threadBuiltin(name, b.type, b.expr);
        } else if (name === 'TIME' && dialect !== 'isf') {
          /* déjà un builtin Godot */
        }
      } else {
        if (name === 'gl_Position') plan.identMap.set(name, { text: 'POSITION', type: 'vec4' });
        else if (name === 'gl_PointSize') plan.identMap.set(name, { text: 'POINT_SIZE', type: 'float' });
        else if (name === 'gl_VertexID') plan.identMap.set(name, { text: 'VERTEX_ID', type: 'int' });
        else if (name === 'gl_InstanceID') plan.identMap.set(name, { text: 'INSTANCE_ID', type: 'int' });
        else if (THREE_VERTEX_BUILTINS[name]) {
          const b = THREE_VERTEX_BUILTINS[name];
          threadBuiltin(name, b.type, b.expr);
        }
      }
    }

    // Globales déclarées
    for (const g of st.globals.values()) {
      const isVaryingHere = g.storage === 'varying' || (st.kind === 'vertex' && g.storage === 'out' && g.name !== fragOutputName) || (st.kind === 'fragment' && g.storage === 'in');
      if (isFrag && g.name === fragOutputName) continue;
      if (st.kind === 'vertex' && (g.storage === 'attribute' || g.storage === 'in')) {
        const a = attributeFor(g.name);
        if (a) {
          threadBuiltin(g.name, g.spec, convertVec(a.expr, a.godotType, g.spec));
          info(`Attribut « ${g.name} » associé à ${a.expr}.`);
        } else {
          const custom = ['CUSTOM0', 'CUSTOM1', 'CUSTOM2', 'CUSTOM3'][[...st.globals.values()].filter((x) => (x.storage === 'attribute' || x.storage === 'in') && !attributeFor(x.name)).indexOf(g)] ?? 'CUSTOM0';
          threadBuiltin(g.name, g.spec, convertVec(custom, 'vec4', g.spec));
          warn(`Attribut « ${g.name} » inconnu : associé à ${custom}. Godot lit les attributs personnalisés dans les canaux CUSTOM0 à CUSTOM3 du mesh.`);
        }
        continue;
      }
      if (isVaryingHere) {
        if (!vert && isFrag) {
          const fb = varyingFallback(g.name, canvas);
          if (fb) {
            threadBuiltin(g.name, g.spec, convertVec(fb.expr, fb.type, g.spec));
            info(`Varying « ${g.name} » sans vertex shader : remplacé par ${fb.expr}.`);
          } else if (g.usedBy.size) {
            warn(`Varying « ${g.name} » sans vertex shader correspondant : il vaudra zéro. Ajoute le vertex shader (cible 3D) ou remplace-le à la main.`);
            varyings.set(g.name, { type: g.spec, quant: g.quant, interp: g.interp });
          }
        }
        continue;
      }
      if (g.storage === 'uniform') {
        if (roles.has(g.name)) continue;
        if (!canvas && (g.type === 'mat4' || g.type === 'mat3')) {
          const m = matrixFor(g.name, g.type);
          if (m) {
            if (isFrag && !m.startsWith('(') && m !== 'MODELVIEW_NORMAL_MATRIX') threadBuiltin(g.name, g.spec, m);
            else if (isFrag) threadBuiltin(g.name, g.spec, m);
            else threadBuiltin(g.name, g.spec, m);
            info(`Uniform « ${g.name} » remplacé par ${m.replace(/[()]/g, '')} de Godot.`);
            g.storage = 'none';
            (g as any).__mapped = true;
            continue;
          }
        }
        continue;
      }
      if (g.storage === 'const') continue;
      if (g.storage === 'none') {
        // globale modifiable ?
        const constable = !g.written && g.init && isConstExpr(g.init, st);
        if (constable) {
          g.storage = 'const';
        } else {
          plan.threads.set(g.name, {
            name: g.name, param: g.name, type: [g.precision, g.spec].filter(Boolean).join(' '), quant: g.quant,
            qual: 'inout', kind: 'global',
          });
        }
      }
    }

    // Varyings écrits dans des fonctions du vertex shader : Godot n'accepte les écritures que dans vertex()
    if (!isFrag) {
      for (const [fname, f] of st.functions) {
        if (fname === st.root) continue;
        for (const w of f.writes) {
          if (!varyings.has(w) || plan.threads.has(w)) continue;
          const v = varyings.get(w)!;
          plan.threads.set(w, { name: w, param: '_v_' + w, type: v.type, quant: v.quant, qual: 'inout', kind: 'varying' });
        }
      }
    }

    // Sortie du fragment
    if (isFrag && fragOutputName) {
      plan.threads.set(fragOutputName, {
        name: fragOutputName, param: fragOutputName.startsWith('gl_') ? '_fragColor' : fragOutputName,
        type: 'vec4', quant: '', qual: 'inout', kind: 'output',
      });
    }
  }

  // Collisions de noms de fonctions entre étapes
  if (vert && frag) {
    const vp = plans[0];
    for (const [name, fv] of vert.functions) {
      if (name === vert.root) continue;
      const ff = frag.functions.get(name);
      if (!ff) continue;
      const a = fv.nodes.map(gen).join('').replace(/\s+/g, ' ');
      const b = ff.nodes.map(gen).join('').replace(/\s+/g, ' ');
      if (a === b) (fv as any).__dup = true;
      else vp.fnRename.set(name, name + '_v');
    }
  }

  /* --- Enfilage (globales modifiables, builtins dans les fonctions) --- */
  for (const plan of plans) {
    const st = plan.stage;
    const closure = new Map<string, Set<string>>();
    const visiting = new Set<string>();
    const reported = new Set<string>();
    const uses = (fname: string): Set<string> => {
      if (closure.has(fname)) return closure.get(fname)!;
      const f = st.functions.get(fname);
      const set = new Set<string>();
      if (!f) return set;
      if (visiting.has(fname)) {
        // Une surcharge qui appelle une autre surcharge du même nom n'est pas de la récursion
        if (f.nodes.length > 1) return set;
        if (!reported.has(fname)) {
          warn(`La fonction « ${fname} » est récursive : Godot interdit la récursion. Il faut la réécrire avec une boucle.`);
          reported.add(fname);
        }
        return set;
      }
      visiting.add(fname);
      for (const r of f.refs) if (plan.threads.has(r)) set.add(r);
      for (const c of f.calls) for (const r of uses(c)) set.add(r);
      visiting.delete(fname);
      closure.set(fname, set);
      return set;
    };
    for (const fname of st.functions.keys()) {
      const u = uses(fname);
      const order = [...plan.threads.keys()].filter((k) => u.has(k));
      plan.fnUses.set(fname, order);
    }
    // Avertissements : builtins de vertex utilisés hors de main qui ne peuvent pas être écrits
    if (st.kind === 'vertex') {
      for (const [fname, f] of st.functions) {
        if (fname === st.root) continue;
        for (const r of f.refs) {
          if (r === 'gl_Position' && f.writes.has(r))
            warn(`La fonction « ${fname} » écrit « ${r} » : Godot n'accepte ces écritures que directement dans vertex(). Déplace l'affectation dans main().`);
        }
      }
    }
  }

  /* --- Transformation --- */
  const globalNames = new Set<string>();
  for (const [n, r] of roles) if (!(r.role === 'time' && r.type === 'float')) globalNames.add(n);
  for (const n of varyings.keys()) globalNames.add(n);
  if (isf && Array.isArray(isf.INPUTS)) for (const i of isf.INPUTS) if (i.NAME) globalNames.add(i.NAME);
  for (const plan of plans)
    for (const g of plan.stage.globals.values())
      if (g.storage === 'uniform' || g.storage === 'const' || (g.storage === 'none' && !plan.threads.has(g.name) && !(g as any).__mapped)) globalNames.add(g.name);
  for (const plan of plans) transformStage(plan, { globalNames, warn, info, roles, varyings, dialect, language });

  /* --- Émission --- */
  const out: string[] = [];
  out.push(`shader_type ${target};`);
  out.push(canvas ? 'render_mode unshaded;' : 'render_mode unshaded;');
  out.push('');
  out.push(language === 'fr'
    ? `// Converti depuis ${DIALECT_LABELS[dialect]} avec glsl2godot.`
    : `// Converted from ${DIALECT_LABELS_EN[dialect]} with glsl2godot.`);
  if (isf?.DESCRIPTION) out.push(`// ${String(isf.DESCRIPTION).replace(/\n/g, ' ')}`);
  if (isf?.CREDIT) out.push(`// Crédit : ${String(isf.CREDIT).replace(/\n/g, ' ')}`);

  // Uniforms
  const uniformLines: string[] = [];
  const seenUniform = new Set<string>();
  const scriptRoles: ScriptRole[] = [];
  for (const [name, r] of roles) {
    if (r.role === 'time' && r.type === 'float') continue;
    seenUniform.add(name);
    const { spec, quant } = splitType(r.type);
    let hint = '';
    let def = '';
    switch (r.role) {
      case 'resolution':
        def = spec === 'vec3' ? 'vec3(512.0, 512.0, 1.0)' : 'vec2(512.0, 512.0)';
        break;
      case 'channel':
        hint = ' : repeat_enable, filter_linear_mipmap';
        break;
      case 'samplerate':
        def = '44100.0';
        break;
    }
    const comment = (language === 'fr' ? {
      resolution: ' // taille en pixels, mise à jour par le script',
      mouse: ' // souris, mise à jour par le script',
      frame: ' // numéro d\'image, mis à jour par le script',
      timedelta: ' // durée de la dernière image, mise à jour par le script',
      date: ' // date, mise à jour par le script',
      channel: ' // assigne une texture dans l\'inspecteur',
      channelres: ' // taille des textures iChannel, à remplir à la main',
      channeltime: '',
      samplerate: '',
      time: '',
    } : {
      resolution: ' // pixel size, updated by the script',
      mouse: ' // mouse position, updated by the script',
      frame: ' // frame number, updated by the script',
      timedelta: ' // last frame duration, updated by the script',
      date: ' // date, updated by the script',
      channel: ' // assign a texture in the inspector',
      channelres: ' // iChannel texture sizes, fill in manually',
      channeltime: '',
      samplerate: '',
      time: '',
    })[r.role];
    uniformLines.push(`uniform ${spec} ${name}${quant}${hint}${def ? ' = ' + def : ''};${comment}`);
    if (['resolution', 'mouse', 'frame', 'timedelta', 'date'].includes(r.role))
      scriptRoles.push({ name, role: r.role as ScriptRole['role'], type: spec, mouseFormat: r.mouseFormat as any });
  }
  // ISF INPUTS
  if (isf && Array.isArray(isf.INPUTS)) {
    for (const inp of isf.INPUTS) {
      const line = isfUniform(inp);
      if (line && !seenUniform.has(inp.NAME)) {
        uniformLines.push(line);
        seenUniform.add(inp.NAME);
      }
    }
    if (Array.isArray(isf.PASSES) && isf.PASSES.length > 1)
      warn('Ce shader ISF utilise plusieurs passes (PASSES) : seule la logique d\'une passe unique est convertie. Les passes intermédiaires demandent des SubViewport dans Godot.');
  }
  for (const plan of plans) {
    for (const g of plan.stage.globals.values()) {
      if (g.storage !== 'uniform' || seenUniform.has(g.name) || roles.has(g.name)) continue;
      seenUniform.add(g.name);
      uniformLines.push(uniformDecl(g));
    }
  }
  uniformLines.push(...extraUniforms);
  if (uniformLines.length) {
    out.push('');
    out.push(...uniformLines);
  }

  // Varyings
  if (varyings.size) {
    out.push('');
    for (const [name, v] of varyings) {
      const interp = v.interp || (/^(int|uint|ivec|uvec)/.test(v.type) ? 'flat' : '');
      out.push(`varying ${interp ? interp + ' ' : ''}${v.type} ${name}${v.quant};`);
    }
  }

  // Structs et constantes
  const seenTop = new Set<string>();
  const topLines: string[] = [];
  for (const plan of plans) {
    const st = plan.stage;
    const items: { order: number; text: string }[] = [];
    for (const o of st.otherTop) items.push({ order: o.order, text: stripTrailing(gen(o.node)) });
    for (const g of st.globals.values()) {
      if (g.storage !== 'const') continue;
      if (g.name in GODOT_CONSTANTS && !(g as any).__newName) continue; // fournie par Godot
      const init = g.init ? ' = ' + genTrim(g.init) : '';
      items.push({ order: g.declOrder, text: `const ${g.precision ? g.precision + ' ' : ''}${g.spec} ${(g as any).__newName ?? g.name}${g.quant}${init};` });
    }
    items.sort((a, b) => a.order - b.order);
    for (const it of items) {
      const key = it.text.replace(/\s+/g, ' ');
      if (seenTop.has(key)) continue;
      seenTop.add(key);
      topLines.push(it.text);
    }
  }
  if (topLines.length) {
    out.push('');
    out.push(...topLines);
  }

  // Fonctions (ordre topologique)
  for (const plan of plans) {
    const st = plan.stage;
    const emitted = new Set<string>();
    const fnTexts: string[] = [];
    const emit = (name: string, stack: Set<string>) => {
      if (emitted.has(name) || stack.has(name)) return;
      const f = st.functions.get(name);
      if (!f) return;
      stack.add(name);
      for (const c of f.calls) emit(c, stack);
      stack.delete(name);
      emitted.add(name);
      if ((f as any).__dup) return;
      if (plan.rootInline && name === st.root) return; // émis comme vertex()
      for (const n of f.nodes) fnTexts.push(stripTrailing(gen(n)));
    };
    const order = [...st.functions.values()].sort((a, b) => a.order - b.order);
    for (const f of order) emit(f.name, new Set());
    if (fnTexts.length) {
      out.push('');
      out.push(fnTexts.join('\n\n'));
    }
  }

  // Points d'entrée
  const vplan = plans.find((p) => p.stage.kind === 'vertex');
  const fplan = plans.find((p) => p.stage.kind === 'fragment');
  if (vplan) {
    const st = vplan.stage;
    if (st.root) {
      const f = st.functions.get(st.root)!;
      out.push('');
      out.push(stripTrailing(gen(f.nodes[0])));
    } else warn('Aucune fonction main() trouvée dans le vertex shader.');
  }

  out.push('');
  if (fplan && fplan.stage.root) {
    const st = fplan.stage;
    const rootName = st.root === 'main' ? '_glsl_main' : fplan.fnRename.get(st.root!) ?? st.root!;
    const usesList = fplan.fnUses.get(st.root!) ?? [];
    const args: string[] = [];
    const prelude: string[] = [];
    const outVar = '_fragColor';
    if (st.root === 'mainImage') {
      const res = needResolution();
      args.push(outVar, `vec2(UV.x, 1.0 - UV.y) * ${res}.xy`);
    }
    for (const tname of usesList) {
      const tv = fplan.threads.get(tname)!;
      if (tv.kind === 'output') args.push(outVar);
      else if (tv.kind === 'builtin') args.push(tv.expr!);
    }
    out.push('void fragment() {');
    out.push(`\tvec4 ${outVar} = vec4(0.0, 0.0, 0.0, 1.0);`);
    for (const p of prelude) out.push('\t' + p);
    out.push(`\t${rootName}(${args.join(', ')});`);
    if (canvas) out.push(`\tCOLOR = ${outVar};`);
    else {
      out.push(`\tALBEDO = ${outVar}.rgb;`);
      out.push(language === 'fr'
        ? `\t// ALPHA = ${outVar}.a; // décommente pour la transparence`
        : `\t// ALPHA = ${outVar}.a; // uncomment for transparency`);
    }
    out.push('}');
  } else if (frag && !frag.root) {
    warn('Aucune fonction main() ou mainImage() trouvée dans le fragment shader.');
  } else if (!frag && !canvas) {
    // vertex seul
  }

  // Avertissements spécifiques
  if (dialect === 'shadertoy') {
    for (const [n, r] of roles) {
      if (r.role === 'channel')
        warn(`${n} : assigne la texture dans l'inspecteur du ShaderMaterial. Si c'était un Buffer Shadertoy (multipasse), il faut le recréer avec un SubViewport.`);
      if (r.role === 'channelres') warn(`${n} : Godot ne fournit pas la taille des textures automatiquement; remplis ce tableau dans le script ou utilise textureSize().`);
    }
    if ([...roles.values()].some((r) => r.role === 'channel'))
      info(`Si un iChannel est une texture de bruit de Shadertoy (RGBA Noise), utilise textures/rgba_noise_256.png (ou textures/rgba_noise_64.png). Le canal vert y est le rouge décalé de (37, 17), comme sur Shadertoy. Dans Godot, importe-la en mode Lossless.`);
  }
  if (!canvas) info("Cible 3D : la couleur est écrite dans ALBEDO avec render_mode unshaded. Godot travaille en espace linéaire, les couleurs peuvent paraître plus claires que dans le navigateur.");

  const script = scriptRoles.length ? generateScript(scriptRoles, canvas, language) : null;

  const channelNames = dialect === 'shadertoy'
    ? [...roles].filter(([, r]) => r.role === 'channel').map(([n]) => n).sort()
    : [];
  const channelSteps = channelNames.length
    ? [
        ...channelNames.map((n) => `${n} : dans l'inspecteur, section Shader Parameters, assigne une texture au paramètre « ${n} » (image importée, NoiseTexture2D ou ViewportTexture).`),
        'Pour un Buffer Shadertoy : ajoute un SubViewport contenant un ColorRect avec le shader du buffer, puis assigne sa ViewportTexture au paramètre iChannel correspondant.',
      ]
    : [];

  const setup = canvas
    ? [
        'Ajoute un nœud ColorRect (ou TextureRect) et étire-le à la taille voulue.',
        'Dans Material, crée un nouveau ShaderMaterial et glisse-y le fichier .gdshader.',
        ...(script ? ['Attache le script .gd au même nœud : il met à jour la résolution, la souris et le reste à chaque image.'] : []),
        ...channelSteps,
      ]
    : [
        'Ajoute un MeshInstance3D (un QuadMesh ou PlaneMesh pour un effet plein écran sur une surface).',
        'Dans Material Override, crée un nouveau ShaderMaterial et glisse-y le fichier .gdshader.',
        ...(script ? ['Attache le script .gd au MeshInstance3D pour alimenter la résolution, la souris et le reste.'] : []),
        ...channelSteps,
      ];

  let shader = out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  shader = shader.replace(/[ \t]+$/gm, '');

  return {
    ok: true,
    shader,
    script,
    dialect,
    dialectLabel: DIALECT_LABELS[dialect],
    target,
    messages,
    setup,
  };
}

/* ------------------------------------------------------------------ */
/* Construction d'une étape                                            */
/* ------------------------------------------------------------------ */

function buildStage(ast: Node, kind: StageKind): Stage {
  const st: Stage = {
    kind, ast, globals: new Map(), structs: new Map(), functions: new Map(), prototypes: new Set(),
    otherTop: [], undeclared: new Set(), root: null,
  };
  let order = 0;
  for (const node of ast.program) {
    order++;
    if (node.type === 'preprocessor') continue;
    if (node.type === 'function') {
      const name = node.prototype.header.name.identifier;
      let f = st.functions.get(name);
      if (!f) {
        f = { name, nodes: [], calls: new Set(), refs: new Set(), writes: new Set(), order };
        st.functions.set(name, f);
      }
      f.nodes.push(node);
      continue;
    }
    if (node.type === 'declaration_statement') {
      const d = node.declaration;
      if (d.type === 'precision') continue;
      if (d.type === 'function_prototype') {
        st.prototypes.add(d.header.name.identifier);
        continue;
      }
      if (d.type === 'qualifier_declarator') continue; // invariant gl_Position;
      if (d.type === 'interface_declarator') {
        // Bloc uniform : on aplatit les membres s'il n'y a pas de nom d'instance
        const quals = qualifierTokens(d);
        if (quals.includes('uniform') && !d.identifier) {
          for (const sd of d.declarations) {
            const decl = sd.declaration;
            for (const qi of decl.declarations) {
              const spec = decl.specified_type.specifier;
              st.globals.set(qi.identifier.identifier, {
                name: qi.identifier.identifier, type: typeFromSpecifier(spec) + (qi.quantifier?.length ? '[]' : ''),
                spec: specText(spec), quant: quantText(qi.quantifier), storage: 'uniform', precision: '', interp: '',
                init: null, written: false, usedBy: new Set(), declOrder: order,
              });
            }
          }
        } else if (d.identifier && !d.identifier.quantifier?.length && (quals.includes('in') || quals.includes('out') || quals.includes('uniform'))) {
          // Bloc d'interface nommé (in VertexData { ... } inData;) : les membres deviennent des globales
          const inst = d.identifier.identifier.identifier;
          const members = new Set<string>();
          const storage = quals.includes('uniform') ? 'uniform' : quals.includes('in') ? 'in' : 'out';
          for (const sd of d.declarations) {
            const decl = sd.declaration;
            for (const qi of decl.declarations) {
              const spec = decl.specified_type.specifier;
              const mname = qi.identifier.identifier;
              members.add(mname);
              st.globals.set(mname, {
                name: mname, type: typeFromSpecifier(spec) + (qi.quantifier?.length ? '[]' : ''),
                spec: specText(spec), quant: quantText(qi.quantifier), storage, precision: '', interp: '',
                init: null, written: false, usedBy: new Set(), declOrder: order,
              });
            }
          }
          ((st as any).__blocks ??= new Map()).set(inst, members);
        } else {
          (st as any).__unsupportedBlock = true;
        }
        continue;
      }
      if (d.type === 'declarator_list') {
        const fst = d.specified_type;
        const quals = qualifierTokens(fst);
        const spec = fst.specifier;
        if (spec.specifier?.type === 'struct') {
          const sname = spec.specifier.typeName?.identifier;
          const fields = new Map<string, string>();
          for (const sd of spec.specifier.declarations) {
            const t = typeFromSpecifier(sd.declaration.specified_type.specifier);
            for (const qi of sd.declaration.declarations) fields.set(qi.identifier.identifier, t + (qi.quantifier?.length ? '[]' : ''));
          }
          if (sname) st.structs.set(sname, fields);
          if (!d.declarations.length) {
            st.otherTop.push({ node, order });
            continue;
          }
        }
        let storage: GlobalVar['storage'] = 'none';
        for (const q of ['uniform', 'attribute', 'varying', 'const', 'in', 'out'] as const) if (quals.includes(q)) { storage = q; break; }
        if (quals.includes('inout')) storage = 'none';
        const precision = quals.find((q) => ['highp', 'mediump', 'lowp'].includes(q)) ?? '';
        const interp = quals.find((q) => ['flat', 'smooth'].includes(q)) ?? '';
        for (const decl of d.declarations) {
          const name = decl.identifier.identifier;
          const q = decl.quantifier?.length ? decl.quantifier : null;
          st.globals.set(name, {
            name, type: typeFromSpecifier(spec) + (q ? '[]' : ''), spec: specText(spec.specifier?.type === 'struct' ? { ...spec, specifier: spec.specifier.typeName } : spec),
            quant: quantText(q), storage, precision, interp, init: decl.initializer ?? null, written: false,
            usedBy: new Set(), declOrder: order,
          });
        }
        continue;
      }
    }
    st.otherTop.push({ node, order });
  }
  st.root = st.functions.has('main') ? 'main' : st.functions.has('mainImage') && kind === 'fragment' ? 'mainImage' : null;
  analyzeStage(st);
  return st;
}

function findFragOutput(st: Stage): string | null {
  const outs = [...st.globals.values()].filter((g) => g.storage === 'out');
  if (outs.length) {
    if (outs.length > 1) (st as any).__mrt = outs.slice(1).map((o) => o.name);
    return outs[0].name;
  }
  if (st.undeclared.has('gl_FragColor')) return 'gl_FragColor';
  if (st.root === 'main') return 'gl_FragColor';
  return null;
}

/* ------------------------------------------------------------------ */
/* Parcours avec portées                                               */
/* ------------------------------------------------------------------ */

interface LocalVar {
  type: string;
  newName?: string;
}

interface WalkCtx {
  st: Stage;
  plan: Plan | null; // null = analyse
  scopes: Map<string, LocalVar>[];
  fn: FnInfo | null;
  fnReturn: string | null;
  isRoot: boolean;
  env: TransformEnv | null;
}

interface TransformEnv {
  globalNames: Set<string>;
  warn: (s: string) => void;
  info: (s: string) => void;
  roles: Map<string, { role: Role; type: string }>;
  varyings: Map<string, { type: string; quant: string; interp: string }>;
  dialect: Dialect;
  language: 'en' | 'fr';
}

function lookupLocal(ctx: WalkCtx, name: string): LocalVar | null {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    const v = ctx.scopes[i].get(name);
    if (v) return v;
  }
  return null;
}

const BUILTIN_TYPES: Record<string, string> = {
  gl_FragCoord: 'vec4', gl_FragColor: 'vec4', gl_Position: 'vec4', gl_PointSize: 'float', gl_FrontFacing: 'bool',
  gl_PointCoord: 'vec2', gl_VertexID: 'int', gl_InstanceID: 'int', gl_FragDepth: 'float', isf_FragNormCoord: 'vec2',
  TIME: 'float', PI: 'float', TAU: 'float', E: 'float',
};

function reservedNewName(name: string): string | null {
  return GODOT_RESERVED.has(name) ? name + '_' : null;
}

function declareLocal(ctx: WalkCtx, identNode: Node, type: string) {
  const name = identNode.identifier;
  let nn = ctx.plan ? reservedNewName(name) : null;
  // Godot interdit de masquer une globale (uniform, const, varying) par une locale
  if (ctx.plan && !nn && ctx.env?.globalNames.has(name)) nn = name + '_l';
  ctx.scopes[ctx.scopes.length - 1].set(name, { type, newName: nn ?? undefined });
  if (nn) identNode.identifier = nn;
}

/** Type d'un identifiant global ou intégré. */
function globalType(ctx: WalkCtx, name: string): string | null {
  const g = ctx.st.globals.get(name);
  if (g) return g.type;
  if (BUILTIN_TYPES[name]) return BUILTIN_TYPES[name];
  const r = ROLE_NAMES[name];
  if (r) return r.type.replace(/\[\d+\]$/, '[]');
  const t = THREE_VERTEX_BUILTINS[name];
  if (t) return t.type;
  return null;
}

function analyzeStage(st: Stage) {
  const ctx: WalkCtx = { st, plan: null, scopes: [], fn: null, fnReturn: null, isRoot: false, env: null };
  for (const f of st.functions.values()) {
    for (const node of f.nodes) walkFunction(ctx, f, node);
  }
  // Initialiseurs de globales
  for (const g of st.globals.values()) {
    if (g.init) {
      ctx.scopes = [new Map()];
      ctx.fn = null;
      proc(ctx, g.init);
    }
  }
}

function walkFunction(ctx: WalkCtx, f: FnInfo, node: Node) {
  ctx.fn = f;
  ctx.isRoot = f.name === ctx.st.root;
  ctx.fnReturn = typeFromSpecifier(node.prototype.header.returnType.specifier);
  ctx.scopes = [new Map()];
  const params = node.prototype.parameters ?? [];
  if (params.length === 1 && genTrim(params[0]) === 'void') {
    node.prototype.parameters = [];
    node.prototype.header.lp.whitespace = '';
  }
  for (const p of node.prototype.parameters ?? []) {
    if (!p.identifier) continue;
    if (ctx.plan) p.qualifier = (p.qualifier ?? []).filter((q: Node) => q.token !== 'const');
    declareLocal(ctx, p.identifier, typeFromSpecifier(p.specifier) + (p.quantifier?.length ? '[]' : ''));
  }
  proc(ctx, node.body, true);
  ctx.fn = null;
}

/** Renvoie le type de l'expression (ou null). Applique les transformations en mode plan. */
function proc(ctx: WalkCtx, node: Node, noNewScope = false): string | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) proc(ctx, n);
    return null;
  }
  if (node.__type !== undefined) return node.__type;
  switch (node.type) {
    case 'int_constant':
      return 'int';
    case 'uint_constant':
      return 'uint';
    case 'float_constant':
    case 'double_constant':
      return 'float';
    case 'bool_constant':
      return 'bool';
    case 'literal':
    case 'keyword':
      return null;

    case 'identifier':
      return procIdentifier(ctx, node);

    case 'group': {
      const t = proc(ctx, node.expression);
      return t;
    }

    case 'compound_statement': {
      if (!noNewScope) ctx.scopes.push(new Map());
      for (const s of node.statements) proc(ctx, s);
      if (!noNewScope) ctx.scopes.pop();
      return null;
    }

    case 'for_statement': {
      ctx.scopes.push(new Map());
      proc(ctx, node.init);
      proc(ctx, node.condition);
      proc(ctx, node.operation);
      if (node.body?.type === 'compound_statement') proc(ctx, node.body, true);
      else proc(ctx, node.body);
      ctx.scopes.pop();
      return null;
    }

    case 'while_statement':
    case 'do_statement':
    case 'if_statement': {
      proc(ctx, node.condition);
      proc(ctx, node.body);
      if (node.else) proc(ctx, node.else);
      return null;
    }

    case 'switch_statement': {
      proc(ctx, node.expression);
      for (const c of node.cases) {
        if (c.test) proc(ctx, c.test);
        ctx.scopes.push(new Map());
        for (const s of c.statements) proc(ctx, s);
        ctx.scopes.pop();
      }
      if (ctx.plan && node.cases.length) {
        const last = node.cases[node.cases.length - 1];
        const lastStmt = last.statements[last.statements.length - 1];
        const ends = lastStmt && ['break_statement', 'return_statement', 'continue_statement', 'discard_statement'].includes(lastStmt.type);
        if (!ends) last.statements.push(lit(' break; '));
      }
      return null;
    }

    case 'declaration_statement':
      proc(ctx, node.declaration);
      return null;

    case 'declarator_list': {
      const spec = node.specified_type.specifier;
      const base = typeFromSpecifier(spec);
      if (spec.specifier?.type === 'struct') {
        const sname = spec.specifier.typeName?.identifier;
        const fields = new Map<string, string>();
        for (const sd of spec.specifier.declarations) {
          const t = typeFromSpecifier(sd.declaration.specified_type.specifier);
          for (const qi of sd.declaration.declarations) fields.set(qi.identifier.identifier, t);
        }
        if (sname) ctx.st.structs.set(sname, fields);
      }
      for (const d of node.declarations) {
        const t = base + (d.quantifier?.length ? '[]' : '');
        if (d.quantifier) proc(ctx, d.quantifier);
        if (d.initializer) {
          const it = proc(ctx, d.initializer);
          if (ctx.plan) coerce(d.initializer, it, t);
        }
        declareLocal(ctx, d.identifier, t);
      }
      return null;
    }

    case 'return_statement': {
      if (node.expression) {
        const t = proc(ctx, node.expression);
        if (ctx.plan) coerce(node.expression, t, ctx.fnReturn);
      }
      return null;
    }

    case 'expression_statement': {
      proc(ctx, node.expression);
      // a = 1, b = 2; -> Godot n'accepte pas l'opérateur virgule hors des boucles for
      if (ctx.plan && node.expression?.type === 'binary' && node.expression.operator.literal === ',') {
        const parts: Node[] = [];
        const flat = (n: Node) => {
          if (n.type === 'binary' && n.operator.literal === ',') {
            flat(n.left);
            flat(n.right);
          } else parts.push(n);
        };
        flat(node.expression);
        const trailing = gen(node.semi).match(/\s*$/)?.[0] ?? '';
        const sep = trailing.includes('\n') ? trailing : ' ';
        replaceText(node, parts.map((p) => genTrim(p) + ';').join(sep));
        node.whitespace = trailing;
      }
      return null;
    }

    case 'binary': {
      const op = node.operator.literal;
      const lt = proc(ctx, node.left);
      const rt = proc(ctx, node.right);
      if (op === ',') return rt;
      if (['&&', '||', '^^'].includes(op)) return 'bool';
      if (ctx.plan && ['+', '-', '*', '/', '<', '>', '<=', '>=', '==', '!='].includes(op)) {
        if (isFloatKind(lt) && isIntScalar(rt)) coerce(node.right, rt, 'float');
        else if (isFloatKind(rt) && isIntScalar(lt)) coerce(node.left, lt, 'float');
      }
      // ivec2 & 255 : Godot exige deux vecteurs pour les opérateurs entiers
      if (ctx.plan && ['&', '|', '^', '%', '<<', '>>'].includes(op)) {
        const isIntVec = (t: string | null) => !!t && /^[iu]vec[234]$/.test(t);
        if (isIntVec(lt) && isIntScalar(rt)) {
          replaceText(node.right, `${lt}(${genTrim(node.right)})`, lt);
          return lt;
        }
        if (isIntVec(rt) && isIntScalar(lt)) {
          const text = genTrim(node.left);
          const trailing = gen(node.left).match(/\s*$/)?.[0] ?? '';
          replaceText(node.left, `${rt}(${text})`, rt);
          node.left.whitespace = trailing;
          return rt;
        }
      }
      if (['<', '>', '<=', '>=', '==', '!='].includes(op)) return 'bool';
      if (['<<', '>>', '&', '|', '^', '%'].includes(op)) return lt;
      const lt2 = isIntScalar(lt) && isFloatKind(rt) ? 'float' : lt;
      const rt2 = isIntScalar(rt) && isFloatKind(lt) ? 'float' : rt;
      return arithResult(op, lt2, rt2);
    }

    case 'unary': {
      const t = proc(ctx, node.expression);
      const op = node.operator.literal;
      if (op === '++' || op === '--') markWrite(ctx, node.expression);
      return op === '!' ? 'bool' : t;
    }

    case 'postfix': {
      // inData.v_texcoord -> v_texcoord (membre d'un bloc d'interface aplati)
      const blocks: Map<string, Set<string>> | undefined = (ctx.st as any).__blocks;
      if (blocks && node.expression?.type === 'identifier' && node.postfix?.type === 'field_selection') {
        const members = blocks.get(node.expression.identifier);
        const sel = node.postfix.selection.identifier;
        if (members?.has(sel) && !lookupLocal(ctx, node.expression.identifier)) {
          const ws = node.postfix.selection.whitespace ?? '';
          for (const k of Object.keys(node)) delete node[k];
          node.type = 'identifier';
          node.identifier = sel;
          node.whitespace = ws;
          return proc(ctx, node);
        }
      }
      const bt = proc(ctx, node.expression);
      const pf = node.postfix;
      if (pf?.type === 'field_selection') {
        const sel = pf.selection.identifier;
        if (bt && isVector(bt) && SWIZZLE.test(sel)) return vecOf(scalarOf(bt), sel.length);
        if (bt && ctx.st.structs.has(bt)) return ctx.st.structs.get(bt)!.get(sel) ?? null;
        if (bt === 'float' && SWIZZLE.test(sel)) return vecOf('float', sel.length);
        return null;
      }
      if (pf?.type === 'quantifier') {
        proc(ctx, pf.expression);
        if (!bt) return null;
        if (bt.endsWith('[]')) return bt.slice(0, -2);
        if (isMatrix(bt)) return 'vec' + vecSize(bt.replace(/x\d$/, ''));
        if (isVector(bt)) return scalarOf(bt);
        return null;
      }
      // ++ / --
      markWrite(ctx, node.expression);
      return bt;
    }

    case 'assignment': {
      const lt = proc(ctx, node.left);
      const rt = proc(ctx, node.right);
      markWrite(ctx, node.left);
      if (ctx.plan) {
        const op = node.operator.literal;
        if (op === '=' && lt === 'float') coerce(node.right, rt, 'float');
        else if (['+=', '-=', '*=', '/='].includes(op) && isFloatKind(lt) && isIntScalar(rt)) coerce(node.right, rt, 'float');
      }
      return lt;
    }

    case 'ternary': {
      proc(ctx, node.expression);
      const a = proc(ctx, node.left);
      const b = proc(ctx, node.right);
      if (ctx.plan) {
        if (isFloatKind(a) && isIntScalar(b)) coerce(node.right, b, 'float');
        else if (isFloatKind(b) && isIntScalar(a)) coerce(node.left, a, 'float');
      }
      return isFloatKind(a) ? a : isFloatKind(b) ? b : a ?? b;
    }

    case 'function_call':
      return procCall(ctx, node);

    case 'initializer_list': {
      for (const i of node.initializers) proc(ctx, i);
      return null;
    }

    case 'condition_expression': {
      const t = typeFromSpecifier(node.specified_type.specifier);
      proc(ctx, node.initializer);
      declareLocal(ctx, node.identifier, t);
      return 'bool';
    }

    case 'quantifier':
    case 'array_specifier':
      proc(ctx, node.expression);
      return null;

    case 'type_specifier':
      if (node.quantifier) proc(ctx, node.quantifier);
      return null;

    default: {
      for (const k of Object.keys(node)) {
        if (k === 'type' || k.startsWith('__')) continue;
        const v = node[k];
        if (v && typeof v === 'object') proc(ctx, v);
      }
      return null;
    }
  }
}

function rootIdent(node: Node): Node | null {
  let n = node;
  while (n) {
    if (n.type === 'identifier') return n;
    if (n.type === 'postfix') n = n.expression;
    else if (n.type === 'group') n = n.expression;
    else return null;
  }
  return null;
}

function markWrite(ctx: WalkCtx, target: Node) {
  if (ctx.plan) return;
  const id = rootIdent(target);
  if (!id) return;
  const name = id.__orig ?? id.identifier;
  if (lookupLocal(ctx, name)) return;
  const g = ctx.st.globals.get(name);
  if (g) g.written = true;
  if (ctx.fn) ctx.fn.writes.add(name);
}

function procIdentifier(ctx: WalkCtx, node: Node): string | null {
  const name: string = node.identifier;
  const local = lookupLocal(ctx, name);
  if (local) {
    if (ctx.plan && local.newName) node.identifier = local.newName;
    return local.type;
  }
  const type = globalType(ctx, name);
  if (!ctx.plan) {
    // Analyse
    if (ctx.st.globals.has(name)) {
      ctx.st.globals.get(name)!.usedBy.add(ctx.fn?.name ?? '');
    } else if (!ctx.st.functions.has(name) && !ctx.st.structs.has(name)) {
      ctx.st.undeclared.add(name);
    }
    if (ctx.fn) ctx.fn.refs.add(name);
    return type;
  }
  // Transformation
  const plan = ctx.plan;
  const tv = plan.threads.get(name);
  node.__orig = name;
  if (tv) {
    if (ctx.isRoot && plan.rootInline && tv.kind === 'builtin') node.identifier = tv.expr!;
    else node.identifier = tv.kind === 'output' && ctx.isRoot && plan.stage.root === 'main' ? tv.param : tv.param;
    return type ?? tv.type;
  }
  const m = plan.identMap.get(name);
  if (m) {
    node.identifier = m.text;
    return m.type;
  }
  const g = ctx.st.globals.get(name);
  if (g && (g as any).__newName) node.identifier = (g as any).__newName;
  return type;
}

function procCall(ctx: WalkCtx, node: Node): string | null {
  const args = callArgs(node);
  const types = args.map((a) => proc(ctx, a));
  const id = node.identifier;

  // Le parseur représente souvent un appel de fonction utilisateur comme un type_specifier
  let calleeIdent: Node | null = id.type === 'identifier' ? id : null;
  if (id.type === 'type_specifier' && !id.quantifier?.length && ['identifier', 'type_name'].includes(id.specifier?.type)) {
    const nm = id.specifier.identifier;
    if (!ctx.st.structs.has(nm)) calleeIdent = id.specifier;
  }

  // Constructeurs
  if (id.type === 'type_specifier' && !calleeIdent) {
    const t = typeFromSpecifier(id);
    if (id.quantifier) proc(ctx, id.quantifier);
    if (ctx.plan && isMatrix(t) && !t.endsWith('[]')) regroupMatrix(node, t, args, types, ctx);
    // vec3(vec4) ou float(vec2) : GLSL tronque, Godot exige une sélection explicite
    if (ctx.plan && args.length === 1 && types[0] && isVector(types[0]) && (isVector(t) || ['float', 'int', 'uint', 'bool'].includes(t))) {
      const n = isVector(t) ? vecSize(t) : 1;
      if (vecSize(types[0]) > n) {
        const inner = genTrim(args[0]);
        const sw = 'xyzw'.slice(0, n);
        const needsParens = !/^[\w.]+$/.test(inner);
        const sel = `${needsParens ? '(' + inner + ')' : inner}.${sw}`;
        const sameKind = scalarOf(types[0]) === scalarOf(t);
        replaceText(node, sameKind ? sel : `${t}(${sel})`, t);
      }
    }
    return t;
  }
  if (!calleeIdent) {
    proc(ctx, id);
    return null;
  }
  const name: string = calleeIdent.identifier;

  // Constructeur de struct
  if (ctx.st.structs.has(name)) return name;

  // Fonction utilisateur
  const f = ctx.st.functions.get(name);
  if (f) {
    if (!ctx.plan) {
      if (ctx.fn) ctx.fn.calls.add(name);
      // paramètres out/inout -> écriture
      const def = f.nodes.find((n) => (n.prototype.parameters ?? []).length === args.length) ?? f.nodes[0];
      (def?.prototype.parameters ?? []).forEach((p: Node, i: number) => {
        const qs = (p.qualifier ?? []).map((q: Node) => q.token);
        if ((qs.includes('out') || qs.includes('inout')) && args[i]) markWrite(ctx, args[i]);
      });
    } else {
      const plan = ctx.plan;
      const extra = plan.fnUses.get(name) ?? [];
      if (extra.length) {
        const texts = extra.map((tname) => {
          const tv = plan.threads.get(tname)!;
          if (ctx.isRoot && plan.rootInline && tv.kind === 'builtin') return tv.expr!;
          return tv.param;
        });
        const rp = node.rp;
        rp.literal = (args.length ? ', ' : '') + texts.join(', ') + ')';
      }
      const nn = plan.fnRename.get(name);
      if (nn) calleeIdent.identifier = nn;
    }
    const def = f.nodes.find((n) => (n.prototype.parameters ?? []).length === args.length) ?? f.nodes[0];
    return typeFromSpecifier(def.prototype.header.returnType.specifier);
  }

  // Fonctions ISF
  if (ctx.plan && /^IMG_/.test(name)) {
    const a = args.map((x) => genTrim(x));
    let text: string | null = null;
    if (name === 'IMG_NORM_PIXEL' || name === 'IMG_NORM_PIXEL_RAW') text = `texture(${a[0]}, ${a[1]})`;
    else if (name === 'IMG_PIXEL' || name === 'IMG_PIXEL_RAW') text = `texture(${a[0]}, (${a[1]}) / vec2(textureSize(${a[0]}, 0)))`;
    else if (name === 'IMG_THIS_NORM_PIXEL' || name === 'IMG_THIS_PIXEL') {
      const coord = ctx.plan.threads.has('isf_FragNormCoord') ? ctx.plan.threads.get('isf_FragNormCoord')!.param : 'vec2(UV.x, 1.0 - UV.y)';
      text = `texture(${a[0]}, ${coord})`;
    } else if (name === 'IMG_SIZE') text = `vec2(textureSize(${a[0]}, 0))`;
    if (text) {
      replaceText(node, text, name === 'IMG_SIZE' ? 'vec2' : 'vec4');
      return name === 'IMG_SIZE' ? 'vec2' : 'vec4';
    }
  }

  // Intégrées
  if (ctx.plan) {
    const r = FUNCTION_RENAMES[name];
    if (r) calleeIdent.identifier = r;
  }
  const rt = builtinReturn(name, types);
  if (rt === undefined && !ctx.plan && !KNOWN_BUILTINS.has(name)) ctx.st.undeclared.add(name + '()');
  return rt ?? null;
}

/** mat2(a,b,c,d) -> mat2(vec2(a,b), vec2(c,d)) : Godot exige des colonnes. */
function regroupMatrix(node: Node, t: string, args: Node[], types: (string | null)[], _ctx: WalkCtx) {
  const m = t.match(/^mat(\d)(?:x(\d))?$/);
  if (!m) return;
  const cols = parseInt(m[1], 10);
  const rows = parseInt(m[2] ?? m[1], 10);
  if (args.length <= 1) return;
  const sizes = types.map((x) => (x ? (isMatrix(x) ? -1 : vecSize(x)) : 0));
  if (sizes.some((s) => s <= 0)) return;
  if (args.length === cols && sizes.every((s) => s === rows)) return;
  if (sizes.reduce((a, b) => a + b, 0) !== cols * rows) return;
  const groups: string[] = [];
  let acc: string[] = [];
  let n = 0;
  for (let i = 0; i < args.length; i++) {
    acc.push(genTrim(args[i]));
    n += sizes[i];
    if (n === rows) {
      groups.push(acc.length === 1 && sizes[i] === rows ? acc[0] : `vec${rows}(${acc.join(', ')})`);
      acc = [];
      n = 0;
    } else if (n > rows) return; // chevauchement : on laisse tel quel
  }
  replaceText(node, `${t}(${groups.join(', ')})`, t);
}

/** Convertit une expression entière en flottant si le contexte l'exige. */
function coerce(node: Node, from: string | null, to: string | null) {
  if (!to || !from) return;
  if (!isIntScalar(from)) return;
  if (to !== 'float' && !isFloatKind(to)) return;
  if (to !== 'float' && isVector(to)) {
    // vecN = int : invalide de toute façon, on passe par float()
  }
  toFloat(node);
}

function toFloat(node: Node) {
  if (node.type === 'int_constant' && /^\d+$/.test(node.token)) {
    node.type = 'float_constant';
    node.token = node.token + '.0';
    return;
  }
  if (node.type === 'uint_constant' && /^\d+[uU]$/.test(node.token)) {
    node.type = 'float_constant';
    node.token = node.token.slice(0, -1) + '.0';
    return;
  }
  if (node.type === 'unary' && node.operator.literal === '-' && node.expression.type === 'int_constant' && /^\d+$/.test(node.expression.token)) {
    node.expression.type = 'float_constant';
    node.expression.token += '.0';
    return;
  }
  if (node.type === 'group') {
    toFloat(node.expression);
    return;
  }
  replaceText(node, `float(${genTrim(node)})`, 'float');
}

function isConstExpr(node: Node, st: Stage): boolean {
  let ok = true;
  const check = (n: Node) => {
    if (!ok || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(check);
    if (n.type === 'identifier') {
      const g = st.globals.get(n.identifier);
      if (!g) {
        if (!['PI', 'TAU', 'E'].includes(n.identifier)) ok = false;
      } else if (g.storage !== 'const' && !(g.storage === 'none' && !g.written && g.init && isConstExpr(g.init, st))) ok = false;
      return;
    }
    if (n.type === 'function_call') {
      const id = n.identifier;
      if (id.type === 'identifier') {
        const nm = id.identifier;
        if (st.functions.has(nm) || /^texture|^texel|^IMG_|^dFd|^fwidth/.test(nm)) {
          ok = false;
          return;
        }
      }
      callArgs(n).forEach(check);
      return;
    }
    if (n.type === 'postfix') {
      check(n.expression);
      if (n.postfix?.type === 'quantifier') check(n.postfix.expression);
      return;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && n[k] && typeof n[k] === 'object') check(n[k]);
  };
  check(node);
  return ok;
}

/* ------------------------------------------------------------------ */
/* Transformation d'une étape                                          */
/* ------------------------------------------------------------------ */

function transformStage(plan: Plan, env: TransformEnv) {
  const st = plan.stage;
  const ctx: WalkCtx = { st, plan, scopes: [], fn: null, fnReturn: null, isRoot: false, env };

  // Renommage des globales qui entrent en conflit avec Godot
  for (const g of st.globals.values()) {
    if (g.name in GODOT_CONSTANTS && (g.storage === 'const' || g.storage === 'none') && g.init) {
      const v = parseFloat(genTrim(g.init));
      if (!isNaN(v) && Math.abs(v - GODOT_CONSTANTS[g.name]) < 1e-2) {
        env.info(`Constante « ${g.name} » retirée : Godot la fournit déjà.`);
        g.storage = 'const';
        continue;
      }
    }
    const nn = reservedNewName(g.name);
    if (nn && !env.roles.has(g.name) && !plan.threads.has(g.name)) {
      (g as any).__newName = nn;
      env.info(`« ${g.name} » est réservé dans Godot : renommé en « ${nn} ».`);
      if (g.name in GODOT_CONSTANTS) g.storage = 'const';
    }
  }

  // Initialiseurs de constantes
  for (const g of st.globals.values()) {
    if (g.storage === 'const' && g.init) {
      ctx.scopes = [new Map()];
      ctx.fn = null;
      ctx.isRoot = false;
      const t = proc(ctx, g.init);
      coerce(g.init, t, g.type);
    }
  }

  for (const f of st.functions.values()) {
    const nn = reservedNewName(f.name);
    if (nn && f.name !== st.root) plan.fnRename.set(f.name, nn);
  }

  for (const f of st.functions.values()) {
    for (const node of f.nodes) {
      walkFunction(ctx, f, node);
      const isRoot = f.name === st.root;
      const extra = plan.fnUses.get(f.name) ?? [];
      const header = node.prototype.header;

      // Renommage
      const nn = plan.fnRename.get(f.name);
      if (nn) header.name.identifier = nn;

      if (isRoot && plan.rootInline) {
        header.name.identifier = 'vertex';
        node.prototype.parameters = [];
        node.prototype.commas = [];
        node.prototype.rp.literal = ')';
        if (header.returnType.specifier.specifier.token !== 'void') env.warn('La fonction main() du vertex shader ne retourne pas void.');
        hasReturn(node.body) &&
          env.warn("Le vertex shader utilise « return » dans main() : Godot l'interdit dans vertex(). Restructure avec des if/else.");
        insertLocals(node, plan, extra, env.language);
        continue;
      }

      if (isRoot && st.root === 'main' && st.kind === 'fragment') {
        header.name.identifier = '_glsl_main';
      }

      // Paramètres supplémentaires
      const params: string[] = [];
      for (const tname of extra) {
        const tv = plan.threads.get(tname)!;
        if (isRoot && (tv.kind === 'global' || tv.kind === 'varying')) continue; // déclarée en local dans la racine
        params.push(`${tv.qual} ${tv.type} ${tv.param}${tv.quant}`);
      }
      if (params.length) {
        const hasParams = (node.prototype.parameters ?? []).length > 0;
        node.prototype.rp.literal = (hasParams ? ', ' : '') + params.join(', ') + ')';
      }
      if (isRoot) insertLocals(node, plan, extra, env.language);
    }
  }

  if ((st as any).__unsupportedBlock)
    env.warn('Les blocs uniform nommés (uniform Bloc { ... } nom;) ne sont pas supportés par Godot : déclare chaque membre comme uniform séparé.');
  if ((st as any).__mrt) env.warn(`Sorties multiples (${(st as any).__mrt.join(', ')}) ignorées : Godot n'écrit qu'une couleur.`);
  for (const name of st.undeclared) {
    if (name.endsWith('()')) {
      const fn = name.slice(0, -2);
      if (!FUNCTION_RENAMES[fn] && !/^IMG_/.test(fn))
        env.warn(`Fonction « ${fn} » inconnue : elle n'est pas définie dans le shader ni intégrée à GLSL. Vérifie si elle venait d'un #include ou d'une macro.`);
    }
  }
  const knownUndeclared = (n: string) =>
    n.endsWith('()') || BUILTIN_TYPES[n] || ROLE_NAMES[n] || plan.threads.has(n) || plan.identMap.has(n) || THREE_VERTEX_BUILTINS[n] || THREE_FRAGMENT_BUILTINS[n] || n === 'gl_FragData';
  for (const name of st.undeclared) {
    if (knownUndeclared(name) || env.globalNames.has(name)) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(name))
      env.warn(`« ${name} » n'est pas défini : c'est probablement une constante fournie par l'application (par exemple les defines de three.js). Ajoute « #define ${name} valeur » en haut du shader.`);
    else env.warn(`Identifiant « ${name} » non déclaré : il doit venir de l'application d'origine. Déclare-le comme uniform dans Godot.`);
  }
}

function insertLocals(node: Node, plan: Plan, extra: string[], language: 'en' | 'fr') {
  const lines: string[] = [];
  const epilogue: string[] = [];
  for (const tname of extra) {
    const tv = plan.threads.get(tname)!;
    if (tv.kind === 'varying') {
      lines.push(`${tv.type} ${tv.param}${tv.quant};`);
      epilogue.push(`${tv.name} = ${tv.param};`);
      continue;
    }
    if (tv.kind !== 'global') continue;
    const g = plan.stage.globals.get(tname)!;
    const init = g.init ? ' = ' + genTrim(g.init) : '';
    lines.push(`${tv.type} ${tv.param}${tv.quant}${init};`);
  }
  if (epilogue.length) {
    const ws = String([node.body.lb?.whitespace ?? ''].flat().join(''));
    const indent = ws.includes('\n') ? ws.slice(ws.lastIndexOf('\n') + 1) : ' ';
    const comment = language === 'fr' ? 'copie des varyings calculés dans les fonctions' : 'copy varyings computed in helper functions';
    node.body.statements.push(lit(`\n${indent}// ${comment}\n${indent}` + epilogue.join(`\n${indent}`) + '\n'));
  }
  // Globales utilisées par la racine mais pas dans extra (référencées seulement par la racine)
  if (lines.length) {
    const ws = String([node.body.lb?.whitespace ?? ''].flat().join(''));
    const indent = ws.includes('\n') ? '\n' + ws.slice(ws.lastIndexOf('\n') + 1) : ' ';
    node.body.statements.unshift(lit(lines.join(indent) + indent));
  }
}

function hasReturn(n: Node): boolean {
  if (!n || typeof n !== 'object') return false;
  if (Array.isArray(n)) return n.some(hasReturn);
  if (n.type === 'return_statement') return true;
  return Object.keys(n).some((k) => k !== 'type' && hasReturn(n[k]));
}

/* ------------------------------------------------------------------ */
/* Aides d'émission                                                    */
/* ------------------------------------------------------------------ */

function splitType(t: string): { spec: string; quant: string } {
  const m = t.match(/^(\w+)(\[\d*\])?$/);
  if (!m) return { spec: t, quant: '' };
  return { spec: m[1], quant: m[2] ?? '' };
}

/** Convertit une expression Godot de type `from` vers le type GLSL déclaré `to`. */
function convertVec(expr: string, from: string, to: string): string {
  if (from === to) return expr;
  const fs = vecSize(from);
  const ts = vecSize(to);
  if (!to.startsWith('vec') && to !== 'float') return expr;
  if (ts < fs) return `${expr}.${'xyzw'.slice(0, ts)}`;
  const pad = ['0.0', '0.0', '0.0', '1.0'].slice(fs, ts);
  return `${to}(${expr}, ${pad.join(', ')})`;
}

function uniformDecl(g: GlobalVar): string {
  let hint = '';
  if (/^sampler(2D|3D|Cube|2DArray)$/.test(g.spec)) hint = g.spec === 'sampler2D' ? ' : repeat_enable, filter_linear_mipmap' : '';
  else if ((g.spec === 'vec3' || g.spec === 'vec4') && !g.quant && /colou?r|tint/i.test(g.name)) hint = ' : source_color';
  const init = g.init ? ' = ' + genTrim(g.init) : '';
  const name = (g as any).__newName ?? g.name;
  return `uniform ${g.spec} ${name}${g.quant}${hint}${init};`;
}

function isfUniform(inp: any): string | null {
  const name = inp.NAME;
  if (!name) return null;
  const f = (v: any) => {
    const n = Number(v);
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  };
  const vec = (arr: any[], n: number) => `vec${n}(${arr.slice(0, n).map(f).join(', ')})`;
  switch (inp.TYPE) {
    case 'float': {
      const range = inp.MIN !== undefined && inp.MAX !== undefined ? ` : hint_range(${f(inp.MIN)}, ${f(inp.MAX)})` : '';
      return `uniform float ${name}${range}${inp.DEFAULT !== undefined ? ' = ' + f(inp.DEFAULT) : ''};`;
    }
    case 'long':
      return `uniform int ${name}${inp.DEFAULT !== undefined ? ' = ' + Math.round(inp.DEFAULT) : ''};`;
    case 'bool':
    case 'event':
      return `uniform bool ${name}${inp.DEFAULT !== undefined ? ' = ' + (inp.DEFAULT ? 'true' : 'false') : ''};`;
    case 'color':
      return `uniform vec4 ${name} : source_color${Array.isArray(inp.DEFAULT) ? ' = ' + vec(inp.DEFAULT, 4) : ''};`;
    case 'point2D':
      return `uniform vec2 ${name}${Array.isArray(inp.DEFAULT) ? ' = ' + vec(inp.DEFAULT, 2) : ''};`;
    case 'image':
    case 'audio':
    case 'audioFFT':
      return `uniform sampler2D ${name} : repeat_enable, filter_linear_mipmap;`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Préprocesseur : aides                                               */
/* ------------------------------------------------------------------ */

/**
 * Retire les commentaires à la fin des #define. Sinon le préprocesseur colle
 * le commentaire à chaque utilisation de la macro, et « x * MACRO; » devient
 * « x * 0.38 // commentaire; » : le point-virgule disparaît dans le commentaire.
 */
export function stripDefineComments(src: string): string {
  const lines = src.split('\n');
  let inDefine = false;
  for (let i = 0; i < lines.length; i++) {
    if (!inDefine && !/^\s*#\s*define\b/.test(lines[i])) continue;
    lines[i] = lines[i].replace(/\/\*.*?\*\//g, ' ').replace(/\/\/.*$/, '').replace(/\s+$/, '');
    inDefine = lines[i].endsWith('\\');
  }
  return lines.join('\n');
}

const normLine = (l: string) => l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
const words = (l: string) => new Set(l.match(/\w+/g) ?? []);

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Associe une ligne du code préprocessé à la ligne d'origine (index à partir de 0). */
export function mapLine(pre: string[], orig: string[], target: number): number {
  let cursor = 0;
  for (let p = 0; p <= target && p < pre.length; p++) {
    const n = normLine(pre[p]);
    let best = -1;
    let score = 0;
    if (n) {
      for (let k = cursor; k < Math.min(orig.length, cursor + 80); k++) {
        const o = normLine(orig[k]);
        if (!o || /^#/.test(o)) continue;
        const sc = similarity(n, o);
        if (sc > score) {
          score = sc;
          best = k;
          if (sc === 1) break;
        }
      }
    }
    const found = best >= 0 && score >= 0.5;
    if (p === target) return found ? best : Math.min(cursor + (target - p), orig.length - 1);
    if (found) cursor = best + 1;
  }
  return Math.min(target, orig.length - 1);
}
