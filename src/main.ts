import './style.css';
import { convert, ConvertResult, Target } from './converter';
import { EXAMPLES } from './examples';
import { highlight } from './highlight';
import { applyStaticTranslations, dialectLabel, Language, text, translateConversionText } from './i18n';
import { Preview } from './preview';
import { errorLine, numberCode, numberTextarea } from './gutter';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const fragment = $<HTMLTextAreaElement>('fragment');
const vertex = $<HTMLTextAreaElement>('vertex');
const vertexWrap = $('vertex-wrap');
const hasVertex = $<HTMLInputElement>('has-vertex');
const target = $<HTMLSelectElement>('target');
const example = $<HTMLSelectElement>('example');
const code = $('code');
const dialect = $('dialect');
const messages = $('messages');
const setup = $('setup');
const tabShader = $<HTMLButtonElement>('tab-shader');
const tabScript = $<HTMLButtonElement>('tab-script');
const copyStatus = $('copy-status');
const previewStatus = $('preview-status');
const fragmentGutter = numberTextarea(fragment);
const vertexGutter = numberTextarea(vertex);
const codeGutter = numberCode(code);
const languageSelect = $<HTMLSelectElement>('language');

let result: ConvertResult | null = null;
let tab: 'shader' | 'script' = 'shader';
let language: Language = 'en';
try {
  const savedLanguage = localStorage.getItem('glsl2godot-language');
  if (savedLanguage === 'fr' || savedLanguage === 'en') language = savedLanguage;
} catch {
  // Language preference storage is optional.
}
languageSelect.value = language;
applyStaticTranslations(language);

/* ---------- Aperçu ---------- */
const preview = new Preview($<HTMLCanvasElement>('preview'));
preview.onStatus = (ok, msg) => {
  previewStatus.textContent = msg;
  document.body.classList.toggle('no-preview', !ok);
};

/** Transforme les chemins textures/*.png d'un message en liens de téléchargement. */
function linkify(msg: string): (string | Node)[] {
  const out: (string | Node)[] = [];
  let last = 0;
  for (const m of msg.matchAll(/textures\/[\w.-]+\.png/g)) {
    out.push(msg.slice(last, m.index));
    const a = document.createElement('a');
    a.href = m[0];
    a.download = m[0].split('/').pop()!;
    a.textContent = a.download;
    out.push(a);
    last = m.index! + m[0].length;
  }
  out.push(msg.slice(last));
  return out;
}

/* ---------- Conversion ---------- */
function run() {
  const vtx = hasVertex.checked ? vertex.value : '';
  result = convert({ fragment: fragment.value, vertex: vtx, target: target.value as Target, language });
  dialect.textContent = result.ok && (fragment.value.trim() || vtx.trim())
    ? text('detected', language).replace('{dialect}', dialectLabel(result.dialect, language))
    : '';
  tabScript.hidden = !result.script;
  if (!result.script && tab === 'script') setTab('shader');
  renderCode();
  renderMessages();
  // Erreur de syntaxe : on marque la ligne dans la bonne zone de texte
  const err = !result.ok ? result.messages.find((m) => m.level === 'error') : undefined;
  const line = err ? errorLine(err.text) : null;
  const inVertex = !!err && /vertex/i.test(err.text);
  fragmentGutter.setError(inVertex ? null : line);
  vertexGutter.setError(inVertex ? line : null);
  saveDraft();
}

function renderCode() {
  if (!result) return;
  if (!result.ok) {
    code.innerHTML = '';
    codeGutter.update('');
    code.parentElement!.classList.add('empty');
    code.parentElement!.setAttribute('data-empty-text', text('emptyCode', language));
    return;
  }
  code.parentElement!.classList.remove('empty');
  code.parentElement!.removeAttribute('data-empty-text');
  const output = tab === 'script' && result.script ? result.script : result.shader;
  code.innerHTML = highlight(output);
  codeGutter.update(output);
}

function renderMessages() {
  messages.innerHTML = '';
  setup.innerHTML = '';
  if (!result) return;
  const list = result.messages.length
    ? result.messages
    : result.ok
      ? [{ level: 'info' as const, text: text('nothingToReport', language) }]
      : [];
  const order = { error: 0, warning: 1, info: 2 };
  for (const m of [...list].sort((a, b) => order[a.level] - order[b.level])) {
    const li = document.createElement('li');
    li.className = 'msg msg-' + m.level;
    const tag = document.createElement('strong');
    tag.textContent = m.level === 'error' ? text('error', language) : m.level === 'warning' ? text('check', language) : text('note', language);
    li.append(tag, ' ', ...linkify(translateConversionText(m.text, language)));
    messages.append(li);
  }
  for (const s of result.setup) {
    const li = document.createElement('li');
    li.textContent = translateConversionText(s, language);
    setup.append(li);
  }
}

let timer = 0;
let previewTimer = 0;
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(run, 150);
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => preview.load(fragment.value, language), 500);
}

/* ---------- Onglets ---------- */
function setTab(t: 'shader' | 'script') {
  tab = t;
  tabShader.setAttribute('aria-selected', String(t === 'shader'));
  tabScript.setAttribute('aria-selected', String(t === 'script'));
  renderCode();
}
tabShader.addEventListener('click', () => setTab('shader'));
tabScript.addEventListener('click', () => setTab('script'));
for (const t of [tabShader, tabScript]) {
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = t === tabShader && !tabScript.hidden ? tabScript : tabShader;
      next.focus();
      setTab(next === tabShader ? 'shader' : 'script');
    }
  });
}

/* ---------- Copier / télécharger ---------- */
const currentText = () => (result?.ok ? (tab === 'script' && result.script ? result.script : result.shader) : '');
const currentName = () => (tab === 'script' && result?.script ? 'shader_params.gd' : 'shader.gdshader');

function flash(msg: string) {
  copyStatus.textContent = msg;
  clearTimeout((flash as any).t);
  (flash as any).t = setTimeout(() => (copyStatus.textContent = ''), 2200);
}

$('copy').addEventListener('click', async () => {
  const text = currentText();
  if (!text) return flash(windowText('nothingToCopy'));
  try {
    await navigator.clipboard.writeText(text);
    flash(windowText('copied').replace('{file}', currentName()));
  } catch {
    const r = document.createRange();
    r.selectNodeContents(code);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(r);
    flash(windowText('selectedCopy'));
  }
});

$('download').addEventListener('click', () => {
  const text = currentText();
  if (!text) return flash(windowText('nothingToDownload'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = currentName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flash(windowText('downloaded').replace('{file}', currentName()));
});

/* ---------- Partage par lien ---------- */
async function encode(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if ('CompressionStream' in window) {
    const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = new Uint8Array(await new Response(s).arrayBuffer());
    return 'z' + b64(buf);
  }
  return 'j' + b64(bytes);
}
async function decode(str: string): Promise<any> {
  const bytes = unb64(str.slice(1));
  if (str[0] === 'z') {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(s).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

$('share').addEventListener('click', async () => {
  const data = { f: fragment.value, v: hasVertex.checked ? vertex.value : '', t: target.value };
  const hash = await encode(data);
  const url = `${location.origin}${location.pathname}#s=${hash}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    flash(windowText('shareCopied'));
  } catch {
    flash(windowText('shareReady'));
  }
});

function windowText(key: Parameters<typeof text>[0]): string {
  return text(key, language);
}

/* ---------- Brouillon ---------- */
function saveDraft() {
  try {
    localStorage.setItem('glsl2godot', JSON.stringify({ f: fragment.value, v: vertex.value, hv: hasVertex.checked, t: target.value }));
  } catch {
    /* stockage indisponible */
  }
}

function applyState(s: { f?: string; v?: string; hv?: boolean; t?: string }) {
  fragment.value = s.f ?? '';
  vertex.value = s.v ?? '';
  hasVertex.checked = !!(s.hv ?? s.v);
  vertexWrap.hidden = !hasVertex.checked;
  if (s.t) target.value = s.t;
  fragmentGutter.update();
  vertexGutter.update();
}

/* ---------- Exemples ---------- */
for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.id;
  o.textContent = ex.label;
  example.append(o);
}
example.addEventListener('change', () => {
  const ex = EXAMPLES.find((e) => e.id === example.value);
  if (!ex) return;
  applyState({ f: ex.fragment, v: ex.vertex ?? '', hv: !!ex.vertex, t: 'auto' });
  example.value = '';
  run();
  preview.load(fragment.value, language);
});

/* ---------- Événements ---------- */
fragment.addEventListener('input', schedule);
vertex.addEventListener('input', schedule);
target.addEventListener('change', run);
languageSelect.addEventListener('change', () => {
  language = languageSelect.value === 'fr' ? 'fr' : 'en';
  applyStaticTranslations(language);
  try {
    localStorage.setItem('glsl2godot-language', language);
  } catch {
    // Language preference storage is optional.
  }
  run();
  preview.load(fragment.value, language);
});
hasVertex.addEventListener('change', () => {
  vertexWrap.hidden = !hasVertex.checked;
  run();
});
for (const ta of [fragment, vertex]) {
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // tabulation dans l'éditeur; Échap puis Tab pour sortir
      if ((ta as any).escaped) return;
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b, value } = ta;
      ta.value = value.slice(0, a) + '\t' + value.slice(b);
      ta.selectionStart = ta.selectionEnd = a + 1;
      schedule();
    }
    (ta as any).escaped = e.key === 'Escape';
  });
}

/* ---------- Démarrage ---------- */
(async () => {
  const m = location.hash.match(/#s=([\w-]+)/);
  let loaded = false;
  if (m) {
    try {
      const s = await decode(m[1]);
      applyState({ f: s.f, v: s.v, hv: !!s.v, t: s.t });
      loaded = true;
    } catch {
      flash(windowText('invalidShare'));
    }
  }
  if (!loaded) {
    try {
      const d = JSON.parse(localStorage.getItem('glsl2godot') ?? 'null');
      if (d?.f?.trim()) {
        applyState(d);
        loaded = true;
      }
    } catch {
      /* rien */
    }
  }
  if (!loaded) applyState({ f: EXAMPLES[0].fragment });
  run();
  preview.load(fragment.value, language);
})();
