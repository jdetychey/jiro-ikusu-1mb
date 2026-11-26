#!/bin/bash
# Measures the clear rate of the playtest bots by depth on the generated levels (plan §3).
# usage: scripts/balance.sh <main repository checkout> [seeds=10] [runs=30]
# The bots live in the main repository's jiro-tools, which is built here with cargo.
set -euo pipefail
main=$(realpath "$1"); seeds=${2:-10}; runs=${3:-30}
work=$(mktemp -d); here=$(pwd)
list=$(for i in $(seq 1 "$seeds"); do printf '2027-01-%02d,' "$i"; done | sed 's/,$//')
npm run wasm >/dev/null
DUMP_LEVELS_DIR=$work/levels DUMP_SEEDS=$list DUMP_BATCHES=0,1,2,3 npx vitest run test/dump.test.ts >/dev/null
(cd "$main" && cargo build -p jiro-tools --release -q)
for policy in bold committer; do
  for dir in "$work"/levels/*; do
    (cd "$main" && ./target/release/jiro-tools playtest --levels "$dir" --policy "$policy" --runs "$runs" --out "$work/reports/$policy/$(basename "$dir")" >/dev/null)
  done
done
node scripts/balance-report.mjs "$work/reports" bold,committer "$seeds" "$runs" > reports/balance.md
echo "wrote reports/balance.md"
