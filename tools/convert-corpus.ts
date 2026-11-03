// Convertit tous les shaders de tests/corpus vers tests/out (utilisé par la CI et les tests).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { convert } from '../src/converter';

const dir = process.argv[2] ?? 'tests/corpus';
const out = process.argv[3] ?? 'tests/out';
mkdirSync(out, { recursive: true });
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.glsl')).sort()) {
  const name = basename(f, '.glsl');
  const fragment = readFileSync(join(dir, f), 'utf8');
  const vpath = join(dir, name + '.vert');
  const vertex = existsSync(vpath) ? readFileSync(vpath, 'utf8') : undefined;
  const r = convert({ fragment, vertex });
  const msgs = r.messages.map((m) => `  [${m.level}] ${m.text}`).join('\n');
  console.log(`== ${name} (${r.dialectLabel}, ${r.target}) ${r.ok ? 'OK' : 'ÉCHEC'}\n${msgs}`);
  if (!r.ok) { failed++; continue; }
  writeFileSync(join(out, name + '.gdshader'), r.shader);
  if (r.script) writeFileSync(join(out, name + '.gd'), r.script);
}
process.exit(failed ? 1 : 0);
