#!/bin/bash
# Edit the plugin in one place, ship it in one command.
#
#   scripts/push-plugin.sh "your commit message"
#
# Commits + pushes the fluidnc-config submodule (the plugin repo), then
# bumps + commits + pushes the fork's pointer to it. One flow.
set -euo pipefail

MSG="${1:-update fluidnc-config}"
FORK="$(cd "$(dirname "$0")/.." && pwd)"
SUB="$FORK/plugins/fluidnc-config"

cd "$SUB"
if [[ -n "$(git status --porcelain)" ]]; then
	git add -A
	git commit -m "$MSG"
	git push
	echo "✓ plugin repo updated"
else
	echo "· plugin working tree clean — nothing to commit"
fi

cd "$FORK"
if [[ -n "$(git status --porcelain plugins/fluidnc-config)" ]]; then
	git add plugins/fluidnc-config
	git commit -m "bump fluidnc-config: $MSG"
	git push
	echo "✓ fork pointer bumped"
else
	echo "· fork already points at latest plugin commit"
fi
