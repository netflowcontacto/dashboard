# Integraciones

Ninguna es necesaria para que el dashboard funcione. Si no esta configurada, el endpoint
responde `503` y la carga sigue siendo manual.

## Como funciona el camino de entrada

Uno solo, igual para todas las fuentes:

```
webhook → se guarda el payload crudo en integration_events
        → se normaliza a un lead o una reunión
        → se aplica sobre el CRM (crear o actualizar)
```

Guardar el crudo primero permite auditar exactamente que llego y reprocesar sin pedirle
nada al proveedor cuando cambia el mapeo. Todo queda visible en **Integraciones**.

Los leads entrantes se **deduplican por email o teléfono** contra oportunidades abiertas:
si el contacto ya existe, se actualiza en vez de duplicarse.

---

## Formularios y landings — V1, funcionando

```
POST /api/integrations/leads
Header: X-NetFlow-Token: <INTEGRATIONS_INBOUND_TOKEN>
Content-Type: application/json
```

```json
{
  "name": "Dra. Paula Rivas",
  "email": "paula@ejemplo.com",
  "phone": "+5491100000000",
  "company": "Centro Dermatologico Rivas",
  "specialty": "Dermatologia",
  "source": "meta_ads",
  "notes": "Vino del formulario de la landing",
  "meeting_at": "2026-09-02 15:00:00",
  "external_id": "form-12345"
}
```

Solo `name` es obligatorio. `external_id` evita procesar dos veces el mismo envio.

Respuesta: `{ "ok": true, "lead_id": 42, "created": true }`.

**Activar:** definir `INTEGRATIONS_INBOUND_TOKEN` (`openssl rand -hex 32`) y configurar el
formulario para que haga el POST con ese header.

---

## Calendly — V2, prioridad

Implementado y con validación de firma. Falta activarlo.

**Activar:**

1. En Calendly: crear un webhook apuntando a
   `https://<dominio>/api/integrations/calendly`
2. Suscribir los eventos `invitee.created` e `invitee.canceled`
3. Guardar la signing key en `CALENDLY_WEBHOOK_SIGNING_KEY`

Que hace al recibir un evento:

- `invitee.created` → crea o actualiza la oportunidad, la pasa a *Reunión agendada*, carga
  la fecha y deja la reunión espejada en el calendario.
- `invitee.canceled` → marca la reunión como cancelada.

Toda peticion sin firma valida se rechaza con `401`.

---

## Google Calendar — V2

Requiere credenciales OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`) y autorización por persona. La tabla `meetings` ya contempla
`source` y `external_id` para recibir los eventos.

## Meta Ads — V3

Token de sistema con permiso `ads_read` (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`).
Reemplaza la carga manual de inversión; el CPL pasa a actualizarse solo.

## ManyChat — V3

Usa el mismo endpoint de leads con `"source": "manychat"`, via External Request.
