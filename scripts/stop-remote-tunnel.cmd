@echo off
powershell -NoProfile -Command "$procs=Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Where-Object { $_.CommandLine -like '*localhost:4070*' }; foreach($p in $procs){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Output 'Tunnel remoto detenido.'"
