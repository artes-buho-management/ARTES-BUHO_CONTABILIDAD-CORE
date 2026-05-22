@echo off
setlocal
set "ROOT=%~dp0.."
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c','cd /d ""%ROOT%"" && node server.js' | Out-Null"
endlocal
exit /b 0
