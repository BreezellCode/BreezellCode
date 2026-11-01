#!/bin/bash
# The two Rime zhuyin baselines, each a shared data dir and a user dir (learning off):
#
#   shared-bopomofo / user-bopomofo        Rime's own zhuyin (rime-bopomofo bopomofo_tw: Dachen,
#                                          terra_pinyin with tones, essay, Taiwan forms by t2tw)
#   shared-cyime-zhuyin / user-cyime-zhuyin  CyIME's cyime_zhuyin on stock librime: rime-ice with
#                                          CyIME's weights (shared-cyime), its cyime_tw pack, tone
#                                          filter (lua) and cyime_s2tw. CyIME's own librime fork
#                                          (sentence rescoring, candidate policy) is not in it.
#   user-cyime-zhuyinC                     the same with Wanxiang's grammar model (octagram,
#                                          CC BY 4.0): the closest stock librime gets to CyIME's
#                                          sentence rescoring, as baseline C does for pinyin.
#
# Usage: setup-zhuyin.sh <data dir> <repos dir>
set -euo pipefail
D=$1
W=$2
R=$D/rime
CY=$W/cyime/app/src/main/assets/rime_chinese

rm -rf "$R/shared-bopomofo" "$R/user-bopomofo" "$R/shared-cyime-zhuyin" "$R/user-cyime-zhuyin" "$R/user-cyime-zhuyinC"

# --- Rime's bopomofo_tw ---
S=$R/shared-bopomofo
mkdir -p "$S/opencc" "$R/user-bopomofo"
cp "$W"/rime-prelude/{default,key_bindings,punctuation,symbols}.yaml "$S/"
cp "$W/rime-essay/essay.txt" "$S/"
cp "$D/repos/rime-terra/terra_pinyin.dict.yaml" "$S/"
cp "$D"/repos/rime-bopomofo/{bopomofo,bopomofo_tw}.schema.yaml "$D/repos/rime-bopomofo/zhuyin.yaml" "$S/"
cp "$CY"/opencc/TWVariants*.ocd2 "$S/opencc/"
cat > "$S/opencc/t2tw.json" <<'EOF'
{
  "name": "Traditional Chinese to Traditional Chinese (Taiwan Standard)",
  "segmentation": { "type": "mmseg", "dict": { "type": "group", "dicts": [
    { "type": "ocd2", "file": "TWVariantsPhrases.ocd2" }, { "type": "ocd2", "file": "TWVariants.ocd2" } ] } },
  "conversion_chain": [ { "dict": { "type": "group", "dicts": [
    { "type": "ocd2", "file": "TWVariantsPhrases.ocd2" }, { "type": "ocd2", "file": "TWVariants.ocd2" } ] } } ]
}
EOF
cat > "$R/user-bopomofo/default.custom.yaml" <<'EOF'
patch:
  schema_list:
    - schema: bopomofo_tw
  menu/page_size: 10
EOF
cat > "$R/user-bopomofo/bopomofo_tw.custom.yaml" <<'EOF'
patch:
  translator/enable_user_dict: false
EOF

# --- CyIME's cyime_zhuyin ---
S=$R/shared-cyime-zhuyin
mkdir -p "$S" "$R/user-cyime-zhuyin"
for f in "$R"/shared-cyime/*; do
	case "$(basename "$f")" in lua|opencc) ;; *) ln -s "$f" "$S/" ;; esac
done
mkdir -p "$S/lua" "$S/opencc"
for f in "$R"/shared-cyime/lua/* "$R"/shared-cyime/opencc/*; do ln -s "$f" "$S/$(basename "$(dirname "$f")")/"; done
cp "$CY"/lua/cyime_zhuyin_tone.lua "$CY"/lua/cyime_zhuyin_tones.lua "$S/lua/"
cp "$CY"/opencc/* "$S/opencc/"
cp "$CY"/cyime_zhuyin.schema.yaml "$CY"/cyime_tw.dict.yaml "$S/"
cp "$W/rime-prelude/symbols.yaml" "$S/"
cp "$R/user-cyime-nolearn/default.custom.yaml" "$R/user-cyime-zhuyin/"
sed -i -E 's/- schema: rime_ice\s*$/- schema: cyime_zhuyin/; /- schema: t9_pinyin\s*$/d' "$R/user-cyime-zhuyin/default.custom.yaml"
cat > "$R/user-cyime-zhuyin/cyime_zhuyin.custom.yaml" <<'EOF'
patch:
  translator/enable_user_dict: false
EOF
mkdir -p "$R/user-cyime-zhuyinC"
cp "$R/user-cyime-zhuyin/default.custom.yaml" "$R/user-cyime-zhuyinC/"
# A hard link to the copy baseline C keeps on this disk when there is one (reading 400 MB over /mnt is slow).
ln "$R/user-cyimeC/wanxiang-lts-zh-hans.gram" "$R/user-cyime-zhuyinC/" 2>/dev/null || cp "$W/wanxiang/wanxiang-lts-zh-hans.gram" "$R/user-cyime-zhuyinC/"
cat > "$R/user-cyime-zhuyinC/cyime_zhuyin.custom.yaml" <<'EOF'
patch:
  translator/enable_user_dict: false
  grammar:
    language: wanxiang-lts-zh-hans
    collocation_max_length: 5
    collocation_min_length: 2
  translator/contextual_suggestions: true
  translator/max_homophones: 7
  translator/max_homographs: 7
EOF
echo "zhuyin baselines ready under $R"
