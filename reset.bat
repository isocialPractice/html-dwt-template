@echo off
REM Site Restore Batch Script
REM This script restores the site folder from the compressed backup
REM Usage: reset [folder]

set "_parOneReset=%~1"
set "_checkParOneRest=-%_parOneReset%-"

:: Ensure current directory.
cd /D "%~dp0"

if NOT EXIST "site.zip" (
 call save.bat
)
call :_startReset 1
goto:eof

:_startReset
 if "%1"=="1" (
  if "%_checkParOneRest%"=="--" (
   tar -xf site.zip -C site\
  ) else (
   if "%_parOneReset%"=="--hard" (
    call :_startReset 2 --hard
   ) else if "%_parOneReset%"=="-h" (
    call :_startReset 2 --hard
   ) else (
    if NOT EXIST "%_parOneReset%" mkdir "%_parOneReset%" >nul 2>nul
    tar -xf site.zip -C "%_parOneReset%"\
   )
  )
 )
 if "%1"=="2" (
  if "%2"=="--hard" (
   tar -xf "support\.workingSite.zip" -C site\
  )
 )
 goto :_removeBatchVariables
goto:eof

:_removeBatchVariables
 set _parOneReset=
 set _checkParOneRest=
goto:eof