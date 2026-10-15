#!/bin/bash
# Start-page previews of the mosaic examples (data/mosaic-samples.mjs): for each, the mosaic
# drawn by the same code as the mosaic page (public/previews/mosaics/<key>.webp) and a
# small copy of the photo for the corner inset (<key>-photo.webp). Like the 3D thumbnails,
# made once and kept, so the start page loads two small pictures per example instead of a
# photo and a mosaic build. Run again after changing the examples or the mosaic code.
# Needs the dev server (npm run dev) on 127.0.0.1:5591, and Node 22.12+ and
# playwright-cli and cwebp on PATH.
# Usage: tools/mosaic-thumbs.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=public/previews/mosaics
mkdir -p "$out"
js='async () => {
  const { MOSAIC_SAMPLES } = await import("/src/data/mosaic-samples.mjs");
  const { buildMosaic } = await import("/src/mosaic/mosaic.mjs");
  const { planBases, defaultBaseColour } = await import("/src/mosaic/base.mjs");
  const { drawMosaicCanvas } = await import("/src/ui/mosaic/draw.mjs");
  const { readPhoto, MOSAIC_DEFAULTS } = await import("/src/ui/mosaic/index.mjs");
  const out = {};
  for (const [key, s] of Object.entries(MOSAIC_SAMPLES)) {
    const { pixels } = await readPhoto(await (await fetch(s.url)).blob());
    const m = buildMosaic(pixels, MOSAIC_DEFAULTS);
    const plan = planBases(m.width, m.height).find((p) => p.key === "panels");
    const c = document.createElement("canvas");
    drawMosaicCanvas(c, m, { cellPx: 3, base: defaultBaseColour(plan.part), panels: false });
    out[key] = c.toDataURL("image/png");
  }
  return JSON.stringify(out);
}'
playwright-cli -s=mthumbs open "http://127.0.0.1:5591/" >/dev/null 2>&1
playwright-cli -s=mthumbs eval "$js" 2>&1 | grep -A1 '### Result' | tail -1 > "$out/.previews.json"
playwright-cli -s=mthumbs close >/dev/null 2>&1
python3 - "$out" <<'PY'
import base64, json, sys, pathlib, subprocess, tempfile
out = pathlib.Path(sys.argv[1])
raw = (out / '.previews.json').read_text().strip()
data = json.loads(json.loads(raw))  # the eval result is a JSON string of a JSON object
for key, url in data.items():
    with tempfile.NamedTemporaryFile(suffix='.png') as image:
        image.write(base64.b64decode(url.split(',', 1)[1]))
        image.flush()
        target = out / f'{key}.webp'
        subprocess.run(['cwebp', '-quiet', '-q', '82', image.name, '-o', str(target)], check=True)
    print(key, target.stat().st_size, 'bytes')
(out / '.previews.json').unlink()
PY
for photo in public/samples/mosaic/*.jpg; do
  key=$(node --input-type=module -e "import { MOSAIC_SAMPLES } from './src/data/mosaic-samples.mjs'; const f = process.argv[1]; console.log(Object.entries(MOSAIC_SAMPLES).find(([, s]) => f.endsWith(s.url.slice(1)))?.[0] ?? '')" "$photo")
  [ -n "$key" ] && cwebp -quiet -q 82 -resize 240 0 "$photo" -o "$out/$key-photo.webp" && echo "$key-photo $(stat -f %z "$out/$key-photo.webp") bytes"
done
