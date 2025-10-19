@echo off
REM save
::  Save current site status in site.zip.
::  Usage: save [file] [-h, --hard]

set "_parOneSave=%~1"
set "_checkParOneSave=-%_parOneSave%-"

if "%_checkParOneSave%"=="--" (
 set "_saveSite=site"
 call :_startSave 1 --default & goto:eof
) else (
 if "%_parOneSave%"=="-h" (
  set "_saveSite=support/.workingSite"
  call :_startSave 1 --hard & goto:eof
 ) else if "%_parOneSave%"=="--hard" (
  set "_saveSite=support/.workingSite"
  call :_startSave 1 --hard & goto:eof
 ) else (
  set "_saveSite=%_parOneSave%"
  call :_startSave 1 --file & goto:eof
 )
)
goto:eof

:_startSave
 if "%1"=="1" (
  if "%2"=="--default" (
   call :_startSave --run & goto:eof
  ) else if "%2"=="--hard" (
   call :_startSave --run & goto:eof
  ) else if "%2"=="--file" (
   call :_startSave --run & goto:eof
  ) else (
   echo Something unexpected happed. Site was not cloned as compressed file.
  )
 )
 if "%1"=="--run" (
  cd /D "%~dp0site"
  tar -acf ../%_saveSite%.zip *
  cd ..
 )
 goto _removeBatchVariablesSave
goto:eof

:_removeBatchVariablesSave
 set _parOneSave=
 set _checkParOneSave=
 set _saveSite=
goto:eof