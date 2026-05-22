@echo off
setlocal
cd /d "%~dp0\.."
set "LOG=cloudflared.log"
if exist "%LOG%" del "%LOG%"
start "" /min cmd /c "cloudflared tunnel --url http://localhost:4070 --no-autoupdate --logfile %LOG%"
echo Tunnel iniciando...
echo Revisa la URL en: %cd%\%LOG%
endlocal
