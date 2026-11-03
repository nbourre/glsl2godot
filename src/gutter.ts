// Numéros de ligne pour les zones de texte et le code généré.

export interface Gutter {
  update(): void;
  setError(line: number | null): void;
}

function renderNumbers(el: HTMLElement, count: number, error: number | null) {
  const parts: string[] = [];
  for (let i = 1; i <= count; i++) parts.push(i === error ? `<span class="ln-err">${i}</span>` : String(i));
  el.innerHTML = parts.join('\n');
}

const lineCount = (s: string) => {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
};

/** Ajoute une colonne de numéros à gauche d'un textarea, synchronisée au défilement. */
export function numberTextarea(ta: HTMLTextAreaElement): Gutter {
  const wrap = document.createElement('div');
  wrap.className = 'numbered';
  const gutter = document.createElement('div');
  gutter.className = 'gutter';
  gutter.setAttribute('aria-hidden', 'true');
  ta.parentElement!.insertBefore(wrap, ta);
  wrap.append(gutter, ta);
  let count = 0;
  let error: number | null = null;
  const sync = () => {
    gutter.scrollTop = ta.scrollTop;
  };
  const update = () => {
    const n = lineCount(ta.value);
    if (n !== count) {
      count = n;
      renderNumbers(gutter, count, error);
    }
    sync();
  };
  ta.addEventListener('input', update);
  ta.addEventListener('scroll', sync);
  update();
  return {
    update,
    setError(line) {
      if (line === error) return;
      error = line;
      renderNumbers(gutter, count, error);
    },
  };
}

/** Numéros pour un bloc <pre><code> : la colonne est dans le même conteneur de défilement. */
export function numberCode(code: HTMLElement): { update(text: string): void } {
  const pre = code.parentElement!;
  pre.classList.add('numbered-pre');
  const gutter = document.createElement('span');
  gutter.className = 'gutter';
  gutter.setAttribute('aria-hidden', 'true');
  pre.insertBefore(gutter, code);
  return {
    update(text: string) {
      renderNumbers(gutter, text ? lineCount(text.replace(/\n$/, '')) : 0, null);
    },
  };
}

/** Ligne d'erreur dans un message de syntaxe (« line 12 » ou « ligne 12 »). */
export function errorLine(message: string): number | null {
  const m = message.match(/\b(?:line|ligne) (\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
