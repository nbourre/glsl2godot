#!/usr/bin/env bash
# Convertit le corpus puis le valide avec Godot. Usage : tools/check.sh <godot>
set -e
cd "$(dirname "$0")/.."
npx vite-node tools/convert-corpus.ts tests/corpus tests/out
tools/validate.sh "$1" tests/out || exit 1

# Vérifie aussi que les scripts GDScript générés se chargent
status=0
for f in tests/out/*.gd; do
  [ -e "$f" ] || continue
  cp "$f" tools/_check.gd
  if "$1" --headless --path tools --check-only -s _check.gd 2>&1 | grep -q "SCRIPT ERROR"; then
    echo "Script invalide : $f"; status=1
  fi
done
rm -f tools/_check.gd
exit $status
