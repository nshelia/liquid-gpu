#!/bin/sh
# Usage: test/run.sh <task.mjs> [cdp args…]  (40 s watchdog; demo dev server on :5179)
T=${T:-60}
export CDP_TAG=run$$
perl -e "alarm $T; exec @ARGV" node ../../packages/gpu/test/cdp.mjs http://127.0.0.1:5179/ "$@" 2>&1 | grep -v '\[vite\]' | grep -v 'React DevTools'
pkill -f "cdpprof-$CDP_TAG-" 2>/dev/null  # only this run's Chrome
exit 0
