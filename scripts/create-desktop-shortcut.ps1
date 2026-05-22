$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'CONTABILIDAD ARTES BUHO.url'

$content = @"
[InternetShortcut]
URL=http://localhost:4070
IconFile=%SystemRoot%\System32\shell32.dll
IconIndex=13
"@

Set-Content -Path $shortcutPath -Value $content -Encoding ASCII
Write-Output "Acceso directo creado: $shortcutPath"
