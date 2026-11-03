#!/bin/bash
# Every Calm suite against the sample boards (build first: python3 build.py). The same as
#   node test/run_all.js [buildDir]
# which is the runner the repo's sweep uses; this file only keeps the old command working.
cd "$(dirname "$0")/.." && exec node test/run_all.js "$@"
