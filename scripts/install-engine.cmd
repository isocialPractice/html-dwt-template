@echo off
REM install-engine
::  Install the dependencies, taking the template engine from the npm registry,
::  or from its GitHub release tag when the registry cannot provide it.
::  Usage: npm run install:engine, or scripts\install-engine.cmd from anywhere.
::  Exit code: 0 when an install succeeds, 1 when both attempts fail.

:: Engine package, its registry range, and the GitHub release tag to fall back
:: to. Bump the range and the tag with every engine release.
set "_engineNameInstallEngine=@isocialpractice/html-dwt-cmd-template"
set "_registryRangeInstallEngine=1.0.0"
set "_githubSpecInstallEngine=github:isocialPractice/html-dwt-cmd-template#v1.0.0"
set "_exitCodeInstallEngine=0"

:: Help condition.
if "%~1"=="/?" goto _helpInstallEngine
if "%~1"=="-h" goto _helpInstallEngine
if "%~1"=="--help" goto _helpInstallEngine

:: Run from the repository root, where package.json is.
pushd "%~dp0.."

echo Attempting regular npm install...
call npm install
if not errorlevel 1 goto _removeBatchVariablesInstallEngine

echo.
echo Registry install failed. Falling back to GitHub dependency...
call npm pkg set "dependencies.%_engineNameInstallEngine%=%_githubSpecInstallEngine%"
if errorlevel 1 goto _failInstallEngine
call npm install
if errorlevel 1 goto _failInstallEngine

echo.
echo Installed %_engineNameInstallEngine% from %_githubSpecInstallEngine%.
call :_switchBackInstallEngine
goto _removeBatchVariablesInstallEngine


:_failInstallEngine
 echo.
 echo Both installs failed. Check the network and the npm output above.
 set "_exitCodeInstallEngine=1"
 call :_switchBackInstallEngine
goto _removeBatchVariablesInstallEngine

:_switchBackInstallEngine
 rem The caret sits inside quotes, so it prints as a single caret.
 echo package.json now names the GitHub tag. Once the registry works again,
 echo switch back with:
 echo   npm pkg set "dependencies.%_engineNameInstallEngine%=^%_registryRangeInstallEngine%"
 echo   npm install
goto:eof

:_helpInstallEngine
 echo install-engine: install the dependencies, taking %_engineNameInstallEngine%
 echo from the npm registry, or from %_githubSpecInstallEngine%
 echo when the registry cannot provide it.
 echo.
 echo   npm run install:engine
 echo   scripts\install-engine.cmd
 echo.
 echo Exit code: 0 when an install succeeds, 1 when both attempts fail.
 pushd "%~dp0.."
goto _removeBatchVariablesInstallEngine


:_removeBatchVariablesInstallEngine
 popd
 set _engineNameInstallEngine=
 set _registryRangeInstallEngine=
 set _githubSpecInstallEngine=

 rem IMPORTANT - leave last; the exit code expands before the variable clears
 set "_exitCodeInstallEngine=" & exit /b %_exitCodeInstallEngine%
goto:eof
