#!/usr/bin/env bash
set -euo pipefail

source_file="node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm"
target_file="public/zeroperl.wasm"
ffmpeg_core_js="node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js"
ffmpeg_core_wasm="node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm"
ffmpeg_target_dir="public/ffmpeg"

for required in "$source_file" "$ffmpeg_core_js" "$ffmpeg_core_wasm"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing $required. Run npm install before building." >&2
    exit 1
  fi
done

cp "$source_file" "$target_file"
mkdir -p "$ffmpeg_target_dir"
cp "$ffmpeg_core_js" "$ffmpeg_target_dir/ffmpeg-core.js"
rm -f "$ffmpeg_target_dir/ffmpeg-core.wasm" \
  "$ffmpeg_target_dir/ffmpeg-core.wasm.part0" \
  "$ffmpeg_target_dir/ffmpeg-core.wasm.part1" \
  "$ffmpeg_target_dir/ffmpeg-core.wasm.part2" \
  "$ffmpeg_target_dir/ffmpeg-core.wasm.part3"
# Sites accepts individual files up to 25 MiB. Keep the FFmpeg engine on our own
# origin by packaging it as 16 MB chunks and reconstructing a temporary Blob URL
# in the visitor's browser before the worker starts.
split -b 16000000 -d -a 1 "$ffmpeg_core_wasm" "$ffmpeg_target_dir/ffmpeg-core.wasm.part"

oversized="$(find "$ffmpeg_target_dir" "$target_file" -type f -size +26214400c -print -quit)"
if [[ -n "$oversized" ]]; then
  echo "Generated browser engine exceeds the 25 MiB hosting limit: $oversized" >&2
  exit 1
fi
