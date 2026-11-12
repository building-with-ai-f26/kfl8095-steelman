#!/bin/sh
# Run by CI inside a network namespace that has no way out to the internet
# (.github/workflows/check.yml). First makes sure that is really so, because
# otherwise the run would prove nothing; then runs the check.
set -eu

if curl --silent --max-time 5 https://registry.npmjs.org >/dev/null 2>&1; then
  echo "The network is still reachable, so this run can't show the check works without it." >&2
  exit 1
fi

TEST_DATABASE=embedded npm run check
