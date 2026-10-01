#!/usr/bin/env bash
# Read-only check that we did not modify the Codex Desktop bundle.
# OpenAI currently ships that bundle as /Applications/ChatGPT.app (id com.openai.codex).
# /Applications/Codex.app is expected to be absent on this machine.
#
# Checks, in order:
#   1) /Applications/Codex.app must be absent (we never create fake aliases)
#   2) codesign --verify --strict  -> sealed resources (Info.plist / MacOS / Resources / app.asar) intact
#   3) Identifier + TeamIdentifier -> still the official OpenAI identity
#   4) spot sha256 vs baseline     -> informational; a mismatch with a VALID signature means
#                                     ChatGPT.app self-updated, so refresh the baseline (command printed)
# A tampered bundle fails 2 or 3 and the script exits non-zero.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_NAME="$(cat "$REPO_ROOT/backups/LATEST.txt" 2>/dev/null || true)"
if [[ -z "$BASE_NAME" || ! -d "$REPO_ROOT/backups/$BASE_NAME/machine" ]]; then
  BASE_NAME="20260912-1713"
fi
BASELINE_DIR="$REPO_ROOT/backups/$BASE_NAME/machine"
EXPECTED_ID="com.openai.codex"
EXPECTED_TEAM="2DC432GLL2"
APP="/Applications/ChatGPT.app"
FAIL=0

echo "== Codex.app =="
if [[ -e /Applications/Codex.app ]]; then
  echo "UNEXPECTED: /Applications/Codex.app exists"
  codesign -dv /Applications/Codex.app 2>&1 | head
  FAIL=1
else
  echo "ABSENT (expected). Do not create a fake Codex.app alias."
fi

echo
echo "== ChatGPT.app (Codex Desktop) =="
if [[ ! -d "$APP" ]]; then
  echo "ChatGPT.app missing"
  exit 1
fi

plutil -extract CFBundleIdentifier raw "$APP/Contents/Info.plist"
plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist"
plutil -extract CFBundleVersion raw "$APP/Contents/Info.plist"

CS_ERR="$(mktemp)"
if codesign --verify --strict "$APP" 2>"$CS_ERR"; then
  echo "codesign --verify --strict: PASSED (sealed resources intact)"
else
  echo "FAIL: codesign integrity check failed:"
  cat "$CS_ERR"
  FAIL=1
fi
rm -f "$CS_ERR"

CS_INFO="$(codesign -dv "$APP" 2>&1 || true)"
echo "$CS_INFO" | egrep 'Identifier|CDHash|TeamIdentifier|Timestamp' || true
if echo "$CS_INFO" | grep -q "^Identifier=${EXPECTED_ID}"; then
  echo "Identifier OK: ${EXPECTED_ID}"
else
  echo "FAIL: Identifier is not ${EXPECTED_ID}"
  FAIL=1
fi
if echo "$CS_INFO" | grep -q "^TeamIdentifier=${EXPECTED_TEAM}"; then
  echo "TeamIdentifier OK: ${EXPECTED_TEAM} (OpenAI OpCo, LLC)"
else
  echo "FAIL: TeamIdentifier is not ${EXPECTED_TEAM} — signature is NOT the official one"
  FAIL=1
fi

CURRENT_HASH="$(shasum -a 256 "$APP/Contents/Info.plist" "$APP/Contents/MacOS/ChatGPT")"
echo "$CURRENT_HASH"
BASELINE_FILE="$BASELINE_DIR/ChatGPT-sha256.txt"
if [[ -f "$BASELINE_FILE" ]]; then
  if [[ "$(cat "$BASELINE_FILE")" == "$CURRENT_HASH" ]]; then
    echo "spot sha256 matches baseline ${BASE_NAME}"
  else
    echo "NOTE: spot sha256 differs from baseline ${BASE_NAME}"
    if [[ "$FAIL" -eq 0 ]]; then
      echo "  codesign checks above PASSED -> treat as official self-update, not tampering."
      echo "  Refresh the baseline (read-only copy of hashes) with:"
      echo "    D=\"$REPO_ROOT/backups/$(date +%Y%m%d-%H%M)\"; mkdir -p \"\$D/machine\""
      echo "    shasum -a 256 \"$APP/Contents/Info.plist\" \"$APP/Contents/MacOS/ChatGPT\" > \"\$D/machine/ChatGPT-sha256.txt\""
      echo "    codesign -dvv \"$APP\" > \"\$D/machine/ChatGPT-codesign.txt\" 2>&1"
      echo "    cp \"$BASELINE_FILE\" \"\$D/machine/\" 2>/dev/null || true"
      printf '    echo "$(basename "$D")" > "%s/backups/LATEST.txt"\n' "$REPO_ROOT"
    fi
  fi
fi

echo
echo "== Explodex launcher =="
for p in /Applications/Explodex.app "$HOME/Applications/Explodex.app"; do
  if [[ -e "$p" ]]; then echo "FOUND $p"; else echo "ABSENT $p"; fi
done

echo
if [[ "$FAIL" -ne 0 ]]; then
  echo "FAILED: at least one integrity assertion did not hold (see FAIL lines above)."
  exit 1
fi
echo "OK: ChatGPT.app passes codesign --verify --strict and identity matches OpenAI."
