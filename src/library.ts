export interface SavedShader {
  id: string;
  name: string;
  date: number;
  f: string;
  v: string;
  hv: boolean;
  t: string;
}

const KEY = 'glsl2godot-library';

export function loadLibrary(): SavedShader[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Retourne false si le stockage est plein ou indisponible. */
function store(list: SavedShader[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function saveShader(entry: Omit<SavedShader, 'id' | 'date'>): boolean {
  const item: SavedShader = { ...entry, id: crypto.randomUUID(), date: Date.now() };
  return store([item, ...loadLibrary()]);
}

export function deleteShader(id: string): void {
  store(loadLibrary().filter((s) => s.id !== id));
}
