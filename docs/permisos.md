# Accesos: qué ve y qué puede hacer cada uno

## La regla, en una frase

**Los cinco del equipo ven exactamente lo mismo. La facturación es de Dirección.**

No hay niveles intermedios ni permisos por persona. Si algo es operativo, lo ve
todo el mundo; si es plata que entra, lo ve Dirección. Esa es toda la política.

---

## Las seis cuentas

| Persona | Área | Rol | Ve facturación |
|---|---|---|:---:|
| **Administración** | Dirección | `admin` | **Sí** |
| Facundo | Closer | equipo | No |
| Leandro | Marketing y contenido | equipo | No |
| Sophia | Paid Media | equipo | No |
| Max | Setter | equipo | No |
| Santiago | Desarrollo | equipo | No |

El **área** no cambia lo que la persona puede ver: cambia qué métricas se le
calculan y qué objetivos se le pueden cargar. Max ve el mismo dashboard que
Santiago; lo que difiere es que a Max se le miden reuniones agendadas y show
rate, y a Santiago entregas a tiempo y proyectos terminados.

Para cambiar quién es administrador: **Ajustes → Equipo y accesos**. Nadie puede
desactivarse a sí mismo, así que no se puede quedar el sistema sin administrador.

---

## Lo que ven los cinco del equipo

Todo esto, completo, sin pedirle permiso a nadie:

- **CRM entero** — todas las oportunidades, de cualquier responsable. Crear,
  editar, mover de etapa, registrar follow-ups, cerrar como ganada o perdida.
- **Clientes** — la ficha operativa de cada cuenta: plan, especialidad,
  responsables, desarrollo, landing, onboarding, semáforo y alertas. Pueden
  actualizar el estado de la cuenta.
- **Funnel comercial** — el embudo completo con inversión publicitaria, CPL,
  CAC, todas las conversiones y el cuello de botella.
- **Objetivos** — los de la empresa, los de cada área y los de cada persona.
- **Equipo y performance** — el resultado de todos, no solo el propio.
- **Tareas y proyectos** — crear, asignar, mover y cerrar.
- **Archivos** — adjuntar y descargar en oportunidades y clientes.
- **Calendario, alertas y avisos.**

Además, según el área:

| Área | Permiso extra |
|---|---|
| Paid Media | Cargar inversión publicitaria y registrar creativos y tests, en `/inversión`. Es su herramienta de trabajo y la fuente del CPL. No abre ninguna otra categoría de gasto. |

---

## Lo que es solo de Dirección

**Cuatro pantallas, que para el resto del equipo directamente no existen:**

- `/finanzas` — caja, MRR, facturación cobrada y pendiente, resultado,
  márgenes, burn, runway, gastos por categoría y margen por cliente.
- `/ajustes` — tipo de cambio, reglas operativas, alta y baja de personas.
- `/integraciones` — configuración de webhooks.
- `/clientes/nuevo` — alta manual de cliente (el alta normal ocurre sola al
  cerrar una oportunidad como ganada).

Y dentro de pantallas compartidas, estos datos tampoco aparecen:

- El **fee mensual** y el **estado de cobro** de cada cliente.
- Las métricas de facturación: **MRR total**, **MRR nuevo**,
  **facturación cobrada**, **revenue generado**.
- Los objetivos definidos sobre esas métricas.
- Las alertas de cobros.

También es de Dirección **cargar** gastos y facturación, definir objetivos, dar
de alta personas y cambiar los ajustes — aunque el dato en sí sea visible.

---

## Cómo se garantiza

No alcanza con esconder un enlace. Son cuatro capas, en orden:

1. **Navegación.** El menú se arma en el servidor: el equipo ni siquiera
   recibe el enlace a Finanzas.
2. **La pantalla devuelve 404.** Adivinar la URL no muestra "no tenés permiso"
   — muestra que la página no existe. Es deliberado: un cartel de acceso
   denegado informa de que hay algo detrás; un 404 no.
3. **Las métricas de facturación se filtran en el motor**, no en la vista. Las
   tarjetas de MRR ni siquiera se calculan para quien no las puede ver.
4. **Toda escritura revalida el permiso** antes de tocar la base. Un formulario
   manipulado desde el navegador no alcanza para escribir.

Está verificado con una prueba automatizada que recorre las 14 pantallas con
las cinco cuentas del equipo y falla si aparece cualquier número de facturación
o si alguna pantalla de administración responde algo distinto de 404.

---

## Si alguna vez hace falta cerrar más

En **Ajustes → Visibilidad del equipo** hay dos modos:

- **Abierta** (el de fábrica): lo descrito arriba.
- **Restringida**: además se cierra el funnel y los resultados individuales de
  terceros; cada persona ve solo lo suyo. La facturación sigue siendo de
  Dirección en los dos modos.

Cambiarlo no requiere tocar código ni volver a desplegar.
