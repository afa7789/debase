#!/bin/bash
set -e

cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"

echo "=== Building Docker image ==="
docker build -t debase-update -f Dockerfile .

echo "=== Running updates in parallel ==="
docker run --rm -v "$REPO_ROOT:/work" -w /work/scripts debase-update python update_cpi.py &
PID_CPI=$!

docker run --rm -v "$REPO_ROOT:/work" -w /work/scripts debase-update python update_metals.py &
PID_METALS=$!

python3 update_crypto.py &
PID_CRYPTO=$!

fail=0
wait $PID_CPI || { echo "[CPI] failed"; fail=1; }
wait $PID_METALS || { echo "[METALS] failed"; fail=1; }
wait $PID_CRYPTO || { echo "[CRYPTO] failed"; fail=1; }

echo "=== All updates complete ==="
exit $fail
