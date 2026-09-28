#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

node "${SCRIPT_DIR}/publish-core.mjs" --language "typescript" --project-dir "${PROJECT_DIR}" "$@"
