#!/usr/bin/env bash
set -euo pipefail

source_file="node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm"
target_file="public/zeroperl.wasm"
ffmpeg_core_js="node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js"
ffmpeg_core_wasm="node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm"
ffmpeg_class_dir="node_modules/@ffmpeg/ffmpeg/dist/esm"
ffmpeg_target_dir="public/ffmpeg"
pdfjs_dir="node_modules/pdfjs-dist"
pdfjs_target_dir="public/pdf"

for required in "$source_file" "$ffmpeg_core_js" "$ffmpeg_core_wasm" "$ffmpeg_class_dir/worker.js" "$ffmpeg_class_dir/const.js" "$ffmpeg_class_dir/errors.js" "$pdfjs_dir/build/pdf.worker.min.mjs"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing $required. Run npm install before building." >&2
    exit 1
  fi
done

cp "$source_file" "$target_file"
mkdir -p "$ffmpeg_target_dir"
cp "$ffmpeg_core_js" "$ffmpeg_target_dir/ffmpeg-core.js"
# The whole @ffmpeg/ffmpeg ESM client runs unbundled from our origin: the page
# imports /ffmpeg/index.js at runtime, so neither Turbopack nor Vite tries to
# statically resolve its `new Worker(new URL(classWorkerURL, import.meta.url))`
# (Turbopack in Next 16.4 rejects that dynamic URL), and the worker's dynamic
# import of the core module resolves natively in the browser.
cp "$ffmpeg_class_dir/index.js" "$ffmpeg_class_dir/classes.js" "$ffmpeg_class_dir/types.js" "$ffmpeg_class_dir/utils.js" \
  "$ffmpeg_class_dir/worker.js" "$ffmpeg_class_dir/const.js" "$ffmpeg_class_dir/errors.js" "$ffmpeg_target_dir/"
rm -f "$ffmpeg_target_dir/ffmpeg-core.wasm" "$ffmpeg_target_dir"/ffmpeg-core.wasm.part* "$ffmpeg_target_dir/ffmpeg-core.wasm.json"
# Sites accepts individual files up to 25 MiB. Keep the FFmpeg engine on our own
# origin by packaging it as 16 MB chunks and reconstructing a temporary Blob URL
# in the visitor's browser before the worker starts. The manifest lets the
# browser fetch every chunk in parallel instead of probing for them one by one.
split -b 16000000 -d -a 1 "$ffmpeg_core_wasm" "$ffmpeg_target_dir/ffmpeg-core.wasm.part"
part_count="$(find "$ffmpeg_target_dir" -maxdepth 1 -name 'ffmpeg-core.wasm.part*' | wc -l | tr -d ' ')"
total_bytes="$(wc -c < "$ffmpeg_core_wasm" | tr -d ' ')"
printf '{"parts":%s,"bytes":%s,"chunkBytes":16000000}\n' "$part_count" "$total_bytes" > "$ffmpeg_target_dir/ffmpeg-core.wasm.json"

# pdf.js renders PDF pages and extracts text on-device. Its worker plus the
# CMaps, standard fonts, ICC profiles and JPX/JBIG2 decoders are served from our
# own origin so the Content-Security-Policy stays self-only.
rm -rf "$pdfjs_target_dir"
mkdir -p "$pdfjs_target_dir"
cp "$pdfjs_dir/build/pdf.worker.min.mjs" "$pdfjs_target_dir/pdf.worker.min.mjs"
cp -R "$pdfjs_dir/cmaps" "$pdfjs_target_dir/cmaps"
cp -R "$pdfjs_dir/standard_fonts" "$pdfjs_target_dir/standard_fonts"
cp -R "$pdfjs_dir/wasm" "$pdfjs_target_dir/wasm"
cp -R "$pdfjs_dir/iccs" "$pdfjs_target_dir/iccs"

oversized="$(find "$ffmpeg_target_dir" "$pdfjs_target_dir" "$target_file" -type f -size +26214400c -print -quit)"
if [[ -n "$oversized" ]]; then
  echo "Generated browser engine exceeds the 25 MiB hosting limit: $oversized" >&2
  exit 1
fi
