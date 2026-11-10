#!/usr/bin/env bash
# Run the tests of every starter. Offline: no tokens, no network.
#   ./run_tests.sh            (dependencies already installed)
#   ./run_tests.sh --install  (pip install each starter's requirements-dev.txt first)
set -uo pipefail
cd "$(dirname "$0")"
status=0
for dir in 0*/; do
  dir=${dir%/}
  if [ "${1:-}" = "--install" ]; then
    python -m pip install -q -r "$dir/requirements-dev.txt" || status=1
  fi
  echo "=== $dir"
  (cd "$dir" && python -m pytest -q -p no:cacheprovider) || status=1
done
exit $status
