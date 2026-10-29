@echo off
setlocal DisableDelayedExpansion
rem The brand manifest owns the Harness home; an explicit DSH_HOME wins.
if not defined DSH_HOME set "DSH_HOME=@BRAND_HOME@"
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\birdcoder.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
