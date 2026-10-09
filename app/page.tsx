import { Fragment } from "react";
import Link from "next/link";
import { sql, STATUS, ORDER, COLOR, eur, qs } from "@/lib/db";
import { getDetail } from "@/lib/queries";
import Detail, { Badge } from "@/components/Detail";

export const dynamic = "force-dynamic";
const PAGE = 25;

export default async function Monitor({
  searchParams,
}: { searchParams: Promise<{ estado?: string; ci?: string; q?: string; id?: string; p?: string }> }) {
  const { estado, ci, q, id, p: pRaw } = await searchParams;
  const est = estado && estado in STATUS ? estado : null;
  const cir = ci === "logistico" || ci === "financiero" ? ci : null;
  const term = q?.trim() ? `%${q.trim()}%` : null;

  const [k] = await sql`select count(*)::int as n,
    count(*) filter (where manual = false and status <> 'pendiente')::int as auto,
    count(*) filter (where status = 'pendiente')::int as rev,
    coalesce(sum(total) filter (where status = 'pendiente_aprobacion'), 0) as pend_amt,
    count(*) filter (where status = 'pendiente_aprobacion')::int as pend_n from invoices`;
  const byStatus = await sql`select status, count(*)::int as c from invoices group by status`;
  const days = await sql`select to_char(received_at at time zone 'Europe/Madrid','YYYY-MM-DD') as d, count(*)::int as c
    from invoices where received_at > now() - interval '9 days' group by 1`;
  const top = await sql`select coalesce(nullif(supplier_name,''),'(sin proveedor)') as s, sum(total) as t
    from invoices group by 1 order by t desc limit 4`;

  const [{ n: totalRows }] = await sql`select count(*)::int as n from invoices
    where (${est}::text is null or status = ${est})
      and (${cir}::text is null or posting_type = ${cir})
      and (${term}::text is null or supplier_name ilike ${term} or invoice_number ilike ${term})`;
  const pages = Math.max(1, Math.ceil((totalRows as number) / PAGE));
  const p = Math.min(Math.max(1, parseInt(pRaw ?? "1") || 1), pages);
  const rows = await sql`select id, supplier_name, invoice_number, invoice_date, total, status, posting_type, manual
    from invoices
    where (${est}::text is null or status = ${est})
      and (${cir}::text is null or posting_type = ${cir})
      and (${term}::text is null or supplier_name ilike ${term} or invoice_number ilike ${term})
    order by received_at desc limit ${PAGE} offset ${(p - 1) * PAGE}`;
  const detail = id && rows.some((r) => r.id === id) ? await getDetail(id) : null;

  const cnt = Object.fromEntries(byStatus.map((r) => [r.status, r.c as number]));
  const maxS = Math.max(1, ...ORDER.map((s) => cnt[s] ?? 0));
  const dmap = Object.fromEntries(days.map((r) => [r.d, r.c as number]));
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.now() - (6 - i) * 864e5);
    const key = dt.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const lab = dt.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", weekday: "short" }).slice(0, 2);
    return { lab, v: dmap[key] ?? 0 };
  });
  const maxD = Math.max(1, ...last7.map((x) => x.v));
  const auto = k.n ? Math.round(((k.auto as number) / (k.n as number)) * 100) : 0;
  const keep = { estado: est, ci: cir, q: q?.trim() };
  const pg = (n: number) => (n > 1 ? String(n) : undefined);

  return (
    <>
      <div className="row r4">
        <div className="panel kpi"><div className="k">Total facturas</div><div className="kv">{k.n}</div><div className="ks c-mut">recibidas</div></div>
        <div className="panel kpi"><div className="k">Tasa automatización</div><div className="kv c-grn">{auto}%</div><div className="ks c-grn">sin intervención manual</div></div>
        <div className="panel kpi"><div className="k">Requieren revisión</div><div className="kv c-red">{k.rev}</div><div className="ks c-red">pendientes en Incidencias</div></div>
        <div className="panel kpi"><div className="k">Pendiente de aprobar</div><div className="kv c-cy">{eur(k.pend_amt).replace(",00", "")}</div><div className="ks c-mut">{k.pend_n} facturas en circuito</div></div>
      </div>

      <div className="panel row" style={{ padding: "14px 4px" }}>
        <div className="flow">
          {ORDER.map((s) => (
            <Link key={s} href={`/${qs({ estado: s })}`} className="step">
              <div className="sn" style={{ color: COLOR[s] }}>{cnt[s] ?? 0}</div>
              <div className="sl">{STATUS[s]}</div>
              <div className="bar"><i style={{ width: `${((cnt[s] ?? 0) / maxS) * 100}%`, background: COLOR[s] }} /></div>
            </Link>
          ))}
        </div>
      </div>

      <div className="row r2">
        <div className="panel">
          <h3>Facturas recibidas · últimos 7 días</h3>
          <div className="chart">
            {last7.map((x, i) => (
              <div className="b" key={i}><em>{x.v}</em><i style={{ height: `${(x.v / maxD) * 100}%` }} /><span>{x.lab}</span></div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Top proveedores por importe</h3>
          {top.map((t) => (<div className="sup" key={t.s as string}><span>{t.s}</span><b className="c-cy">{eur(t.t)}</b></div>))}
          {!top.length && <div className="c-mut">Sin datos todavía.</div>}
        </div>
      </div>

      <div className="panel">
        <h3>Facturas · {totalRows} {est || cir || q ? "con este filtro" : "en total"}</h3>
        <form className="bar-filters">
          <select name="estado" defaultValue={est ?? ""}>
            <option value="">Estado: todos</option>
            {ORDER.map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
          </select>
          <select name="ci" defaultValue={cir ?? ""}>
            <option value="">Circuito: todos</option>
            <option value="logistico">Logístico (con PO)</option>
            <option value="financiero">Financiero (sin PO)</option>
          </select>
          <input name="q" defaultValue={q ?? ""} placeholder="Buscar proveedor o nº de factura" />
          <button className="btn">Filtrar</button>
          <span style={{ flex: 1 }} />
          <a className="btn out" href={`/api/export${qs(keep)}`}>↓ Exportar CSV</a>
        </form>

        <table className="tbl">
          <thead><tr><th>Nº factura</th><th>Proveedor</th><th className="r">Importe</th><th>Circuito</th><th>Estado</th><th>Canal</th><th>Fecha</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const open = r.id === id && detail;
              return (
                <Fragment key={r.id as string}>
                  <tr id={open ? "sel" : undefined} className={`rw ${open ? "sel" : ""}`}>
                    <td>
                      <Link className="rowlink"
                        href={open ? `/${qs({ ...keep, p: pg(p) })}` : `/${qs({ ...keep, p: pg(p), id: r.id as string })}#sel`}>
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
                      <td colSpan={7}>
                        <Detail key={detail.inv.id as string} d={detail} closeHref={`/${qs({ ...keep, p: pg(p) })}`} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="empty">No hay facturas con este filtro.</td></tr>}
          </tbody>
        </table>

        {pages > 1 && (
          <div className="pager-bar">
            {p > 1 ? <Link className="btn sm" href={`/${qs({ ...keep, p: pg(p - 1) })}`}>← Anterior</Link> : <span />}
            <span>Página {p} de {pages}</span>
            {p < pages ? <Link className="btn sm" href={`/${qs({ ...keep, p: pg(p + 1) })}`}>Siguiente →</Link> : <span />}
          </div>
        )}
      </div>
    </>
  );
}