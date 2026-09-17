#!/usr/bin/env bash
# module.sh — sdkwork-birdcoder2 bin/ wiring (MODULE_BIN_SPEC.md §3).
# Scaffolded by sdkwork-specs/tools/scaffold-module-bin.mjs; the wired hooks
# below delegate to the repository's canonical runners. Hooks that still have
# no canonical command fail fast with the exact command to wire.
# Every shared primitive comes from sdkwork-specs/bin/lib/sdkwork-common.sh.

SDKWORK_MODULE_ID="sdkwork-birdcoder2"
SDKWORK_IMAGE_NAME="sdkwork-birdcoder2-standalone"
SDKWORK_APP_TYPES="server,desktop,h5,pc,flutter,mini-program"

# Operations wiring (OPERATIONS_SPEC.md): compose service carrying the health
# probe and its path; adjust to the module's compose file when it lands.
SDKWORK_PRIMARY_SERVICE="app"
SDKWORK_HEALTH_PATH="/healthz"
SDKWORK_CONFIG_ENV_SUBDIR="env"

# ----------------------------------------------------------------------------
# Container image (docker-image.sh build)
# ----------------------------------------------------------------------------
sdkwork_image_build() {
  local ref="$1" tag="$2"
  # No local container build exists on purpose. Dockerfile is multi-stage and
  # needs TWO Buildx named contexts — sdkwork-ecosystem (the workspace root that
  # holds the ../sdkwork-* siblings) and prebuilt (the runner-built tree) — and
  # it is linux-only (apt + g++ + pnpm install). The canonical builder is the
  # release workflow; wiring a local `docker build` here would either need those
  # contexts faked or silently produce an image the release channel does not
  # recognise. See .github/workflows/container-release.yml ("Build native image
  # without registry publication") and scripts/release/pack-container.ts.
  sdkwork_die "${SDKWORK_BIN_E_STATE}" \
    "sdkwork-birdcoder2 container images are built by the release pipeline, not locally; run the container-release workflow (or bin/docker-image.sh save/load against a CI-built archive)"
}

# ----------------------------------------------------------------------------
# Application build (apps-build.sh)
# ----------------------------------------------------------------------------
sdkwork_build_app() {
  local app_type="$1" environment="$2" profile="$3"
  local alias suffix=""
  case "${app_type}" in
    server)
      # Rust build-composition workspace (crates/* generated API assembly).
      sdkwork_local_run cargo build --release ;;
    h5|pc)
      # Canonical browser surface runner (MODULE_BIN_SPEC.md §4.3): the
      # repository root declares the whole matrix as build:<arch>:<alias>[:cloud],
      # each row delegating to sdkwork-specs/tools/build-browser-client.mjs.
      # Hand-rolling the tool invocation here would bypass
      # check-browser-build-scripts, so delegate to the script instead.
      alias="$(sdkwork_environment_alias "${environment}")"
      if [[ "${profile}" == "cloud" ]]; then suffix=":cloud"; fi
      sdkwork_local_run pnpm run "build:${app_type}:${alias}${suffix}" ;;
    desktop)
      # Electron shell (apps/desktop). The build itself is environment-agnostic;
      # the per-environment materialisation rides the renderer bundle, and the
      # packaged installers pick it up at packaging time (§4.9).
      sdkwork_local_run pnpm run build:desktop ;;
    flutter)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "app type 'flutter' builds with the Dart/Flutter toolchain from apps/sdkwork-birdcoder2-flutter-mobile: flutter build appbundle --dart-define-from-file=env/sdkwork.${profile}.${environment}.json (env/ carries all five environments for both profiles). Wire it here once the Flutter toolchain is part of the operator channel" ;;
    mini-program)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "app type 'mini-program' has no runner: apps/sdkwork-birdcoder2-mini-program/package.json delegates to scripts/build-mini-program.mjs, which does not exist yet (scripts/ carries only README.md). Add the runner, then wire this hook to it" ;;
    *)
      sdkwork_die "${SDKWORK_BIN_E_ENV}" \
        "app type '${app_type}' has no wired build for sdkwork-birdcoder2; extend sdkwork_build_app with the repository's canonical runner (declared: ${SDKWORK_APP_TYPES})" ;;
  esac
}

# ----------------------------------------------------------------------------
# Application packaging (apps-package.sh)
# ----------------------------------------------------------------------------
sdkwork_package_app() {
  local app_type="$1" environment="$2" profile="$3" out="$4"
  case "${app_type}" in
    server|h5|pc)
      # Browser surfaces already stage a self-contained bundle per environment
      # (dist/<deploymentProfile>/<envAlias>); the release-archive channel for
      # them is not declared yet, so packing is a collect-only step.
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "sdkwork-birdcoder2 has no release packager for '${app_type}' yet; the browser bundle lands under dist/${profile}/<envAlias> — add the archive step (PACKAGING_SPEC.md §4.4) and collect it with sdkwork_collect_artifact into ${out}" ;;
    desktop)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "desktop release archives are produced by apps/desktop's electron-builder channel (pnpm package:desktop:<os>:<arch>), which writes its own artifact directory; use bin/apps-pkg-installer.sh desktop <platform> for the installable channel (MODULE_BIN_SPEC.md §4.9)" ;;
    *)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "sdkwork-birdcoder2 has no canonical release packager wired yet for '${app_type}'; implement sdkwork_package_app against the repository's packaging command (MODULE_BIN_SPEC.md §4.4, output ${out})" ;;
  esac
}

# ----------------------------------------------------------------------------
# Native installer packaging (apps-pkg-installer.sh, MODULE_BIN_SPEC.md §4.9)
# ----------------------------------------------------------------------------
sdkwork_installer_app() {
  local app_type="$1" platform="$2" environment="$3" profile="$4" out="$5" arch="$6" format="$7"
  case "${app_type}:${platform}" in
    desktop:windows)
      # apps/desktop ships the full electron-builder matrix; only the host OS can
      # build its own installers (NSIS needs Windows, .dmg/.pkg need macOS), so
      # fail fast rather than substitute another platform's artifact (§4.9).
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "wire sdkwork_installer_app to pnpm --filter @deepseek-ai/dsh-desktop run package:win:${arch} for windows, then sdkwork_collect_artifact from the electron-builder output (unsigned:true writes apps/desktop/unsigned-artifacts) into ${out}" ;;
    desktop:macos)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "wire sdkwork_installer_app to pnpm --filter @deepseek-ai/dsh-desktop run package:mac:${arch} for macos, then sdkwork_collect_artifact from the electron-builder output into ${out}" ;;
    desktop:linux)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "wire sdkwork_installer_app to pnpm --filter @deepseek-ai/dsh-desktop run package:linux:${arch}:unsigned for linux, then sdkwork_collect_artifact from apps/desktop/unsigned-artifacts into ${out}" ;;
    flutter:*)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "Flutter installers (android apk/aab, ios ipa) come from apps/sdkwork-birdcoder2-flutter-mobile: flutter build appbundle|apk|ipa --dart-define-from-file=env/sdkwork.${profile}.${environment}.json; wire this hook there (MODULE_BIN_SPEC.md §4.9; platform '${platform}', arch '${arch}', format '${format}')" ;;
    *)
      sdkwork_die "${SDKWORK_BIN_E_STATE}" \
        "sdkwork-birdcoder2 has no native installer builder wired yet for '${app_type}':${platform}; implement sdkwork_installer_app against the repository's installer commands (MODULE_BIN_SPEC.md §4.9; platforms: windows|linux|macos|android|ios; out ${out})" ;;
  esac
}

# ----------------------------------------------------------------------------
# Application deployment (apps-deploy.sh)
# ----------------------------------------------------------------------------
sdkwork_deploy_app() {
  local app_type="$1" action="$2" environment="$3" profile="$4" host="$5"
  sdkwork_die "${SDKWORK_BIN_E_STATE}" \
    "sdkwork-birdcoder2 has no application deployment channel wired yet; implement sdkwork_deploy_app (host-native install via bin/apps-package artifacts, MODULE_BIN_SPEC.md §4.5; app type '${app_type}', action '${action}' → ${host})"
}
