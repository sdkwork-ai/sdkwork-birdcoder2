#!/usr/bin/env bash
# bootstrap — resolve the sdkwork-specs checkout, load the shared library,
# module wiring, and generic entrypoints, then dispatch (MODULE_BIN_SPEC.md §3).
set -euo pipefail
: "${SDKWORK_ENTRY:?bootstrap requires SDKWORK_ENTRY}"
SDKWORK_MODULE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export SDKWORK_MODULE_ROOT

if [[ -z "${SDKWORK_SPECS_ROOT:-}" ]]; then
  if [[ -f "${SDKWORK_MODULE_ROOT}/../sdkwork-specs/bin/lib/sdkwork-common.sh" ]]; then
    SDKWORK_SPECS_ROOT="$(cd "${SDKWORK_MODULE_ROOT}/../sdkwork-specs" && pwd)"
  elif [[ -f "${SDKWORK_MODULE_ROOT}/sdkwork-specs/bin/lib/sdkwork-common.sh" ]]; then
    SDKWORK_SPECS_ROOT="$(cd "${SDKWORK_MODULE_ROOT}/sdkwork-specs" && pwd)"
  else
    echo "[sdkwork-bin] ERROR(65): cannot resolve sdkwork-specs checkout (set SDKWORK_SPECS_ROOT)" >&2
    exit 65
  fi
fi
export SDKWORK_SPECS_ROOT

# shellcheck source=/dev/null
source "${SDKWORK_SPECS_ROOT}/bin/lib/sdkwork-common.sh"
# shellcheck source=/dev/null
source "${SDKWORK_MODULE_ROOT}/bin/lib/module.sh"
# shellcheck source=/dev/null
source "${SDKWORK_SPECS_ROOT}/bin/lib/entrypoints.sh"
# Operational lifecycle: configuration, logs/diagnostics, backup/restore
# (OPERATIONS_SPEC.md). Loaded after module.sh so module constants win.
# shellcheck source=/dev/null
source "${SDKWORK_SPECS_ROOT}/bin/lib/ops-config.sh"
# shellcheck source=/dev/null
source "${SDKWORK_SPECS_ROOT}/bin/lib/ops-observe.sh"
# shellcheck source=/dev/null
source "${SDKWORK_SPECS_ROOT}/bin/lib/ops-backup.sh"

# Guards, defaults (image tag from the app manifest), and the evidence trap.
sdkwork_init

"sdkwork_entry_${SDKWORK_ENTRY//-/_}" "$@"
