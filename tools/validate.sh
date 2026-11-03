#!/usr/bin/env bash
# Valide les shaders convertis avec Godot. Usage : tools/validate.sh <godot> [dossier]
set -uo pipefail
GODOT="${1:?chemin vers Godot}"
DIR="$(cd "${2:-tests/out}" && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$(mktemp)"
"$GODOT" --headless --path "$HERE" -s validate.gd -- "$DIR" >"$LOG" 2>&1
# Associe chaque erreur au shader en cours de compilation
awk '
  /^SHADER_BEGIN /{cur=$2; next}
  /^SHADER_END /{cur=""; next}
  /SHADER ERROR/{ if (cur!="") { if (cur ~ /^expect-fail/) { xf[cur]=1 } else { print cur ": " $0; bad[cur]=1 } } }
  /^SHADER_COUNT /{n=$2}
  END { nb=0; for (k in bad) nb++; ne=0; for (k in xf) ne++; if (ne) printf "%d échec(s) attendu(s) (expect-fail_*)\n", ne; printf "\n%d shader(s) vérifié(s), %d en erreur\n", n, nb; exit (nb>0) }
' "$LOG"
