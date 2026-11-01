@echo off
setlocal
set VCVARS="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
call %VCVARS% x64 >nul
cd /d "%~dp0out"
cl /nologo /EHsc /utf-8 /Fe:comtest64.exe ..\comtest.cpp ole32.lib uuid.lib user32.lib >nul || exit /b 1
dumpbin /nologo /exports x64\BreezellIME64.dll | findstr /R "Dll"
comtest64.exe "%~dp0out\x64\BreezellIME64.dll"
endlocal
setlocal
call %VCVARS% x86 >nul
cd /d "%~dp0out"
cl /nologo /EHsc /utf-8 /Fe:comtest32.exe ..\comtest.cpp ole32.lib uuid.lib user32.lib >nul || exit /b 1
comtest32.exe "%~dp0out\x86\BreezellIME32.dll"
