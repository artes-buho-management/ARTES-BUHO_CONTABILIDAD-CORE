Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$vercelCmd = Join-Path $env:APPDATA "npm\vercel.cmd"
if (-not (Test-Path $vercelCmd)) {
  Write-Host "ERROR: No se encuentra vercel CLI en $vercelCmd"
  Write-Host "Instala con: npm i -g vercel"
  exit 1
}

$authPath = Join-Path $env:APPDATA "com.vercel.cli\Data\auth.json"
if (-not (Test-Path $authPath)) {
  Write-Host "ERROR: No hay sesion de Vercel en este equipo."
  Write-Host "Ejecuta una vez: vercel login"
  exit 1
}

$authRaw = Get-Content $authPath -Raw
if ([string]::IsNullOrWhiteSpace($authRaw) -or $authRaw.Trim() -eq "{}") {
  Write-Host "ERROR: auth.json vacio. Falta iniciar sesion en Vercel."
  Write-Host "Ejecuta una vez: vercel login"
  exit 1
}

Write-Host "Publicando en Vercel (produccion)..."
& $vercelCmd --prod --yes
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: fallo el deploy en Vercel CLI."
  exit $LASTEXITCODE
}

Write-Host "OK: Deploy lanzado."
