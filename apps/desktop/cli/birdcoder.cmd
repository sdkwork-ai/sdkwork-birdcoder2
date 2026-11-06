@echo off
setlocal DisableDelayedExpansion
rem The brand manifest owns the Harness home and the login identity; an explicit
rem DSH_HOME or DSH_BRAND_PROTOCOL wins.
if not defined DSH_HOME set "DSH_HOME=@BRAND_HOME@"
if not defined DSH_BRAND_PROTOCOL set "DSH_BRAND_PROTOCOL=@BRAND_PROTOCOL@"
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\birdcoder.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
