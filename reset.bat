@echo off
rem reset
::  This script restores the site folder from the compressed backup.
::  Usage: reset [folder] [-h, --hard]

:: Global variables.
set "_parOneReset=%~1"
set "_checkParOneRest=-%_parOneReset%-"
set "_curSiteZip=site.zip" & rem default to site.zip

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
   set "_resetSite=site"
   call :_startReset --run & goto:eof   
  ) else (
   if "%_parOneReset%"=="--hard" (
    call :_startReset 2 --hard & goto:eof
   ) else if "%_parOneReset%"=="-h" (
    call :_startReset 2 --hard & goto:eof
   ) else (
    if NOT EXIST "%_parOneReset%" mkdir "%_parOneReset%" >nul 2>nul
    set "_resetSite=%_parOneReset%"
    call :_startReset --run & goto:eof
   )
  )
 )
 if "%1"=="2" (
  if "%2"=="--hard" (
   if EXIST "support\.workingSite.zip" (
    set "_resetSite=site"
    set "_curSiteZip=support\.workingSite.zip"
    call :_startReset --run & goto:eof
   ) else (
    echo The file "support\.workingSite.zip" does not exist.
    echo Create one^? Y or n
    echo NOTE - ensure the current status of test site's templating syntax is correct.
    echo:
    set /P _createWorkingReset=
    call :_startReset 3 --hard & goto:eof
   )
  )
 )
 if "%1"=="3" (
  if /i "%_createWorkingReset%"=="y" (
   call save.bat --hard
  ) else (
   echo No correct templating state of the test site was saved to support.
  )
 )
 if "%1"=="--run" (
  tar -xf %_curSiteZip% -C %_resetSite%\
 )
 goto _removeBatchVariables
goto:eof

:_removeBatchVariables
 set _parOneReset=
 set _checkParOneRest=
 set _createWorkingReset=
 set _resetSite=
 set _curSiteZip=
goto:eof