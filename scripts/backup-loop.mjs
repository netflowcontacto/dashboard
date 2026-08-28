/**
 * Respaldo periódico. Lo usa el servicio `backup` de docker-compose.
 *
 * Es un loop y no un cron del sistema a propósito: así el contenedor no
 * necesita cron instalado ni configuración extra, y el intervalo se cambia
 * con una variable de entorno.
 *
 *   BACKUP_EVERY_HOURS   cada cuántas horas respalda (default 24)
 */
import { runBackup } from "./backup.mjs";

const hours = Math.max(1, Number(process.env.BACKUP_EVERY_HOURS || 24));
const intervalMs = hours * 60 * 60 * 1000;

async function tick() {
  try {
    await runBackup();
  } catch (e) {
    // Un respaldo fallido no debe tumbar el servicio: se registra y se
    // reintenta en el próximo ciclo.
    console.error(`[${new Date().toISOString()}] Falló el respaldo:`, e.message);
  }
}

console.log(`Respaldo automático cada ${hours} h. Destino: ${process.env.BACKUP_DIR || "./backups"}`);
await tick();
setInterval(tick, intervalMs);
