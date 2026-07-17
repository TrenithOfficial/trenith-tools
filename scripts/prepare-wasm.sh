#!/usr/bin/env bash
set -euo pipefail

source_file="node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm"
target_file="public/zeroperl.wasm"

if [[ ! -f "$source_file" ]]; then
  echo "Missing $source_file. Run npm install before building." >&2
  exit 1
fi

cp "$source_file" "$target_file"
