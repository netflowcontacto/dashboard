# Permisos: que ve cada rol

Definidos en un solo lugar: `src/lib/permissions.ts`.

## Roles

| Rol | Quien | Alcance |
|---|---|---|
| `admin` | Dirección (Leandro, Facundo) | Empresa completa, incluida toda la información financiera |
| `member` | Equipo (Sophia, Max, Santiago) | Su trabajo, su area y la operación comercial |

El **area** (`direccion`, `closer`, `paid_media`, `setter`, `desarrollo`) define que
métricas se le calculan a cada persona y puede sumar permisos puntuales.

## Capacidades

| Capacidad | admin | member | Notas |
|---|:---:|:---:|---|
| `finanzas:ver` | Si | No | Caja, margenes, runway, resultado, todos los gastos |
| `finanzas:cargar` | Si | No | Alta de gastos de cualquier categoría |
| `paid_media:cargar` | Si | Solo Paid Media | **Únicamente** gastos de inversión publicitaria |
| `funnel:ver` | Si | No | Funnel completo con CAC y revenue |
| `clientes:ver_fees` | Si | No | Fee mensual y estado de cobro |
| `clientes:ver` | Si | Si | Ficha operativa, sin números de facturación |
| `crm:ver_todo` / `crm:editar` | Si | Si | El CRM es una herramienta compartida |
| `equipo:ver_todos` | Si | No | Resultados individuales de terceros |
| `objetivos:cargar` | Si | No | Todos ven objetivos; solo dirección los define |
| `usuarios:gestionar` / `ajustes:gestionar` | Si | No | |

## Lo que el equipo NO ve

Garantizado por permisos, no por omitirlo de la pantalla:

- Caja total de la empresa
- Margenes internos (bruto, neto, por cliente)
- Costos de otros miembros
- Capital disponible y runway
- Rentabilidad
- Fee mensual y estado de cobro de los clientes
- Alertas de cobros y facturación

En `/mi-panel` **no se ejecuta ninguna consulta financiera** para quien no tiene
`finanzas:ver`: los datos no se cargan y después se ocultan, directamente no se piden.

## Como se aplica

Tres capas, en este orden:

1. **Navegación.** El menu se arma en el servidor según permisos: el equipo ni siquiera
   recibe el link a Finanzas.
2. **Página.** Cada página sensible empieza con `requireAdmin()`. Adivinar la URL redirige
   a `/mi-panel`. *Ocultar un link no es un control de acceso; esta capa si lo es.*
3. **Server action.** Toda escritura vuelve a verificar el permiso antes de tocar la base.
   Un formulario manipulado desde el navegador no alcanza para escribir.

Además: sin sesión valida, cualquier ruta redirige a `/login`.

## Caso especial: Paid Media

Sophia necesita cargar la inversión publicitaria (es su herramienta de trabajo y la fuente
del CPL), pero no tiene por que ver el resto de los costos.

Por eso existe `paid_media:cargar`, que habilita `/inversión`: carga de pauta y creativos
y métricas de su area, con la categoría fijada en `paid_media`. El server action rechaza
cualquier otra categoría para ese rol.
