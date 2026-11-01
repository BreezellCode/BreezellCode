#!/bin/bash
# User dirs for the double pinyin baselines, the same three as for pinyin (learning off):
#   user-dpA  rime-ice's double_pinyin_<scheme> as published (shared-ice)
#   user-dpB  the same on rime-ice with CyIME's weights (shared-cyime)
#   user-dpC  B with Wanxiang's grammar model
# Usage: setup-double-pinyin.sh <data dir> [scheme, default flypy]
set -euo pipefail
R=$1/rime
S=double_pinyin_${2:-flypy}
for v in A B C; do
	U=$R/user-dp$v
	rm -rf "$U"
	mkdir -p "$U"
	cp "$R/user-cyime-nolearn/default.custom.yaml" "$U/"
	sed -i -E "s/- schema: rime_ice\s*$/- schema: $S/; /- schema: t9_pinyin\s*$/d" "$U/default.custom.yaml"
	printf 'patch:\n  translator/enable_user_dict: false\n' > "$U/$S.custom.yaml"
done
ln "$R/user-cyimeC/wanxiang-lts-zh-hans.gram" "$R/user-dpC/"
cat >> "$R/user-dpC/$S.custom.yaml" <<'EOF'
  grammar:
    language: wanxiang-lts-zh-hans
    collocation_max_length: 5
    collocation_min_length: 2
  translator/contextual_suggestions: true
  translator/max_homophones: 7
  translator/max_homographs: 7
EOF
echo "double pinyin ($S) baselines ready"
