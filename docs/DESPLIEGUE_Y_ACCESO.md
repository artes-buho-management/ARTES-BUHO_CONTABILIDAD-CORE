# DESPLIEGUE Y ACCESO

## 1) DESPLIEGUE LOCAL (RECOMENDADO PARA EMPEZAR)

1. Abre terminal en:
   - `C:\Users\elrub\Desktop\CARPETA CODEX\CONTABILIDAD-ARTES-BUHO`
2. Arranca la app:
   - `npm start`
3. Abre en navegador:
   - `http://localhost:4070`
4. Entra con password inicial:
   - `ArtesBuho#2026`
5. Cambia password en:
   - `Ajustes -> Seguridad`

## 2) ARRANQUE EN SEGUNDO PLANO (SIN MOLESTAR)

- Iniciar oculto:
  - `scripts\start-app-hidden.cmd`
- Parar proceso:
  - `scripts\stop-app.cmd`

## 3) ACCESO DESDE LA RED LOCAL (MISMA WIFI/LAN)

1. Ejecuta:
   - `npm run start:lan`
2. Obtén IP local del PC:
   - `ipconfig`
3. Desde otro dispositivo abre:
   - `http://IP_LOCAL_DEL_PC:4070`

## 4) ACCESO REMOTO (INTERNET)

### Opcion simple y barata: Cloudflare Tunnel

1. Arranca la app en LAN:
   - `npm run start:lan`
2. En otra terminal lanza tunnel:
   - `cloudflared tunnel --url http://localhost:4070`
3. Cloudflare devolvera una URL HTTPS publica.
4. Abre esa URL desde cualquier lugar.

### Atajo con scripts

- Iniciar tunel:
  - `scripts\\start-remote-tunnel.cmd`
- Parar tunel:
  - `scripts\\stop-remote-tunnel.cmd`
- La URL se guarda en:
  - `cloudflared.log`

## 5) SEGURIDAD MINIMA ANTES DE ABRIR INTERNET

- Cambiar password inicial obligatoriamente.
- Usar password fuerte (10+ caracteres, mayuscula, minuscula, numero y simbolo).
- No exponer puertos directos al router.
- Usar tunel HTTPS.
- Hacer backup regular de `data/`.

## 6) BACKUP

Carpeta de datos:

- `C:\Users\elrub\Desktop\CARPETA CODEX\CONTABILIDAD-ARTES-BUHO\data`

Recomendado:

- copia diaria de `data/` a otra unidad o nube cifrada.
- conservar historico semanal.

## 7) FLUJO DE ACTUALIZACION DE CODIGO

1. Edita codigo.
2. Prueba local (`npm start`).
3. Commit:
   - `git add .`
   - `git commit -m "feat: mejora modulo X"`
4. Push:
   - `git push origin main`
5. Reinicia la app donde este ejecutandose.

## 8) VALIDACION RAPIDA POST-DEPLOY

- Health:
  - `http://localhost:4070/api/health`
- Login correcto.
- Dashboard carga.
- Alta de factura/gasto funciona.
- Exportacion CSV funciona.

## 9) DESPLIEGUE EN VERCEL (GITHUB CONECTADO)

1. En Vercel:
   - `Add New -> Project`
   - Selecciona repo `CONTABILIDAD-ARTES-BUHO`
2. Framework:
   - `Other`
3. Root directory:
   - `/` (raiz del repo)
4. Deploy.

Notas importantes:

- Este proyecto en Vercel guarda datos en `/tmp` (efimero).
- Para produccion real, conecta persistencia en Supabase (Postgres).
- Si tu GitHub ya esta conectado con Vercel/Supabase, el flujo queda:
  - push a `main` -> deploy automatico.

## 10) DESPLIEGUE POR CLI (OPCIONAL)

Si prefieres publicar por terminal:

1. Login una sola vez:
   - `vercel login`
2. Enlazar proyecto (solo primera vez):
   - `vercel link`
3. Deploy a produccion:
   - `vercel --prod`

Atajo incluido en este repo:

- `powershell -ExecutionPolicy Bypass -File scripts\deploy-vercel.ps1`

Si el CLI indica que no hay sesion, no es error del codigo:

- falta autenticar Vercel CLI en este equipo.
- alternativa directa: desplegar desde panel Vercel con GitHub importado.
