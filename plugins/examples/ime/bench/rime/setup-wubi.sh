#!/bin/bash
# The Wubi 86 baseline: Rime with rime-wubi86-jidian (MIT) as published (fixed order, no user
# dictionary), page size 5 as the schema's default menu.
# Usage: setup-wubi.sh <data dir> <repos dir>
set -euo pipefail
D=$1; W=$2; R=$D/rime
rm -rf "$R/shared-wubi" "$R/user-wubi"
mkdir -p "$R/shared-wubi" "$R/user-wubi"
cp "$W"/rime-prelude/{default,key_bindings,punctuation,symbols}.yaml "$R/shared-wubi/"
cp "$D"/repos/wubi86/{wubi86_jidian.schema.yaml,wubi86_jidian.dict.yaml,wubi86_jidian_extra.dict.yaml,wubi86_jidian_user.dict.yaml,wubi86_jidian_user_hamster.dict.yaml,pinyin_simp.dict.yaml,pinyin_simp.schema.yaml,numbers.schema.yaml} "$R/shared-wubi/"
cat > "$R/user-wubi/default.custom.yaml" <<'EOF'
patch:
  schema_list:
    - schema: wubi86_jidian
  menu/page_size: 5
EOF
echo "wubi baseline ready"
