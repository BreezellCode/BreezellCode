#!/bin/bash
# The harness with the librime unpacked under ~/.cache/breezell-ime-data/rime/prefix. librime looks
# for its plugins in the system's rime-plugins folder, so lua and octagram are preloaded from ours.
P=$HOME/.cache/breezell-ime-data/rime/prefix/usr/lib/x86_64-linux-gnu
export LD_LIBRARY_PATH=$P${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
export LD_PRELOAD=$P/rime-plugins/librime-lua.so:$P/rime-plugins/librime-octagram.so
exec "$(dirname "$0")/rime-harness" "$@"
