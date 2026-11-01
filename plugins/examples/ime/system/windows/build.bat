@echo off
rem Builds BreezellIME64.dll and BreezellIME32.dll (static C runtime: no redistributable needed in
rem the programs that load them). Usage: build.bat <out dir>
setlocal
set SRC=%~dp0
set OUT=%~1
if "%OUT%"=="" set OUT=%SRC%out
set VCVARS="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
for %%A in (x64 x86) do (
	if not exist "%OUT%\%%A" mkdir "%OUT%\%%A"
)
call :build x64 64 || exit /b 1
call :build x86 32 || exit /b 1
echo BUILD-OK
exit /b 0

:build
setlocal
call %VCVARS% %1 >nul || exit /b 1
rc /nologo /fo "%OUT%\%1\BreezellIME.res" "%SRC%BreezellIME.rc" || exit /b 1
cl /nologo /LD /O2 /MT /EHsc /std:c++17 /utf-8 /W3 /DUNICODE /D_UNICODE /Fo"%OUT%\%1\\" "%SRC%BreezellIME.cpp" "%OUT%\%1\BreezellIME.res" /Fe"%OUT%\%1\BreezellIME%2.dll" /link /DEF:"%SRC%BreezellIME.def" ole32.lib oleaut32.lib advapi32.lib user32.lib gdi32.lib uuid.lib d2d1.lib dwrite.lib dwmapi.lib || exit /b 1
endlocal
exit /b 0
