#!/usr/bin/env bash
# Sync the game into this repo and publish to GitHub Pages (main branch, / root).
# Usage: ./deploy.sh            (sync + commit + push)
#        ./deploy.sh --no-push  (sync + commit only)
set -euo pipefail
SRC="${SRC:-/home/box/orbitdesktop/games/pizza-panic/}"
REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

rsync -a --delete --max-size=50m \
  --exclude='/.git/' --exclude='/.nojekyll' --exclude='/deploy.sh' --exclude='/README.md' --exclude='/shims/' \
  --exclude='*.bak*' --exclude='*.bak-*' --exclude='*_src*.jpg' \
  --exclude='node_modules/' --exclude='tools/' --exclude='dev/' --exclude='*-dev/' \
  --include='CREDITS-AUDIO.md' --exclude='*.md' \
  "$SRC" "$REPO/"

touch .nojekyll
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
else
  git commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Committed: $(git log -1 --format='%h %s')"
fi
if [[ "${1:-}" != "--no-push" ]]; then
  git push -q origin main
  echo "Pushed. Live in ~1 min at https://mojomast.github.io/clawpocalypse-now/"
fi
