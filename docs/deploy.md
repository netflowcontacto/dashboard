# Puesta en producción

## Qué opción elegir

NetFlow usa **PostgreSQL**, así que corre tanto en una plataforma sin servidor como
en un VPS. Las dos opciones son válidas:

| Opción | Cuándo conviene | Costo |
|---|---|---|
| **Netlify + Postgres gestionado** ← la que pediste | Sin servidor que mantener. Deploy con `git push`. | **Gratis** en los planes iniciales |
| VPS con Docker | Si preferís tener todo en una máquina propia. | USD 5–12/mes |

En Netlify el disco de las funciones es **efímero**: por eso la base no vive ahí sino
en un Postgres gestionado, y los archivos adjuntos en Netlify Blobs. La aplicación ya
está preparada para las dos cosas; no hay nada que configurar en el código.

---

## Opción A — Netlify (gratis)

### 1. Crear la base

Cualquiera de estas sirve, todas con plan gratuito:

- **Netlify DB** — la más directa: se crea desde el panel del sitio y deja la
  variable cargada sola.
- **Neon** — Postgres gestionado con plan gratuito.
- **Supabase** — Postgres gestionado con plan gratuito.

Copiar la **cadena de conexión agrupada** (dice *pooled* o *pooler*). Es importante:
sin ella, cada invocación de una función abre su propia conexión y se agota el límite
de la base.

### 2. Conectar el repositorio

En Netlify: **Add new site → Import an existing project** y elegir el repositorio.
El `netlify.toml` ya trae el comando de build y el plugin de Next.js, así que no hay
que configurar nada.

### 3. Cargar las variables

**Site settings → Environment variables:**

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena agrupada del paso 1 |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `TZ` | `America/Argentina/Buenos_Aires` |

### 4. Desplegar y sembrar

El primer deploy arranca solo. El esquema se crea al primer arranque
(`CREATE TABLE IF NOT EXISTS`), pero el equipo y los objetivos hay que sembrarlos
una vez, desde tu máquina:

```bash
DATABASE_URL="<la misma cadena>" npm run db:seed
```

Imprime las seis cuentas y la contraseña inicial. **Cambiarlas desde Ajustes en el
primer ingreso.**

### 5. Verificar

```bash
curl -fsS https://<tu-sitio>.netlify.app/api/health
# {"status":"ok","time":"..."}
```

`/api/health` comprueba que la base responde, no solo que la función arrancó.

### Sobre el plan gratuito

- La base **se suspende** cuando no se usa y tarda unos cientos de milisegundos en
  despertar. Para una herramienta interna es imperceptible.
- El almacenamiento del plan gratuito (medio giga en Neon) alcanza de sobra: este
  sistema guarda texto y números, no archivos — los adjuntos van a Netlify Blobs.
- Los **respaldos** los hace el proveedor de la base (Neon y Supabase tienen
  restauración a un punto en el tiempo). Igual conviene bajar un volcado propio de vez
  en cuando: `pg_dump "$DATABASE_URL" | gzip > netflow-$(date +%F).sql.gz`

---

## Opción B — VPS con Docker

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

`docker compose` levanta también el PostgreSQL, así que `DATABASE_URL` ya viene
armada. Conviene poner un `POSTGRES_PASSWORD` propio en el `.env`.

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

**En Netlify** los respaldos los hace el proveedor de la base (Neon y Supabase tienen
restauración a un punto en el tiempo). Conviene además bajar un volcado propio:

```bash
pg_dump "$DATABASE_URL" | gzip > netflow-$(date +%F).sql.gz
```

**Con Docker**, `docker compose up` levanta un servicio `backup` que hace `pg_dump`
comprimido **una vez por día** a `./backups/` y conserva los últimos 14.

Respaldo manual:

```bash
docker compose exec backup sh -c 'pg_dump -h postgres -U netflow -d netflow | gzip > /backups/manual.sql.gz'
```

Restaurar:

```bash
docker compose stop app
docker compose exec -T postgres psql -U netflow -d netflow -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c backups/netflow-2026-08-28.sql.gz | docker compose exec -T postgres psql -U netflow -d netflow
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

## Opción C — VPS sin Docker

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
| `DATABASE_URL` | **sí** | Conexión a PostgreSQL. En Netlify, la cadena **agrupada**. |
| `SESSION_SECRET` | **sí** | Firma las cookies de sesión. `openssl rand -hex 32`. |
| `UPLOADS_DIR` | no | Carpeta de adjuntos fuera de Netlify. En Netlify se usa Blobs. |
| `TZ` | recomendada | `America/Argentina/Buenos_Aires`. Sin esto las fechas usan la zona del servidor. |
| `INTEGRATIONS_INBOUND_TOKEN` | no | Habilita el endpoint de leads entrantes. Vacío = cerrado. |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | no | Habilita el webhook de Calendly. Vacío = cerrado. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | Solo los lee el seed inicial. |

Los endpoints de integración responden `503` mientras su variable esté vacía: cerrados
por defecto, nunca abiertos.

---

---

## Checklist antes de cargar datos reales

- [ ] `DATABASE_URL` apuntando a la cadena **agrupada** del Postgres
- [ ] `SESSION_SECRET` propio, generado con `openssl rand -hex 32`
- [ ] Contraseñas del seed cambiadas desde Ajustes
- [ ] HTTPS andando (sin esto las cookies de sesión viajan en claro)
- [ ] `/api/health` responde `ok`
- [ ] Un volcado de respaldo hecho y guardado fuera de la plataforma
- [ ] Una restauración probada de punta a punta
- [ ] `TZ` configurada en Buenos Aires
