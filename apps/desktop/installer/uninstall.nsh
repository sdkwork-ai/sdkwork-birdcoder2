; Electron user data and updater downloads leave with the application; the Harness home is never touched.
!include FileFunc.nsh
Var UnTarget
Var UnHome

; The helper refuses unsafe roots, the installation and the Harness home, and never descends into reparse points;
; a locked file leaves residue and never fails the uninstall. customCheckAppRunning extracts window-frame.dll first.
Function un.RemoveData
  System::Call '$PLUGINSDIR\window-frame.dll::UninstallRemoveData(w "$UnTarget", w "$INSTDIR", w "$UnHome") ?c'
FunctionEnd

Function un.CleanData
  ${If} ${isUpdated}
    Return
  ${EndIf}
  ; The installer runs an older uninstaller with /KEEP_APP_DATA when replacing it from another directory.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ; Only a DSH_HOME published as a Windows environment variable is visible here.
  ReadEnvStr $UnHome DSH_HOME
  ClearErrors
  ; FORK DIVERGENCE (AGENTS.md, "Desktop application identity"): Electron derives
  ; the user-data directory from the packaged manifest's `productName`, so
  ; BirdCoder owns `%APPDATA%\BirdCoder`.
  ;
  ; Upstream's `%APPDATA%\${APP_PACKAGE_NAME}` removal is dropped, not retargeted.
  ; That directory is `%APPDATA%\@deepseek-ai\dsh-desktop` — the scoped package
  ; name this fork shares with upstream — so it belongs to an installed DeepSeek
  ; Harness desktop application, and an uninstall here would delete that
  ; application's Chromium profile, logs and single-instance lock. Builds before
  ; the identity split left the same residue there; it is left in place for the
  ; same reason. `UninstallRemoveEmptyParents` existed only for that nested path.
  StrCpy $UnTarget "$APPDATA\${PRODUCT_NAME}"
  Call un.RemoveData
  StrCpy $UnTarget "$LOCALAPPDATA\${DSH_UPDATER_CACHE_NAME}"
  Call un.RemoveData
FunctionEnd
