import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolveRange, plural } from "@/lib/dates";
import { rendimientoDeAnuncios, type FilaAnuncio, type Nivel } from "@/lib/metrics/anuncios";
import { CLASE_CREATIVIDAD_LABEL, type ClaseCreatividad } from "@/lib/adquisicion";
import { formatMoney } from "@/lib/money";
import { loadFx } from "@/lib/fx";
import { clientsList } from "@/lib/queries";
import { Badge, Card, EmptyState, Note, PageHeader, StatCard, formatPct } from "@/components/ui";
import RangePicker from "@/components/RangePicker";
import Filtros from "./Filtros";
import ImportForm from "./ImportForm";

export const dynamic = "force-dynamic";

/**
 * Rendimiento de los anuncios.
 *
 * Es la pantalla que junta las dos mitades: lo que cobra la plataforma
 * (gasto, impresiones, clics) y lo que pasó después dentro del CRM
 * (calificados, turnos, cierres). El CPL lo sabe Meta; el CPQL y el costo por
 * turno solo los puede saber este sistema.
 *
 * Por eso la tabla ordena por inversión y no por CTR: la pregunta que viene a
 * responder es "dónde se está yendo la plata y qué trae", no "qué anuncio
 * tuvo más clics".
 */

const TONO: Record<ClaseCreatividad, "ok" | "brand" | "warn" | "risk" | "neutral"> = {
  ganadora: "ok",
  escalando: "brand",
  probando: "warn",
  flojo: "risk",
  sin_datos: "neutral",
};

export default async function AnunciosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const puedeCargar = can(user, "paid_media:cargar");
  const sp = await searchParams;

  const range = resolveRange({
    preset: sp.preset as string,
    from: sp.from as string,
    to: sp.to as string,
  });
  const nivel: Nivel = sp.nivel === "campaña" ? "campaña" : "anuncio";
  const clientId = sp.cliente ? Number(sp.cliente) : undefined;

  const [fx, clientes] = await Promise.all([loadFx(), clientsList()]);
  const filas = await rendimientoDeAnuncios(range, fx, { clientId, nivel });
  const cur = fx.base;

  const total = filas.reduce(
    (a, f) => ({
      inversion: a.inversion + f.inversion,
      leads: a.leads + f.leads,
      calificados: a.calificados + f.calificados,
      turnos: a.turnos + f.turnos,
    }),
    { inversion: 0, leads: 0, calificados: 0, turnos: 0 },
  );

  const conGasto = filas.filter((f) => f.inversion > 0);
  const plata = (v: number | null) => (v === null ? "—" : formatMoney(Math.round(v * 100), cur));

  return (
    <>
      <PageHeader
        title={nivel === "anuncio" ? "Anuncios" : "Campañas"}
        description="Cuánto gastó cada uno y qué trajo. El gasto sale de la plataforma; los calificados, los turnos y los cierres salen del CRM."
      >
        <RangePicker preset={range.preset} from={range.from} to={range.to} />
      </PageHeader>

      <Filtros nivel={nivel} clienteId={clientId} clientes={clientes.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Inversión" value={plata(total.inversion)} />
        <StatCard
          label="Leads"
          value={total.leads}
          hint={total.inversion > 0 && total.leads > 0 ? `${plata(total.inversion / total.leads)} por lead` : undefined}
        />
        <StatCard
          label="Calificados"
          value={total.calificados}
          hint={
            total.calificados > 0
              ? `${plata(total.inversion / total.calificados)} por calificado`
              : "Ninguno todavía"
          }
          tone={total.calificados > 0 ? "ok" : "neutral"}
        />
        <StatCard
          label="Turnos"
          value={total.turnos}
          hint={total.turnos > 0 ? `${plata(total.inversion / total.turnos)} por turno` : undefined}
        />
      </div>

      <Card
        className="mt-4"
        title={nivel === "anuncio" ? "Todos los anuncios" : "Todas las campañas"}
        subtitle={`${
          nivel === "anuncio"
            ? plural(conGasto.length, "anuncio", "anuncios")
            : plural(conGasto.length, "campaña", "campañas")
        } con gasto en el período, ordenados por inversión.`}
      >
        {filas.length === 0 ? (
          <EmptyState
            title="Todavía no hay campañas cargadas"
            detail={
              puedeCargar
                ? "El gasto entra importando el informe que exporta Meta Ads Manager. Abajo está el formulario."
                : "El gasto lo carga Paid Media importando el informe de Meta Ads Manager."
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="nf">
              <thead>
                <tr>
                  <th>{nivel === "anuncio" ? "Anuncio" : "Campaña"}</th>
                  <th>Cliente</th>
                  <th>Cómo viene</th>
                  <th className="text-right">Inversión</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">CPL</th>
                  <th className="text-right">Califican</th>
                  <th className="text-right">CPQL</th>
                  <th className="text-right">Turnos</th>
                  <th className="text-right">CAC</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <Fila key={`${nivel}-${f.id}`} f={f} plata={plata} mostrarCampana={nivel === "anuncio"} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {puedeCargar && (
        <Card
          className="mt-4"
          title="Importar el informe de Meta"
          subtitle="Sin token ni permisos: se baja el CSV de Ads Manager y se sube."
        >
          <ImportForm clientes={clientes.map((c) => ({ id: c.id, name: c.name }))} />
        </Card>
      )}

      <Note>
        La columna <strong>CPQL</strong> —costo por lead calificado— es la que decide, no el CPL. Cien
        leads baratos que no califican salen más caros que cuarenta que sí. Por eso la clasificación
        no mira el CTR: compara el costo por calificado de cada anuncio contra la mediana de los
        demás anuncios <em>del mismo cliente</em>, que es la única comparación que significa algo.
        Con menos de diez leads no se clasifica nada: sería adivinar.
      </Note>
    </>
  );
}

function Fila({
  f,
  plata,
  mostrarCampana,
}: {
  f: FilaAnuncio;
  plata: (v: number | null) => string;
  mostrarCampana: boolean;
}) {
  return (
    <tr>
      <td className="max-w-xs">
        <span className="block truncate font-medium">{f.nombre}</span>
        {mostrarCampana && f.campana && (
          <span className="block truncate text-xs text-faint">{f.campana}</span>
        )}
      </td>
      <td className="whitespace-nowrap text-muted">{f.cliente}</td>
      <td>
        <Badge tone={TONO[f.clase]}>{CLASE_CREATIVIDAD_LABEL[f.clase]}</Badge>
        <span className="mt-1 block max-w-xs text-xs leading-snug text-faint">{f.porQue}</span>
      </td>
      <td className="tnum whitespace-nowrap text-right">{plata(f.inversion)}</td>
      <td className="tnum text-right">{f.leads || "—"}</td>
      <td className="tnum whitespace-nowrap text-right text-muted">{plata(f.cpl)}</td>
      <td className="tnum whitespace-nowrap text-right">
        {f.calificados || "—"}
        {f.tasaCalificacion !== null && (
          <span className="ml-1 text-xs text-faint">{formatPct(f.tasaCalificacion, 0)}</span>
        )}
      </td>
      <td className="tnum whitespace-nowrap text-right font-medium">{plata(f.cpql)}</td>
      <td className="tnum text-right">{f.turnos || "—"}</td>
      <td className="tnum whitespace-nowrap text-right text-muted">{plata(f.cac)}</td>
    </tr>
  );
}
