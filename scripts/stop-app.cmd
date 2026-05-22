@echo off
set "ROOT=%~dp0.."
powershell -NoProfile -Command "$root='%ROOT%'; $procs=Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like \"*$root*server.js*\" }; foreach($p in $procs){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Output 'Procesos de CONTABILIDAD ARTES BUHO detenidos.'"
