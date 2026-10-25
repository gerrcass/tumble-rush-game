#!/usr/bin/env bash
set -euo pipefail
# Local clean-install + check. The home npm cache is read-only in this
# environment, so keep the cache inside the workspace.
cd "$(dirname "$0")/.."
npm ci --cache .npm-cache --no-audit --no-fund
npm run check
