#!/usr/bin/env bash
# Privacy sentinel: refuse to let personal identifiers re-enter the tracked tree.
# Scans all git-tracked files for tokens that must never be committed.
# Install as a hook:  ln -sf ../../scripts/check-privacy.sh .git/hooks/pre-push
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PATTERN='aaron|guorui|gmail|MacBook Pro|/Users/[a-z]+'

HITS="$(git ls-files -z | xargs -0 grep -iIlE "$PATTERN" 2>/dev/null | grep -vx 'scripts/check-privacy\.sh' || true)"
if [ -n "$HITS" ]; then
  echo "check-privacy: personal tokens found in tracked files:" >&2
  echo "$HITS" >&2
  exit 1
fi

AUTHOR_EMAIL="$(git log -1 --format='%ae' 2>/dev/null || true)"
if echo "$AUTHOR_EMAIL" | grep -qiE 'gmail'; then
  echo "check-privacy: HEAD author email is a gmail address (${AUTHOR_EMAIL})" >&2
  exit 1
fi

echo "check-privacy: clean"
