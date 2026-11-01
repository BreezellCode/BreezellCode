#!/bin/bash
# CyIME's Japanese on stock librime: its "japanese" schema (rime-jaroomaji based, with its particle
# pack and lua processors) over rime-jaroomaji's dictionaries (Mozc, JMdict, KANJIDIC2), learning off.
# Usage: setup-japanese.sh <data dir> <repos dir>
set -euo pipefail
D=$1; W=$2; R=$D/rime
CY=$W/cyime/app/src/main/assets/rime_japanese
rm -rf "$R/shared-ja" "$R/user-ja"
mkdir -p "$R/shared-ja/lua" "$R/user-ja"
cp "$W"/rime-prelude/{default,key_bindings,punctuation,symbols}.yaml "$R/shared-ja/"
cp "$D"/repos/jaroomaji/*.dict.yaml "$R/shared-ja/"
cp "$CY"/*.yaml "$R/shared-ja/"
cp "$CY"/*.lua "$R/shared-ja/lua/"
cat > "$R/user-ja/default.custom.yaml" <<'EOF'
patch:
  schema_list:
    - schema: japanese
  menu/page_size: 9
EOF
printf 'patch:\n  translator/enable_user_dict: false\n' > "$R/user-ja/japanese.custom.yaml"
echo "japanese baseline ready"
