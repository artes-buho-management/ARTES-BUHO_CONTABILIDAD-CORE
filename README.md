# CONTABILIDAD ARTES BUHO

Software web local de contabilidad y gestion para **ARTES BUHO**.
Desarrollado por **RUBEN COTON**.

## ESTADO ACTUAL

Version funcional de trabajo diario, con foco en:

- control financiero
- seguridad local
- velocidad de uso
- mantenimiento simple

## FUNCIONALIDADES IMPLEMENTADAS

- Dashboard con KPIs clave:
  - ventas
  - gastos
  - margen
  - pendiente de cobro
  - facturas vencidas
  - tasa de cobro
  - cashflow mensual
  - IVA neto
- Facturas:
  - alta y listado
  - numeracion automatica
  - estado automatico (Pendiente/Parcial/Pagada/Vencida)
  - filtro por estado y buscador rapido
- Gastos:
  - alta y listado
  - validaciones de importes e IVA
  - filtro por estado y buscador rapido
- Clientes, proveedores, productos y servicios.
- Tesoreria (movimientos bancarios).
- Asientos contables manuales.
- Reportes:
  - IVA
  - PYG (cuenta de resultados) con desglose mensual
- Seguridad:
  - login con sesion
  - cambio de password con politica fuerte
  - logout
  - limitacion de intentos de acceso
  - hash de password robusto (PBKDF2) con compatibilidad de migracion
- Auditoria de acciones.
- Backups automaticos al guardar.
- Exportacion CSV por modulo.
- Buscador global con comandos (ejemplo: `ir facturas`).

## STACK

- Node.js (HTTP nativo, sin frameworks pesados)
- Frontend HTML/CSS/JS vanilla (SPA)
- Persistencia JSON en `data/`

## ARRANQUE RAPIDO

1. Abre terminal en:
   - `C:\Users\elrub\Desktop\CARPETA CODEX\CONTABILIDAD-ARTES-BUHO`
2. Ejecuta:
   - `npm start`
3. Abre en navegador:
   - `http://localhost:4070`
4. Password inicial:
   - `ArtesBuho#2026`
5. Nada mas entrar:
   - cambia la password en `Ajustes -> Seguridad`

## EJECUCION EN SEGUNDO PLANO

- Arrancar oculto:
  - `scripts\start-app-hidden.cmd`
- Parar app:
  - `scripts\stop-app.cmd`
- Arrancar tunel remoto:
  - `scripts\start-remote-tunnel.cmd`
- Parar tunel remoto:
  - `scripts\stop-remote-tunnel.cmd`

## ACCESO DESDE OTROS EQUIPOS

1. Ejecuta:
   - `npm run start:lan`
2. Mira IP local del PC:
   - `ipconfig`
3. En otro dispositivo de la misma red abre:
   - `http://IP_LOCAL_DEL_PC:4070`

## ACCESO REMOTO POR INTERNET

Ver pasos completos en:

- `docs/DESPLIEGUE_Y_ACCESO.md`

## DESPLIEGUE EN VERCEL (RECOMENDADO PARA URL PUBLICA)

Flujo simple con GitHub ya conectado:

1. Importar el repo en Vercel una sola vez:
   - `Add New -> Project -> CONTABILIDAD-ARTES-BUHO`
2. Dejar Root Directory en `/`.
3. Deploy inicial.
4. Desde ese momento:
   - cada `git push origin main` lanza deploy automatico.

Importante:

- En Vercel, la carpeta local `data/` no es persistente (se usa `/tmp`).
- Si quieres datos estables en cloud, siguiente fase:
  - conectar Supabase Postgres como persistencia principal.
- Password de arranque por variable:
  - `CAB_PASSWORD` (si no existe, usa la password por defecto interna).

Script de apoyo local:

- `scripts\deploy-vercel.ps1`
  - publica desde CLI si ya tienes sesion de Vercel iniciada.

## ESTRUCTURA

- `server.js`: API, negocio, seguridad y persistencia
- `public/index.html`: interfaz
- `public/app.js`: logica cliente
- `public/styles.css`: estilos
- `data/`: datos y backups
- `scripts/`: arranque/parada/accesos
- `docs/`: analisis y despliegue

## FLUJO DE ACTUALIZACION

1. Editar codigo.
2. Probar localmente.
3. Commit.
4. Push al repositorio.
5. Reiniciar app local o servidor remoto.

## ROADMAP PREMIUM (SIGUIENTE FASE)

- multiusuario y roles
- conciliacion bancaria asistida
- impuestos avanzados (modelos AEAT)
- factura electronica y Verifactu
- automatizacion de cierres mensuales
- informes avanzados (rentabilidad por cliente/linea)

---

## CIERRE DE ENTORNO LOCAL (MIGRACION)

- Fecha de cierre: 2026-04-08 15:24:45
- Estado: preparado para migrar a nuevo PC/sistema cloud.
- Repositorio: sincronizado con GitHub en la rama activa.
- Nota: este proyecto queda listo para retomar desde otro equipo clonando el repo.

### CHECKLIST RAPIDA

- [x] Codigo versionado en GitHub.
- [x] README actualizado para traspaso.
- [x] Trabajo local preparado para cierre.


<!-- CIERRE_MIGRACION_2026_04_08 -->
## Cierre de migracion (2026-04-08)
- Estado: preparado para mover a nuevo PC/sistema cloud.
- Fecha de cierre: 
2026-04-08 15:25:38 +02:00
- Rama activa: 
main
- Nota: cambios subidos a GitHub para reanudar desde otro entorno.



## CIERRE CLOUD (2026-04-08)

- Estado: repositorio preparado para migracion a nuevo sistema.
- Ultimo cierre tecnico: 2026-04-08 (Europe/Madrid).
- Siguiente uso recomendado: clonar desde GitHub y continuar en la rama actual.


## CIERRE MIGRACION CLOUD

- Fecha: 2026-04-08
- Estado: preparado para retomar desde nuevo sistema


## CIERRE CLOUD 2026-04-08
- Estado: sincronizado para migracion a nuevo PC/sistema.
- Preparado para retomar desde GitHub.
- Ultima revision: 2026-04-08 15:26:05 +02:00

<!-- MIGRACION_CLOUD_START -->
## ESTADO MIGRACION CLOUD
- Revisado: 2026-04-08
- Repo listo para continuar en otro sistema.
- Estado Git al cerrar: sincronizado en GitHub.
<!-- MIGRACION_CLOUD_END -->
