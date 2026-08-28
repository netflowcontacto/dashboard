# Puesta en producción

## Qué opción elegir

NetFlow guarda todo en **un archivo SQLite**. Eso hace la V1 simple y rápida, pero
condiciona dónde puede vivir: necesita **un disco que persista** y **un solo proceso
escribiendo**. Con eso en mente:

| Opción | Cuándo conviene | Costo aprox. |
|---|---|---|
| **VPS con Docker** ← recomendada | Es lo que corresponde hoy. Disco propio, respaldos, control total. | USD 5–12/mes |
| VPS sin Docker (Node + systemd) | Si ya tenés un servidor y no querés Docker. | igual |
| Vercel / Netlify | **No sirve** tal cual: el disco es efímero, la base se borra en cada deploy. Requiere migrar a Postgres primero. | — |

**Recomendación concreta:** un VPS chico (Hetzner CX22, DigitalOcean, Vultr, Contabo)
con Docker. Con 2 GB de RAM sobra para todo el equipo de NetFlow.

---

## Opción A — VPS con Docker (recomendada)

### 1. Servidor

Cualquier VPS con Ubuntu 24.04. Instalar Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Traer el código

```bash
git clone https://github.com/netflowcontacto/dashboard.git /opt/netflow
cd /opt/netflow
```

### 3. Configurar

```bash
cp .env.example .env
openssl rand -hex 32          # copiar el resultado
nano .env                     # pegarlo en SESSION_SECRET
```

`SESSION_SECRET` es obligatorio: la app **no arranca en producción sin él**. Si se
cambia, se cierran todas las sesiones abiertas (que es lo que uno quiere si se filtró).

### 4. Levantar

```bash
docker compose up -d --build
docker compose exec app node scripts/seed.mjs     # solo la primera vez
```

El seed imprime el usuario y la contraseña inicial. **Cambiarla desde Ajustes en el
primer ingreso.**

### 5. Dominio y HTTPS

La app escucha solo en `127.0.0.1:3000`: el TLS lo termina un proxy adelante. Con Caddy
es dos líneas — obtiene y renueva el certificado solo:

```bash
apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
dashboard.netflow.com.ar {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
systemctl reload caddy
```

Con Nginx sirve igual, sumando certbot para el certificado.

### 6. Verificar

```bash
curl -fsS https://dashboard.netflow.com.ar/api/health
# {"status":"ok","time":"..."}
```

`/api/health` comprueba que la base responde, no solo que el proceso está vivo.

---

## Respaldos

**Esto no es opcional.** Toda la operación de NetFlow va a vivir en un archivo.

`docker compose up` ya levanta un servicio `backup` que copia la base **una vez por día**
a `./backups/`, conserva las últimas 14 y verifica cada copia antes de darla por buena.
Usa la API de backup de SQLite, no `cp`: copiar el archivo con la app escribiendo puede
dejar una copia corrupta.

Respaldo manual:

```bash
docker compose exec backup node scripts/backup.mjs
```

Restaurar:

```bash
docker compose stop app
docker compose run --rm -v ./backups:/backups backup \
  sh -c "cp /backups/netflow-2026-08-28T03-00-00.db /data/netflow.db"
docker compose start app
```

**Sacar las copias del servidor.** Un respaldo en el mismo disco que la base no protege
contra la pérdida del disco. Ejemplo con rclone hacia cualquier nube, en el cron del host:

```bash
0 4 * * * rclone sync /opt/netflow/backups remoto:netflow-backups
```

Probar una restauración antes de necesitarla. Un respaldo que nunca se restauró es una
suposición, no un respaldo.

---

## Actualizar

```bash
cd /opt/netflow
git pull
docker compose up -d --build
```

El esquema se aplica solo al arrancar (`CREATE TABLE IF NOT EXISTS`), así que no hay
paso de migración. Los datos están en el volumen `netflow-data` y no los toca el deploy.

---

## Opción B — VPS sin Docker

```bash
apt install -y nodejs npm
git clone https://github.com/netflowcontacto/dashboard.git /opt/netflow
cd /opt/netflow
npm ci
npm run build
node scripts/seed.mjs
```

`/etc/systemd/system/netflow.service`:

```ini
[Unit]
Description=NetFlow — centro de control
After=network.target

[Service]
Type=simple
User=netflow
WorkingDirectory=/opt/netflow
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_PATH=/opt/netflow/data/netflow.db
Environment=SESSION_SECRET=<pegar el valor de openssl rand -hex 32>
Environment=TZ=America/Argentina/Buenos_Aires
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now netflow
```

Respaldo diario en el cron:

```bash
0 3 * * * cd /opt/netflow && node scripts/backup.mjs >> /var/log/netflow-backup.log 2>&1
```

---

## Variables de entorno

| Variable | Obligatoria | Para qué |
|---|:---:|---|
| `SESSION_SECRET` | **sí** | Firma las cookies de sesión. `openssl rand -hex 32`. |
| `DATABASE_PATH` | no | Ruta del archivo SQLite. En Docker: `/data/netflow.db`. |
| `TZ` | recomendada | `America/Argentina/Buenos_Aires`. Sin esto las fechas usan la zona del servidor. |
| `INTEGRATIONS_INBOUND_TOKEN` | no | Habilita el endpoint de leads entrantes. Vacío = cerrado. |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | no | Habilita el webhook de Calendly. Vacío = cerrado. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | Solo los lee el seed inicial. |

Los endpoints de integración responden `503` mientras su variable esté vacía: cerrados
por defecto, nunca abiertos.

---

## Si más adelante hace falta migrar a Postgres

Con el equipo actual, SQLite aguanta de sobra: soporta cientos de miles de registros y
el cuello es la escritura concurrente, que acá no existe. Conviene migrar cuando pase
alguna de estas cosas:

- Se necesita más de un proceso escribiendo (varias instancias, autoescalado).
- Se quiere desplegar en una plataforma sin disco persistente (Vercel).
- Hace falta acceso concurrente desde otra herramienta.

El acceso a datos está aislado en `src/lib/db.ts` y las consultas son SQL estándar, así
que la migración es acotada: reemplazar el driver, adaptar los `INSERT ... ON CONFLICT`
y correr un volcado. No hace falta anticiparlo ahora.

---

## Checklist antes de cargar datos reales

- [ ] `SESSION_SECRET` propio, generado con `openssl rand -hex 32`
- [ ] Contraseñas del seed cambiadas desde Ajustes
- [ ] HTTPS andando (sin esto las cookies de sesión viajan en claro)
- [ ] `/api/health` responde `ok`
- [ ] El servicio de respaldo corrió al menos una vez
- [ ] Los respaldos se copian **fuera** del servidor
- [ ] Una restauración probada de punta a punta
- [ ] `TZ` configurada en Buenos Aires
