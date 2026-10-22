import { Fragment } from "react";
import Link from "next/link";
import { sql, STATUS, ORDER, COLOR, eur, qs } from "@/lib/db";
import { fmtInt } from "@/lib/num";
import { getDetail } from "@/lib/queries";
import { APROBADAS, countByStatus, keepParams, listInvoices, parseFilters, type RawFilters } from "@/lib/filters";
import { postAllFiltered, postSelected } from "./actions";
import { ConfirmButton, SelectAll } from "@/components/BulkControls";
import Detail, { Badge } from "@/components/Detail";
import FilterForm from "@/components/FilterForm";
import { VISTAS, VISTA_DEFECTO, parseVista, type Vista } from "@/lib/periods";

export const dynamic = "force-dynamic";
const PAGE = 25;
const COLS = 8;

export default async function Monitor({
  searchParams,
}: { searchParams: Promise<RawFilters & { id?: string; p?: string }> }) {
  const sp = await searchParams;
  const { id, p: pRaw } = sp;
  const f = parseFilters(sp);
  const keep = keepParams(sp);

  // Totales de toda la bandeja (no dependen de los filtros).
  const [k] = await sql`select count(*)::int as n,
    coalesce(sum(total) filter (where status = 'pendiente'), 0) as inc_amt,
    count(*) filter (where status = 'pendiente')::int as inc_n,
    coalesce(sum(total) filter (where status = 'pendiente_aprobacion'), 0) as pend_amt,
    count(*) filter (where status = 'pendiente_aprobacion')::int as pend_n,
    coalesce(sum(total) filter (where status in ('aprobada','contabilizada')), 0) as apr_amt,
    count(*) filter (where status in ('aprobada','contabilizada'))::int as apr_n,
    count(*) filter (where status = 'aprobada')::int as por_contabilizar,
    coalesce(sum(total) filter (where status = 'contabilizada'), 0) as cont_amt,
    count(*) filter (where status = 'contabilizada')::int as cont_n from invoices`;
  // Facturas recibidas en el periodo elegido (por día, semana o mes), separadas por lo que han acabado siendo.
  const vista = parseVista(sp.vista);
  const per = VISTAS[vista];
  const bars = await sql`with p as (
      select date_trunc(${per.trunc}::text, now() at time zone 'Europe/Madrid') + ${per.shift}::interval as ini)
    select to_char(g, 'YYYY-MM-DD') as d,
      g > now() at time zone 'Europe/Madrid' as fut,
      count(i.id)::int as c,
      count(*) filter (where i.status = 'pendiente')::int as inc,
      count(*) filter (where i.status = 'pendiente_aprobacion')::int as apr,
      count(*) filter (where i.status in ('aprobada','contabilizada'))::int as ok,
      count(*) filter (where i.status = 'rechazada')::int as rej
    from p, generate_series(
      p.ini,
      case when ${per.span}::text is null then date_trunc('month', now() at time zone 'Europe/Madrid')
           else p.ini + ${per.span}::interval end,
      ${per.step}::interval) g
    left join invoices i on date_trunc(${per.unit}::text, i.received_at at time zone 'Europe/Madrid') = g
    group by g order by g`;
  const top = await sql`select supplier_name as s, sum(total) as t, count(*)::int as n from invoices
    where status in ('aprobada','contabilizada') and coalesce(supplier_name, '') <> ''
    group by 1 order by t desc limit 5`;
  const provs = await sql`select distinct supplier_name as s from invoices where coalesce(supplier_name, '') <> '' order by 1 limit 500`;

  // Listado con filtros.
  const cnt = await countByStatus(f);
  const inScope = f.statuses ? f.statuses.split(",") : [...ORDER];
  const totalRows = inScope.reduce((a, s) => a + (cnt[s] ?? 0), 0);
  const allRows = ORDER.reduce((a, s) => a + (cnt[s] ?? 0), 0);
  const pages = Math.max(1, Math.ceil(totalRows / PAGE));
  const p = Math.min(Math.max(1, parseInt(pRaw ?? "1") || 1), pages);
  const rows = await listInvoices(f, { limit: PAGE, offset: (p - 1) * PAGE });
  const detail = id && rows.some((r) => r.id === id) ? await getDetail(id) : null;
  const bulkN = inScope.includes("aprobada") ? cnt.aprobada ?? 0 : 0;

  const maxD = Math.max(1, ...bars.map((x) => x.c as number));
  const sumBars = bars.reduce((a, x) => a + (x.c as number), 0);
  const fmtD = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", o).replace(".", "");
  const firstD = bars[0]?.d as string;
  const lastD = bars[bars.length - 1]?.d as string;
  const rango = !firstD ? "" : per.unit === "month"
    ? `${fmtD(firstD, { month: "short" })} – ${fmtD(lastD, { month: "short", year: "numeric" })}`
    : `${fmtD(firstD, { weekday: "short", day: "2-digit", month: "2-digit" })} – ${fmtD(lastD, { weekday: "short", day: "2-digit", month: "2-digit" })}`;
  const pg = (n: number) => (n > 1 ? String(n) : undefined);
  const tableKeep = { ...keep, vista: undefined }; // el periodo del gráfico no filtra la tabla
  const hasFilter = Object.values(tableKeep).some(Boolean);
  const barLabel = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    const dm = dt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    if (per.unit === "month")
      return { top: dt.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""), sub: dt.toLocaleDateString("es-ES", { year: "2-digit" }),
        when: dt.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
    const wd = dt.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "").slice(0, 2);
    return { top: dt.toLocaleDateString("es-ES", { day: "2-digit" }), sub: wd, when: `${dt.toLocaleDateString("es-ES", { weekday: "long" })} ${dm}` };
  };
  const kpi = (estado: string, label: string, n: unknown, amount: unknown, sub: string, cls: string) => (
    <Link className="panel kpi link" href={`/${qs({ ...keep, estado, p: undefined, id: undefined })}#facturas`}>
      <div className="k">{label}</div>
      <div className={`kv ${cls}`}>{fmtInt(n)}<small> {(n as number) === 1 ? "factura" : "facturas"}</small></div>
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
      <div className="row r4">
        {kpi("pendiente", "Incidencias por revisar", k.inc_n, k.inc_amt, "", "c-amb")}
        {kpi("pendiente_aprobacion", "Pendientes de aprobar", k.pend_n, k.pend_amt, "", "c-cy")}
        {kpi(APROBADAS, "Aprobadas", k.apr_n, k.apr_amt, ` · ${fmtInt(k.por_contabilizar)} por contabilizar`, "c-grn")}
        {kpi("contabilizada", "Contabilizadas en SAP", k.cont_n, k.cont_amt, "", "")}
      </div>

      <div className="row r2">
        <div className="panel">
          <div className="phead">
            <h3>Facturas recibidas · {per.title}
              <small className="c-mut"> · {rango} · {fmtInt(sumBars)} en el periodo, {fmtInt(k.n)} en total</small></h3>
            <div className="seg">
              {(Object.keys(VISTAS) as Vista[]).map((v) => (
                <Link key={v} className={v === vista ? "on" : ""}
                  href={`/${qs({ ...keep, vista: v === VISTA_DEFECTO ? undefined : v })}`}>{VISTAS[v].label}</Link>
              ))}
            </div>
          </div>
          <div className="legend">
            <span><i style={{ background: COLOR.pendiente }} />Incidencia</span>
            <span><i style={{ background: COLOR.pendiente_aprobacion }} />En aprobación</span>
            <span><i style={{ background: COLOR.aprobada }} />Aprobada o contabilizada</span>
            <span><i style={{ background: COLOR.rechazada }} />Rechazada</span>
          </div>
          <div className="chart">
            {bars.map((x) => {
              const lab = barLabel(x.d as string);
              const parts = [
                [x.inc, COLOR.pendiente, "incidencia"], [x.apr, COLOR.pendiente_aprobacion, "en aprobación"],
                [x.ok, COLOR.aprobada, "aprobada"], [x.rej, COLOR.rechazada, "rechazada"],
              ] as [number, string, string][];
              const tip = `${lab.when}${x.fut ? " (todavía no ha llegado)" : ""}: ${x.c} recibidas` +
                parts.filter(([n]) => n).map(([n, , t]) => ` · ${n} ${t}`).join("");
              return (
                <div className={`b ${x.fut ? "fut" : ""}`} key={x.d as string} title={tip}>
                  <em>{x.c ? fmtInt(x.c) : ""}</em>
                  <div className="stack" style={{ height: `${((x.c as number) / maxD) * 100}%` }}>
                    {parts.filter(([n]) => n > 0).map(([n, c, t]) => <i key={t} style={{ flex: n, background: c }} />)}
                  </div>
                  <span>{lab.top}<br /><small>{lab.sub}</small></span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel">
          <h3>Top proveedores · importe aprobado</h3>
          {top.map((t) => (
            <Link className="sup" key={t.s as string} href={`/${qs({ prov: t.s as string, estado: APROBADAS })}#facturas`}>
              <span>{t.s}<small className="c-mut"> · {fmtInt(t.n)} {(t.n as number) === 1 ? "factura" : "facturas"}</small></span>
              <b className="c-cy">{eur(t.t)}</b>
            </Link>
          ))}
          {!top.length && <div className="c-mut">Todavía no hay facturas aprobadas.</div>}
        </div>
      </div>

      <div className="panel" id="facturas">
        <h3>Facturas · {fmtInt(totalRows)} {hasFilter ? "con este filtro" : "en total"}</h3>

        <div className="chips">
          {chip(undefined, "Todas", allRows)}
          {ORDER.map((s) => chip(s, STATUS[s], cnt[s] ?? 0, COLOR[s]))}
          {chip(APROBADAS, "Aprobado (total)", (cnt.aprobada ?? 0) + (cnt.contabilizada ?? 0))}
        </div>

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
          <label>Fecha factura desde<input type="date" name="desde" defaultValue={keep.desde ?? ""} /></label>
          <label>Fecha factura hasta<input type="date" name="hasta" defaultValue={keep.hasta ?? ""} /></label>
          <label>Importe mínimo (€)<input name="min" inputMode="decimal" defaultValue={keep.min ?? ""} placeholder="0" /></label>
          <label>Importe máximo (€)<input name="max" inputMode="decimal" defaultValue={keep.max ?? ""} placeholder="Sin límite" /></label>
          <div className="factions">
            <button className="btn pri">Filtrar</button>
            {hasFilter && <Link className="btn" href={`/${qs({ vista: keep.vista })}#facturas`}>Limpiar</Link>}
            <span style={{ flex: 1 }} />
            <a className="btn out" href={`/api/export${qs(tableKeep)}`}>↓ Exportar CSV</a>
          </div>
        </FilterForm>

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
              <th>Nº factura</th><th>Proveedor</th><th className="r">Importe</th><th>Circuito</th><th>Estado</th><th>Canal</th><th>Fecha factura</th>
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
