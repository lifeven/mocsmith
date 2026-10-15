#!/bin/bash
# Make the start-page thumbnails (public/previews/models/<sample>.webp) from the
# running dev server: each sample opens in ?shot mode (only the model, 800×600),
# gets screenshotted with playwright-cli, and is shrunk to a 480-wide WebP.
# Needs: `npm run dev` on 5591, playwright-cli on PATH (Node 22), `cwebp`.
# Usage: tools/thumbs.sh [sample ...]   (default: every sample in src/data/samples.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."
out=public/previews/models
tmp="${TMPDIR:-/tmp}/thumbs"
mkdir -p "$out" "$tmp"
samples=("$@")
if [ ${#samples[@]} -eq 0 ]; then
  read -r -a samples <<< "$(node --input-type=module -e "const { SAMPLES } = await import('./src/data/samples.mjs'); console.log(Object.keys(SAMPLES).join(' '))")"
fi

pw() { playwright-cli -s=thumbs "$@"; }
pw open "http://127.0.0.1:5591/" >/dev/null 2>&1 || true
pw resize 800 600 >/dev/null
for s in "${samples[@]}"; do
  pw goto "http://127.0.0.1:5591/models/$s/?shot" >/dev/null
  # Wait until the model is built (the part list has rows, in any language).
  for _ in $(seq 1 40); do
    sleep 0.5
    pw eval "() => document.querySelectorAll('#parts-list li').length > 0" | grep -q '^true' && break
  done
  sleep 1
  pw screenshot --filename "$tmp/$s.png" >/dev/null
  cwebp -quiet -q 82 -resize 480 0 "$tmp/$s.png" -o "$out/$s.webp"
  echo "$out/$s.webp"
done
pw close >/dev/null 2>&1 || true
