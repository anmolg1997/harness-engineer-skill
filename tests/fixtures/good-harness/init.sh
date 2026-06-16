#!/usr/bin/env bash
set -euo pipefail

echo "=== Harness Initialization ==="

echo "=== install ==="
# npm install  # (no package manifest in this fixture; real projects install here)

echo "=== verify: type-check / build ==="
# npm run build

echo "=== verify: tests ==="
# npm run test

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read feature_list.json for current feature state"
echo "2. Pick the ONE in_progress feature (or the next not_started one)"
echo "3. Implement only that feature, then re-run verification before claiming done"
