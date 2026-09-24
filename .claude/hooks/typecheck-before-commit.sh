#!/usr/bin/env bash
# PreToolUse(Bash) hook: typecheck before any `git commit`, and block the commit if it fails.
#
# Vitest does not typecheck, so a green test run can sit on a broken build. That
# happened twice in this project, which is why this is a hook rather than a line
# in CLAUDE.md: hooks are enforced, CLAUDE.md is advisory.
#
# Exit 0 lets the command run. Exit 2 blocks it and hands stderr back to Claude.
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

# Match `git commit` anywhere in a compound command, including the
# `git -c key=value commit` form this repo commits with. A permission-rule
# filter such as Bash(git commit *) would miss both.
if ! grep -Eq '(^|[;&|(]|[[:space:]])git([[:space:]]+-c[[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' <<<"$cmd"; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
if out=$(npm run build 2>&1); then
  exit 0
fi

{
  echo "Commit blocked: \`npm run build\` failed. Fix the type errors below, then commit again."
  echo
  grep -E 'error TS' <<<"$out" | head -30 || tail -30 <<<"$out"
} >&2
exit 2
