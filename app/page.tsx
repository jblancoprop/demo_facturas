import { Fragment } from "react";
import Link from "next/link";
import { sql, STATUS, ORDER, COLOR, eur, qs } from "@/lib/db";
import { fmtInt } from "@/lib/num";
import { getDetail } from "@/lib/queries";
import { APROBADAS, baseRows, keepParams, listInvoices, parseFilters, type RawFilters } from "@/lib/filters";
import { summarize, type Bucket } from "@/lib/overview";
import { postAllFiltered, postSelected } from "./actions";
import { ConfirmButton, SelectAll } from "@/components/BulkControls";
import Detail, { Badge } from "@/components/Detail";
import FilterForm from "@/components/FilterForm";
import ReceivedChart from "@/components/ReceivedChart";
import { VISTAS, VISTA_DEFECTO, parseVista, type Vista } from "@/lib/periods";

export const dynamic = "force-dynamic";
const PAGE = 25;
const COLS = 9;

const fmtDate = (d: unknown) => (d ? new Date(d as string).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }) : "");
const fmtD = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", o).replace(".", "");
const lastDayOfMonth = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

export default async function Monitor({
  searchParams,
}: { searchParams: Promise<RawFilters & { id?: string; p?: string }> }) {
  const sp = await searchParams;
  const { id, p: pRaw } = sp;
  const f = parseFilters(sp);
  const keep = keepParams(sp);
  const vista = parseVista(sp.vista);
  const per = VISTAS[vista];

  // Ejes del gráfico del periodo elegido (días o meses) y lista de proveedores para el desplegable.
  const buckets = (await sql`with p as (
      select date_trunc(${per.trunc}::text, now() at time zone 'Europe/Madrid') + ${per.shift}::interval as ini)
    select to_char(g, 'YYYY-MM-DD') as d, g > now() at time zone 'Europe/Madrid' as fut
    from p, generate_series(
      p.ini,
      case when ${per.span}::text is null then date_trunc('month', now() at time zone 'Europe/Madrid')
           else p.ini + ${per.span}::interval end,
      ${per.step}::interval) g
    order by g`) as Bucket[];
  const provs = await sql`select distinct supplier_name as s from invoices where coalesce(supplier_name, '') <> '' order by 1 limit 500`;

  // KPIs, chips, gráfico y top salen de las mismas filas filtradas; la tabla aplica además el estado y se pagina.
  const sum = summarize(await baseRows(f), f, buckets, per.unit);
  const cnt: Record<string, number> = Object.fromEntries(Object.entries(sum.byStatus).map(([s, v]) => [s, v.n]));
  const inScope = f.statuses ? f.statuses.split(",") : [...ORDER];
  const totalRows = inScope.reduce((a, s) => a + (cnt[s] ?? 0), 0);
  const pages = Math.max(1, Math.ceil(totalRows / PAGE));
  const p = Math.min(Math.max(1, parseInt(pRaw ?? "1") || 1), pages);
  const rows = await listInvoices(f, { limit: PAGE, offset: (p - 1) * PAGE });
  const detail = id && rows.some((r) => r.id === id) ? await getDetail(id) : null;
  const bulkN = inScope.includes("aprobada") ? cnt.aprobada ?? 0 : 0;

  const tableKeep = { ...keep, vista: undefined }; // el periodo del gráfico no filtra nada
  const hasFilter = Object.values(tableKeep).some(Boolean);
  const dateFiltered = Boolean(keep.desde || keep.hasta);
  const pg = (n: number) => (n > 1 ? String(n) : undefined);

  // Gráfico: cabecera con el rango real (hasta hoy) y barras pulsables que filtran todo por ese día o mes.
  const bars = sum.bars;
  const sumBars = bars.reduce((a, x) => a + x.c, 0);
  const peak = bars.reduce((m, x) => (x.c > m.c ? x : m), bars[0] ?? { c: 0, d: "" });
  const firstD = bars[0]?.d;
  const lastD = bars[bars.length - 1]?.d;
  const rango = !firstD ? "" : per.unit === "month"
    ? `${fmtD(firstD, { month: "short" })} – ${fmtD(lastD, { month: "short", year: "numeric" })}`
    : `${fmtD(firstD, { weekday: "short", day: "2-digit", month: "2-digit" })} – ${fmtD(lastD, { weekday: "short", day: "2-digit", month: "2-digit" })}`;
  const spanOf = (d: string): [string, string] => (per.unit === "month" ? [d, lastDayOfMonth(d)] : [d, d]);
  const isSel = (d: string) => { const [a, b] = spanOf(d); return keep.desde === a && keep.hasta === b; };
  const barHref = (d: string) => {
    const [a, b] = spanOf(d);
    const on = isSel(d);
    return `/${qs({ ...keep, desde: on ? undefined : a, hasta: on ? undefined : b, p: undefined, id: undefined })}`;
  };

  // Resumen de los filtros activos (excepto el estado, que se ve en los chips).
  const active: string[] = [];
  if (keep.prov) active.push(`Proveedor: ${keep.prov}`);
  if (keep.q) active.push(`Texto: “${keep.q}”`);
  if (keep.ci) active.push(keep.ci === "logistico" ? "Circuito logístico" : "Circuito financiero");
  if (keep.canal) active.push(keep.canal === "auto" ? "Canal auto" : "Canal manual");
  if (dateFiltered) {
    const a = keep.desde ? fmtD(keep.desde, { day: "2-digit", month: "2-digit", year: "numeric" }) : "…";
    const b = keep.hasta ? fmtD(keep.hasta, { day: "2-digit", month: "2-digit", year: "numeric" }) : "…";
    active.push(keep.desde && keep.desde === keep.hasta ? `Recibidas el ${a}` : `Recibidas ${a} – ${b}`);
  }
  if (keep.min || keep.max) active.push(`Importe ${keep.min ? `≥ ${keep.min} €` : ""}${keep.min && keep.max ? " y " : ""}${keep.max ? `≤ ${keep.max} €` : ""}`);

  const kpi = (estado: string, label: string, n: number, amount: number, sub: string, cls: string) => (
    <Link className="panel kpi link" href={`/${qs({ ...keep, estado, p: undefined, id: undefined })}#facturas`}>
      <div className="k">{label}</div>
      <div className={`kv ${cls}`}>{fmtInt(n)}<small> {n === 1 ? "factura" : "facturas"}</small></div>
      <div className="ks c-mut">{eur(amount)}{sub}</div>
    </Link>
  );
  const chip = (estado: string | undefined, label: string, n: number, color?: string) => (
    <Link key={label} href={`/${qs({ ...keep, estado, p: undefined, id: undefined })}#facturas`}
      className={`chip ${keep.estado === estado ? "on" : ""}`}>
      {color && <i style={{ background: color }} />}{label}<b>{fmtInt(n)}</b>
    </Link>
  );

  return (
    <>
      <div className="panel filterpanel">
        <FilterForm>
          {keep.estado && <input type="hidden" name="estado" value={keep.estado} />}
          {keep.vista && <input type="hidden" name="vista" value={keep.vista} />}
          <label>Proveedor
            <select name="prov" defaultValue={keep.prov ?? ""}>
              <option value="">Todos</option>
              {provs.map((r) => <option key={r.s as string} value={r.s as string}>{r.s}</option>)}
            </select>
          </label>
          <label>Nº factura o proveedor
            <input name="q" defaultValue={keep.q ?? ""} placeholder="Buscar…" />
          </label>
          <label>Circuito
            <select name="ci" defaultValue={keep.ci ?? ""}>
              <option value="">Todos</option>
              <option value="logistico">Logístico (con PO)</option>
              <option value="financiero">Financiero (sin PO)</option>
            </select>
          </label>
          <label>Canal
            <select name="canal" defaultValue={keep.canal ?? ""}>
              <option value="">Todos</option>
              <option value="auto">Auto (sin tocar)</option>
              <option value="manual">Manual (corregida)</option>
            </select>
          </label>
          <label>Recibidas desde<input type="date" name="desde" defaultValue={keep.desde ?? ""} /></label>
          <label>Recibidas hasta<input type="date" name="hasta" defaultValue={keep.hasta ?? ""} /></label>
          <label>Importe mínimo (€)<input name="min" inputMode="decimal" defaultValue={keep.min ?? ""} placeholder="0" /></label>
          <label>Importe máximo (€)<input name="max" inputMode="decimal" defaultValue={keep.max ?? ""} placeholder="Sin límite" /></label>
          <div className="factions">
            <button className="btn pri">Filtrar</button>
            {hasFilter && <Link className="btn" href={`/${qs({ vista: keep.vista })}`}>Quitar filtros</Link>}
            {hasFilter && <span className="scope">Todo lo de abajo (KPIs, gráfico, top y tabla) está filtrado: {active.join(" · ") || "estado"}</span>}
          </div>
        </FilterForm>
      </div>

      <div className="row r4">
        {kpi("pendiente", "Incidencias por revisar", sum.inc.n, sum.inc.amt, "", "c-amb")}
        {kpi("pendiente_aprobacion", "Pendientes de aprobar", sum.pend.n, sum.pend.amt, "", "c-cy")}
        {kpi(APROBADAS, "Aprobadas", sum.apr.n, sum.apr.amt, ` · ${fmtInt(sum.porContabilizar)} por contabilizar`, "c-grn")}
        {kpi("contabilizada", "Contabilizadas en SAP", sum.cont.n, sum.cont.amt, "", "")}
      </div>

      <div className="row r2">
        <div className="panel">
          <div className="phead">
            <h3>Facturas recibidas · {per.title}
              <small className="c-mut"> · {rango} · {fmtInt(sumBars)} en el periodo{sumBars > 0 ? `, pico de ${fmtInt(peak.c)}` : ""}</small></h3>
            <div className="seg">
              {(Object.keys(VISTAS) as Vista[]).map((v) => (
                <Link key={v} className={v === vista ? "on" : ""}
                  href={`/${qs({ ...keep, vista: v === VISTA_DEFECTO ? undefined : v })}`}>{VISTAS[v].label}</Link>
              ))}
            </div>
          </div>
          <ReceivedChart bars={bars} unit={per.unit} href={barHref} active={dateFiltered} selected={isSel} />
        </div>
        <div className="panel">
          <h3>Top proveedores · importe aprobado</h3>
          {sum.top.map((t) => (
            <Link className="sup" key={t.s} href={`/${qs({ ...keep, prov: t.s, estado: APROBADAS })}#facturas`}>
              <span>{t.s}<small className="c-mut"> · {fmtInt(t.n)} {t.n === 1 ? "factura" : "facturas"}</small></span>
              <b className="c-cy">{eur(t.t)}</b>
            </Link>
          ))}
          {!sum.top.length && <div className="c-mut">No hay facturas aprobadas con estos filtros.</div>}
        </div>
      </div>

      <div className="panel" id="facturas">
        <div className="phead">
          <h3>Facturas · {fmtInt(totalRows)} {hasFilter || keep.estado ? "con este filtro" : "en total"}</h3>
          <a className="btn out sm" href={`/api/export${qs(tableKeep)}`}>↓ Exportar CSV</a>
        </div>

        <div className="chips">
          {chip(undefined, "Todas", sum.count)}
          {ORDER.map((s) => chip(s, STATUS[s], cnt[s] ?? 0, COLOR[s]))}
          {chip(APROBADAS, "Aprobadas (total)", (cnt.aprobada ?? 0) + (cnt.contabilizada ?? 0))}
        </div>

        {bulkN > 0 && (
          <form id="bulk" className="bulk">
            {Object.entries(tableKeep).map(([key, v]) => v ? <input key={key} type="hidden" name={`f_${key}`} value={v} /> : null)}
            <span><b>{fmtInt(bulkN)}</b> {bulkN === 1 ? "factura aprobada pendiente" : "facturas aprobadas pendientes"} de contabilizar en SAP</span>
            <span style={{ flex: 1 }} />
            <ConfirmButton className="btn" action={postSelected}
              confirmText="¿Contabilizar en SAP las facturas marcadas?">Contabilizar las marcadas</ConfirmButton>
            <ConfirmButton className="btn pri" action={postAllFiltered}
              confirmText={`¿Contabilizar en SAP las ${bulkN} facturas aprobadas de este filtro?`}>
              Contabilizar las {fmtInt(bulkN)} aprobadas
            </ConfirmButton>
          </form>
        )}

        <table className="tbl">
          <thead>
            <tr>
              <th className="chk">{bulkN > 0 && <SelectAll />}</th>
              <th>Nº factura</th><th>Proveedor</th><th className="r">Importe</th><th>Circuito</th><th>Estado</th><th>Canal</th><th>Recibida</th><th>Fecha factura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = r.id === id && detail;
              return (
                <Fragment key={r.id as string}>
                  <tr id={open ? "sel" : undefined} className={`rw ${open ? "sel" : ""}`}>
                    <td className="chk">
                      {r.status === "aprobada" && <input type="checkbox" name="sel" value={r.id as string} form="bulk" aria-label={`Marcar ${r.invoice_number}`} />}
                    </td>
                    <td>
                      <Link className="rowlink"
                        href={open ? `/${qs({ ...keep, p: pg(p) })}#facturas` : `/${qs({ ...keep, p: pg(p), id: r.id as string })}#sel`}>
                        {open ? "▾ " : "▸ "}{r.invoice_number}
                      </Link>
                    </td>
                    <td>{r.supplier_name || <span className="c-red">— sin proveedor —</span>}</td>
                    <td className="r num">{eur(r.total)}</td>
                    <td><span className="tag">{r.posting_type === "logistico" ? "Logístico" : "Financiero"}</span></td>
                    <td><Badge s={r.status as string} /></td>
                    <td className="c-mut">{r.manual ? "Manual" : "Auto"}</td>
                    <td className="c-mut">{fmtDate(r.received_at)}</td>
                    <td className="c-mut">{r.invoice_date}</td>
                  </tr>
                  {open && (
                    <tr className="detail-row">
                      <td colSpan={COLS}>
                        <Detail key={detail.inv.id as string} d={detail} closeHref={`/${qs({ ...keep, p: pg(p) })}#facturas`} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && <tr><td colSpan={COLS} className="empty">No hay facturas con este filtro.</td></tr>}
          </tbody>
        </table>

        {pages > 1 && (
          <div className="pager-bar">
            {p > 1 ? <Link className="btn sm" href={`/${qs({ ...keep, p: pg(p - 1) })}#facturas`}>← Anterior</Link> : <span />}
            <span>Página {p} de {pages}</span>
            {p < pages ? <Link className="btn sm" href={`/${qs({ ...keep, p: pg(p + 1) })}#facturas`}>Siguiente →</Link> : <span />}
          </div>
        )}
      </div>
    </>
  );
}
