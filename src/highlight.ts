// Coloration syntaxique minimale pour le langage de shader de Godot.

const KEYWORDS = new Set([
  'shader_type', 'render_mode', 'uniform', 'varying', 'const', 'in', 'out', 'inout', 'flat', 'smooth', 'struct',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'discard',
  'lowp', 'mediump', 'highp', 'true', 'false', 'canvas_item', 'spatial', 'unshaded',
  'extends', 'func', 'var', 'not', 'and', 'or', 'pass', 'elif',
]);
const TYPES = /^(void|bool|int|uint|float|[biu]?vec[234]|mat[234](x[234])?|sampler(2D|3D|Cube|2DArray)|isampler2D|usampler2D|Vector[234]|ShaderMaterial)$/;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(code: string): string {
  const re = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(\b\d+\.?\d*(?:e[+-]?\d+)?[uf]?\b|\.\d+(?:e[+-]?\d+)?\b)|([A-Za-z_]\w*)|([\s\S])/g;
  let out = '';
  let m: RegExpExecArray | null;
  let gd = false;
  if (/^@tool|^extends /m.test(code)) gd = true;
  while ((m = re.exec(code))) {
    const [tok, comment, str, num, word] = m;
    if (comment) {
      // en GDScript, # est un commentaire; en shader, c'est une directive
      out += `<span class="tk-c">${esc(comment)}</span>`;
    } else if (str) out += `<span class="tk-s">${esc(str)}</span>`;
    else if (num) out += `<span class="tk-n">${esc(num)}</span>`;
    else if (word) {
      if (KEYWORDS.has(word)) out += `<span class="tk-k">${word}</span>`;
      else if (TYPES.test(word)) out += `<span class="tk-t">${word}</span>`;
      else if (/^[A-Z][A-Z0-9_]{1,}$/.test(word) && !gd) out += `<span class="tk-b">${word}</span>`;
      else if (/^(hint_\w+|source_color|repeat_\w+|filter_\w+)$/.test(word)) out += `<span class="tk-h">${word}</span>`;
      else out += esc(word);
    } else out += esc(tok);
  }
  return out;
}
