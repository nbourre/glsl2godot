import type { Dialect } from './converter/dialects';

export type Language = 'en' | 'fr';

const translations = {
  en: {
    pageTitle: 'GLSL to Godot',
    pageDescription: 'Convert a GLSL shader (Shadertoy, GLSL Sandbox, Book of Shaders, ISF, three.js, OpenGL) to a Godot 4 shader, right in your browser.',
    brandSubtitle: 'Paste a shader from anywhere and get a .gdshader ready for Godot 4.',
    share: 'Copy share link',
    source: 'Source code',
    report: 'Report a bug',
    previewSection: 'Original shader preview',
    previewCanvas: 'Live render of the pasted shader',
    previewLoading: 'Loading preview…',
    sourceShader: 'Your GLSL shader',
    exampleLabel: 'Example',
    chooseExample: 'Choose…',
    targetLabel: 'Target',
    automatic: 'Automatic',
    vertexSeparate: 'Separate vertex shader',
    vertexShader: 'Vertex shader',
    fragmentShader: 'Fragment shader',
    fragmentPlaceholder: 'Paste a Shadertoy, GLSL Sandbox, Book of Shaders, ISF, three.js or OpenGL shader here.',
    godotOutput: 'For Godot 4',
    generatedFiles: 'Generated files',
    copy: 'Copy',
    download: 'Download',
    conversionResult: 'Conversion result',
    thingsToKnow: 'Things to know',
    setupGodot: 'Set up in Godot',
    privacy: 'Conversion happens entirely in your browser: your code is never sent anywhere. Tested with Godot 4.5.',
    language: 'Language',
    emptyCode: 'Fix the error below to see the result.',
    detected: 'Detected: {dialect}',
    nothingToReport: 'Nothing to report: conversion is straightforward.',
    error: 'Error',
    check: 'Check',
    note: 'Note',
    nothingToCopy: 'Nothing to copy yet.',
    copied: '{file} copied.',
    selectedCopy: 'Text selected: press Ctrl+C.',
    nothingToDownload: 'Nothing to download yet.',
    downloaded: '{file} downloaded.',
    shareCopied: 'Share link copied.',
    shareReady: 'Link ready in the address bar.',
    invalidShare: 'The share link is invalid.',
    save: 'Save',
    savedTitle: 'Saved shaders',
    close: 'Close',
    historyButton: 'Saved shaders ({count})',
    savedHint: 'Stored in this browser only.',
    savedEmpty: 'No saved shaders yet.',
    open: 'Open',
    delete: 'Delete',
    savePrompt: 'Name for this shader:',
    defaultName: 'Shader',
    saved: 'Shader saved.',
    saveFailed: 'Could not save: browser storage is full or unavailable.',
    nothingToSave: 'Nothing to save yet.',
    confirmDelete: 'Delete “{name}”?',
    opened: '“{name}” opened.',
  },
  fr: {
    pageTitle: 'GLSL vers Godot',
    pageDescription: 'Convertis un shader GLSL (Shadertoy, GLSL Sandbox, Book of Shaders, ISF, three.js, OpenGL) en shader Godot 4, directement dans le navigateur.',
    brandSubtitle: 'Colle un shader de n’importe où, récupère un .gdshader prêt pour Godot 4.',
    share: 'Copier le lien de partage',
    source: 'Code source',
    report: 'Signaler un bogue',
    previewSection: 'Aperçu du shader d’origine',
    previewCanvas: 'Rendu en direct du shader collé',
    previewLoading: 'Chargement de l’aperçu…',
    sourceShader: 'Ton shader GLSL',
    exampleLabel: 'Exemple',
    chooseExample: 'Choisir…',
    targetLabel: 'Cible',
    automatic: 'Automatique',
    vertexSeparate: 'Vertex shader séparé',
    vertexShader: 'Vertex shader',
    fragmentShader: 'Fragment shader',
    fragmentPlaceholder: 'Colle ici un shader Shadertoy, GLSL Sandbox, Book of Shaders, ISF, three.js ou OpenGL.',
    godotOutput: 'Pour Godot 4',
    generatedFiles: 'Fichiers générés',
    copy: 'Copier',
    download: 'Télécharger',
    conversionResult: 'Résultat de la conversion',
    thingsToKnow: 'Ce qu’il faut savoir',
    setupGodot: 'Mise en place dans Godot',
    privacy: 'La conversion se fait entièrement dans ton navigateur : ton code n’est envoyé nulle part. Testé avec Godot 4.5.',
    language: 'Langue',
    emptyCode: 'Corrige l’erreur indiquée plus bas pour voir le résultat.',
    detected: 'Détecté : {dialect}',
    nothingToReport: 'Rien à signaler : la conversion est directe.',
    error: 'Erreur',
    check: 'À vérifier',
    note: 'Note',
    nothingToCopy: 'Rien à copier pour l’instant.',
    copied: '{file} copié.',
    selectedCopy: 'Texte sélectionné : fais Ctrl+C.',
    nothingToDownload: 'Rien à télécharger pour l’instant.',
    downloaded: '{file} téléchargé.',
    shareCopied: 'Lien de partage copié.',
    shareReady: 'Lien prêt dans la barre d’adresse.',
    invalidShare: 'Le lien de partage est invalide.',
    save: 'Sauvegarder',
    savedTitle: 'Shaders sauvegardés',
    close: 'Fermer',
    historyButton: 'Shaders sauvegardés ({count})',
    savedHint: 'Stockés dans ce navigateur seulement.',
    savedEmpty: 'Aucun shader sauvegardé pour l’instant.',
    open: 'Ouvrir',
    delete: 'Supprimer',
    savePrompt: 'Nom de ce shader :',
    defaultName: 'Shader',
    saved: 'Shader sauvegardé.',
    saveFailed: 'Sauvegarde impossible : le stockage du navigateur est plein ou indisponible.',
    nothingToSave: 'Rien à sauvegarder pour l’instant.',
    confirmDelete: 'Supprimer « {name} » ?',
    opened: '« {name} » ouvert.',
  },
} as const;

const dialectLabels: Record<Language, Record<Dialect, string>> = {
  en: {
    shadertoy: 'Shadertoy',
    glslsandbox: 'GLSL Sandbox',
    bookofshaders: 'The Book of Shaders / glslCanvas',
    isf: 'ISF (Interactive Shader Format)',
    threejs: 'three.js (ShaderMaterial)',
    generic: 'Generic GLSL (WebGL / OpenGL)',
  },
  fr: {
    shadertoy: 'Shadertoy',
    glslsandbox: 'GLSL Sandbox',
    bookofshaders: 'The Book of Shaders / glslCanvas',
    isf: 'ISF (Interactive Shader Format)',
    threejs: 'three.js (ShaderMaterial)',
    generic: 'GLSL générique (WebGL / OpenGL)',
  },
};

const exactMessages: Record<string, string> = {
  'Colle un shader pour commencer.': 'Paste a shader to get started.',
  'Aucun fragment shader fourni : un fragment() minimal a été généré.': 'No fragment shader provided: a minimal fragment() was generated.',
  "La cible 2D (canvas_item) n'utilise pas le vertex shader fourni : il a été ignoré. Choisis la cible 3D (spatial) pour le convertir.": 'The 2D target (canvas_item) does not use the provided vertex shader; it was ignored. Choose the 3D target (spatial) to convert it.',
  "gl_FragDepth n'est pas converti automatiquement : écris DEPTH dans fragment() à la main (cible 3D).": 'gl_FragDepth is not converted automatically: set DEPTH manually in fragment() (3D target).',
  "gl_FragData (rendu multiple) n'existe pas dans Godot : seule la première sortie est gérée. Remplace gl_FragData[0] par gl_FragColor.": 'gl_FragData (multiple render targets) is not available in Godot: only the first output is handled. Replace gl_FragData[0] with gl_FragColor.',
  "Ce shader ISF utilise plusieurs passes (PASSES) : seule la logique d'une passe unique est convertie. Les passes intermédiaires demandent des SubViewport dans Godot.": 'This ISF shader uses multiple passes (PASSES): only a single pass is converted. Intermediate passes require SubViewport nodes in Godot.',
  'Aucune fonction main() trouvée dans le vertex shader.': 'No main() function found in the vertex shader.',
  'Aucune fonction main() ou mainImage() trouvée dans le fragment shader.': 'No main() or mainImage() function found in the fragment shader.',
  'Les blocs uniform nommés (uniform Bloc { ... } nom;) ne sont pas supportés par Godot : déclare chaque membre comme uniform séparé.': 'Named uniform blocks (uniform Block { ... } name;) are not supported by Godot: declare each member as a separate uniform.',
  'La fonction main() du vertex shader ne retourne pas void.': 'The vertex shader main() function does not return void.',
  "Le vertex shader utilise « return » dans main() : Godot l'interdit dans vertex(). Restructure avec des if/else.": 'The vertex shader uses “return” in main(): Godot does not allow this in vertex(). Restructure it with if/else.',
  "Cible 3D : la couleur est écrite dans ALBEDO avec render_mode unshaded. Godot travaille en espace linéaire, les couleurs peuvent paraître plus claires que dans le navigateur.": '3D target: color is written to ALBEDO with render_mode unshaded. Godot uses linear color space, so colors may look brighter than in the browser.',
  'Ajoute un nœud ColorRect (ou TextureRect) et étire-le à la taille voulue.': 'Add a ColorRect (or TextureRect) node and stretch it to the desired size.',
  'Dans Material, crée un nouveau ShaderMaterial et glisse-y le fichier .gdshader.': 'In Material, create a new ShaderMaterial and assign the .gdshader file.',
  'Attache le script .gd au même nœud : il met à jour la résolution, la souris et le reste à chaque image.': 'Attach the .gd script to the same node: it updates the resolution, mouse, and other values every frame.',
  'Ajoute un MeshInstance3D (un QuadMesh ou PlaneMesh pour un effet plein écran sur une surface).': 'Add a MeshInstance3D (use a QuadMesh or PlaneMesh for a full-screen effect on a surface).',
  'Dans Material Override, crée un nouveau ShaderMaterial et glisse-y le fichier .gdshader.': 'In Material Override, create a new ShaderMaterial and assign the .gdshader file.',
  'Attache le script .gd au MeshInstance3D pour alimenter la résolution, la souris et le reste.': 'Attach the .gd script to the MeshInstance3D to provide the resolution, mouse, and other values.',
};

const messagePatterns: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Erreur de syntaxe GLSL dans le (vertex|fragment) shader(?: \(ligne (\d+), colonne (\d+)\))? : (.*)$/s, (m) => `GLSL syntax error in the ${m[1]} shader${m[2] ? ` (line ${m[2]}, column ${m[3]})` : ''}: ${m[4]}`],
  [/^(Fragment|Vertex) : fonctions three\.js ajoutées \((.*)\)\.$/, (m) => `Injected three.js functions for ${m[1]}: ${m[2]}.`],
  [/^(Fragment|Vertex) : #include <(.*)> ne peut pas être résolu automatiquement et a été retiré\. Colle le contenu du chunk si le shader en dépend\.$/, (m) => `${m[1]}: #include <${m[2]}> could not be resolved automatically and was removed. Paste the chunk contents if the shader depends on it.`],
  [/^(Fragment|Vertex) : les #include "fichier" ne peuvent pas être résolus ici\. Colle le code inclus directement\.$/, (m) => `${m[1]}: #include "file" cannot be resolved here. Paste the included code directly.`],
  [/^(Fragment|Vertex) : le préprocesseur a échoué \((.*)\)\. Conversion tentée sans développer les macros\.$/, (m) => `${m[1]}: the preprocessor failed (${m[2]}). Conversion was attempted without expanding macros.`],
  [/^Identifiants réservés en GLSL 3 renommés : (.*)\.$/, (m) => `GLSL 3 reserved identifiers renamed: ${m[1]}.`],
  [/^Attribut « (.*) » associé à (.*)\.$/, (m) => `Attribute “${m[1]}” mapped to ${m[2]}.`],
  [/^Attribut « (.*) » inconnu : associé à (.*)\. Godot lit les attributs personnalisés dans les canaux CUSTOM0 à CUSTOM3 du mesh\.$/, (m) => `Unknown attribute “${m[1]}” mapped to ${m[2]}. Godot reads custom attributes from the mesh's CUSTOM0 to CUSTOM3 channels.`],
  [/^Varying « (.*) » sans vertex shader : remplacé par (.*)\.$/, (m) => `Varying “${m[1]}” without a vertex shader was replaced with ${m[2]}.`],
  [/^Varying « (.*) » sans vertex shader correspondant : il vaudra zéro\. Ajoute le vertex shader \(cible 3D\) ou remplace-le à la main\.$/, (m) => `Varying “${m[1]}” has no matching vertex shader and will be zero. Add the vertex shader (3D target) or replace it manually.`],
  [/^Uniform « (.*) » remplacé par (.*) de Godot\.$/, (m) => `Uniform “${m[1]}” replaced with Godot's ${m[2]}.`],
  [/^La fonction « (.*) » est récursive : Godot interdit la récursion\. Il faut la réécrire avec une boucle\.$/, (m) => `Function “${m[1]}” is recursive: Godot does not allow recursion. Rewrite it as a loop.`],
  [/^La fonction « (.*) » écrit « (.*) » : Godot n'accepte ces écritures que directement dans vertex\(\)\. Déplace l'affectation dans main\(\)\.$/, (m) => `Function “${m[1]}” writes to “${m[2]}”: Godot only allows these writes directly in vertex(). Move the assignment to main().`],
  [/^Si un iChannel est une texture de bruit de Shadertoy \(RGBA Noise\), utilise (\S+) \(ou (\S+)\)\. Le canal vert y est le rouge décalé de \(37, 17\), comme sur Shadertoy\. Dans Godot, importe-la en mode Lossless\.$/, (m) => `If an iChannel is a Shadertoy noise texture (RGBA Noise), use ${m[1]} (or ${m[2]}). Its green channel is the red one shifted by (37, 17), like on Shadertoy. In Godot, import it as Lossless.`],
  [/^(iChannel\d+) : assigne la texture dans l'inspecteur du ShaderMaterial\. Si c'était un Buffer Shadertoy \(multipasse\), il faut le recréer avec un SubViewport\.$/, (m) => `${m[1]}: assign the texture in the ShaderMaterial inspector. If this was a multi-pass Shadertoy Buffer, recreate it with a SubViewport.`],
  [/^(.*) : Godot ne fournit pas la taille des textures automatiquement; remplis ce tableau dans le script ou utilise textureSize\(\)\.$/, (m) => `${m[1]}: Godot does not provide texture sizes automatically; fill this array in the script or use textureSize().`],
  [/^Constante « (.*) » retirée : Godot la fournit déjà\.$/, (m) => `Constant “${m[1]}” removed: Godot already provides it.`],
  [/^« (.*) » est réservé dans Godot : renommé en « (.*) »\.$/, (m) => `“${m[1]}” is reserved in Godot and was renamed to “${m[2]}”.`],
  [/^Sorties multiples \((.*)\) ignorées : Godot n'écrit qu'une couleur\.$/, (m) => `Multiple outputs (${m[1]}) ignored: Godot only writes one color.`],
  [/^Fonction « (.*) » inconnue : elle n'est pas définie dans le shader ni intégrée à GLSL\. Vérifie si elle venait d'un #include ou d'une macro\.$/, (m) => `Unknown function “${m[1]}”: it is not defined in the shader or built into GLSL. Check whether it came from an #include or macro.`],
  [/^« (.*) » n'est pas défini : c'est probablement une constante fournie par l'application \(par exemple les defines de three\.js\)\. Ajoute « #define (.*) valeur » en haut du shader\.$/, (m) => `“${m[1]}” is not defined: it may be a constant supplied by the source application (for example, three.js defines). Add “#define ${m[2]} value” at the top of the shader.`],
  [/^Identifiant « (.*) » non déclaré : il doit venir de l'application d'origine\. Déclare-le comme uniform dans Godot\.$/, (m) => `Identifier “${m[1]}” is undeclared: it may come from the source application. Declare it as a uniform in Godot.`],
];

export function text(key: keyof typeof translations.en, language: Language): string {
  return translations[language][key];
}

export function dialectLabel(dialect: Dialect, language: Language): string {
  return dialectLabels[language][dialect];
}

export function translateConversionText(value: string, language: Language): string {
  if (language === 'fr') return value;
  const exact = exactMessages[value];
  if (exact) return exact;
  for (const [pattern, translate] of messagePatterns) {
    const match = value.match(pattern);
    if (match) return translate(match);
  }
  return value;
}

export function applyStaticTranslations(language: Language): void {
  document.documentElement.lang = language;
  document.title = text('pageTitle', language);
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = text('pageDescription', language);
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as keyof typeof translations.en;
    element.textContent = text(key, language);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder as keyof typeof translations.en;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.placeholder = text(key, language);
    }
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel as keyof typeof translations.en;
    element.setAttribute('aria-label', text(key, language));
  });
}
