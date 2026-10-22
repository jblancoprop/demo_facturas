import { Fragment } from "react";
import Link from "next/link";
import { sql, STATUS, ORDER, COLOR, eur, qs } from "@/lib/db";
import { fmtInt } from "@/lib/num";
import { getDetail } from "@/lib/queries";
import { APROBADAS, countByStatus, keepParams, listInvoices, parseFilters, type RawFilters } from "@/lib/filters";
import { postAllFiltered, postSelected } from "./actions";
import { ConfirmButton, SelectAll } from "@/components/BulkControls";
import Detail, { Badge } from "@/components/Detail";

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
    coalesce(sum(total) filter (where status = 'pendiente_aprobacion'), 0) as pend_amt,
    count(*) filter (where status = 'pendiente_aprobacion')::int as pend_n,
    coalesce(sum(total) filter (where status in ('aprobada','contabilizada')), 0) as apr_amt,
    count(*) filter (where status in ('aprobada','contabilizada'))::int as apr_n,
    count(*) filter (where status = 'aprobada')::int as por_contabilizar,
    coalesce(sum(total) filter (where status = 'contabilizada'), 0) as cont_amt,
    count(*) filter (where status = 'contabilizada')::int as cont_n from invoices`;
  const days = await sql`select to_char(g, 'YYYY-MM-DD') as d, count(i.id)::int as c
    from generate_series((now() at time zone 'Europe/Madrid')::date - 6, (now() at time zone 'Europe/Madrid')::date, interval '1 day') g
    left join invoices i on (i.received_at at time zone 'Europe/Madrid')::date = g::date
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

  const maxD = Math.max(1, ...days.map((x) => x.c as number));
  const pg = (n: number) => (n > 1 ? String(n) : undefined);
  const hasFilter = Object.values(keep).some(Boolean);
  const chip = (estado: string | undefined, label: string, n: number, color?: string) => (
    <Link key={label} href={`/${qs({ ...keep, estado, p: undefined, id: undefined })}#facturas`}
      className={`chip ${keep.estado === estado ? "on" : ""}`}>
      {color && <i style={{ background: color }} />}{label}<b>{fmtInt(n)}</b>
    </Link>
  );

  return (
    <>
      <div className="row r4">
        <div className="panel kpi"><div className="k">Facturas recibidas</div><div className="kv">{fmtInt(k.n)}</div><div className="ks c-mut">en total</div></div>
        <div className="panel kpi"><div className="k">Pendiente de aprobar</div><div className="kv c-cy">{eur(k.pend_amt)}</div><div className="ks c-mut">{fmtInt(k.pend_n)} facturas en el circuito</div></div>
        <div className="panel kpi"><div className="k">Aprobado</div><div className="kv c-grn">{eur(k.apr_amt)}</div><div className="ks c-mut">{fmtInt(k.apr_n)} facturas · {fmtInt(k.por_contabilizar)} por contabilizar</div></div>
        <div className="panel kpi"><div className="k">Contabilizado en SAP</div><div className="kv">{eur(k.cont_amt)}</div><div className="ks c-mut">{fmtInt(k.cont_n)} facturas</div></div>
      </div>

      <div className="row r2">
        <div className="panel">
          <h3>Facturas recibidas · últimos 7 días</h3>
          <div className="chart">
            {days.map((x) => (
              <div className="b" key={x.d as string}>
                <em>{fmtInt(x.c)}</em>
                <i style={{ height: `${((x.c as number) / maxD) * 100}%` }} />
                <span>{new Date(`${x.d}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short" }).slice(0, 2)}</span>
              </div>
            ))}
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

        <form className="filters" action="/">
          {keep.estado && <input type="hidden" name="estado" value={keep.estado} />}
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
            {hasFilter && <Link className="btn" href="/#facturas">Limpiar</Link>}
            <span style={{ flex: 1 }} />
            <a className="btn out" href={`/api/export${qs(keep)}`}>↓ Exportar CSV</a>
          </div>
        </form>

        {bulkN > 0 && (
          <form id="bulk" className="bulk">
            {Object.entries(keep).map(([key, v]) => v ? <input key={key} type="hidden" name={`f_${key}`} value={v} /> : null)}
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
