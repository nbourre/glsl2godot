# GLSL vers Godot

Convertisseur web de shaders GLSL vers le langage de shader de **Godot 4**. On colle un shader venant de n'importe où, on obtient un `.gdshader` prêt à utiliser, plus un petit script GDScript quand le shader a besoin de la résolution, de la souris ou d'autres valeurs fournies par l'application d'origine.

Tout se passe dans le navigateur : aucun serveur, aucun envoi de code.

## Sources reconnues

| Source | Détection | Ce qui est converti |
|---|---|---|
| Shadertoy | `mainImage()` | `iTime`, `iResolution`, `iMouse`, `iFrame`, `iDate`, `iTimeDelta`, `iChannel0..3` |
| GLSL Sandbox | uniforms `time`, `resolution`, `mouse` | souris normalisée, `gl_FragColor`, `gl_FragCoord` |
| The Book of Shaders / glslCanvas | uniforms `u_time`, `u_resolution`, `u_mouse` | idem, `u_tex0` etc. restent des uniforms |
| ISF | en-tête JSON `/*{ ... }*/` | `INPUTS` deviennent des uniforms avec `hint_range` et `source_color`, `IMG_NORM_PIXEL`, `IMG_PIXEL`, `isf_FragNormCoord` |
| three.js (ShaderMaterial) | `projectionMatrix`, `modelViewMatrix`... | attributs, matrices, varyings, fonctions de `<common>`, `<packing>` et de l'espace couleur |
| WebGL / OpenGL brut | le reste | `#version 300 es`, `#version 330`, `in`/`out`, `layout`, blocs d'interface, matrices nommées (`uMVP`, `model`, `view`...) |

## Transformations appliquées

Le code est analysé avec un vrai parseur GLSL ([@shaderfrog/glsl-parser](https://github.com/ShaderFrog/glsl-parser)), puis transformé sur l'arbre syntaxique :

- `main()` / `mainImage()` deviennent des fonctions appelées depuis `fragment()`, puisque Godot interdit `return` dans `fragment()`.
- Les fonctions sont réordonnées (Godot exige qu'une fonction soit définie avant d'être appelée) et les prototypes retirés.
- Les globales modifiables, interdites dans Godot, sont transformées en variables locales passées en paramètres `inout` à travers le graphe d'appels. Celles qui ne changent jamais deviennent `const`.
- Les conversions implicites `int` → `float` refusées par Godot sont corrigées (`x * 2` → `x * 2.0`), sans changer le sens des divisions entières (`1 / 2` → `float(1 / 2)`).
- `mat2(a, b, c, d)` devient `mat2(vec2(a, b), vec2(c, d))`, `vec3(unVec4)` devient `unVec4.xyz`.
- `texture2D`, `textureCube`... sont renommées, `precision`, `#version` et `#extension` sont retirés, les macros sont développées.
- Les noms réservés par Godot (`instance`, `COLOR`, `TIME`, `PI`...) et les variables locales qui masquent une globale sont renommés.
- Le dernier `case` d'un `switch` reçoit un `break`, les instructions avec virgule (`a = 1, b = 2;`) sont séparées.
- Les varyings écrits dans des fonctions du vertex shader passent par des variables temporaires recopiées à la fin de `vertex()`.

Chaque conversion affiche ce qui demande une vérification : textures à assigner, `#define` fournis par l'application, récursion (interdite dans Godot), passes multiples, etc.

## Limites connues

- **Multipasse** (Buffers Shadertoy, `PASSES` ISF) : il faut recréer chaque passe avec un `SubViewport`.
- **Récursion** : Godot l'interdit, la fonction doit être réécrite en boucle.
- **Defines fournis par l'application** (les `defines` d'un ShaderMaterial three.js) : il faut les ajouter en haut du shader (`#define SAMPLES 16`).
- **Couleurs en 3D** : Godot travaille en espace linéaire, un shader écrit pour le navigateur peut paraître plus clair sur une cible `spatial`.

## Développement

```bash
npm install
npm run dev        # serveur local
npm test           # tests unitaires (vitest)
npm run build      # site statique dans dist/
```

### Valider avec le vrai compilateur de Godot

Le dossier `tests/corpus` contient des shaders de chaque source. Le script suivant les convertit puis les compile avec Godot en mode headless, et échoue si un seul ne compile pas :

```bash
tools/check.sh /chemin/vers/Godot_v4.5.1-stable_linux.x86_64
```

Les fichiers nommés `expect-fail_*` doivent échouer (par exemple la récursion). Pour ajouter un cas, dépose un `.glsl` (et un `.vert` du même nom si le shader a un vertex shader) dans `tests/corpus`.

## Déploiement sur GitHub Pages

1. Pousse le dépôt sur GitHub.
2. Dans **Settings → Pages**, choisis **GitHub Actions** comme source.
3. Chaque push sur `main` lance `.github/workflows/deploy.yml` (tests, build, publication). Le workflow `godot.yml` valide le corpus avec Godot à chaque push et pull request.

## Licence

MIT
