import Link from "next/link";
import { sql, STATUS, eur } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORDER = ["pendiente", "pendiente_aprobacion", "aprobada", "rechazada", "contabilizada"] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const est = estado && estado in STATUS ? estado : null;
  const term = q?.trim() ? `%${q.trim()}%` : null;

  const counts = await sql`select status, count(*)::int as c, coalesce(sum(total),0) as t from invoices group by status`;
  const rows = await sql`
    select i.id, i.supplier_name, i.invoice_number, i.invoice_date, i.total, i.status, i.posting_type, i.issues, i.received_at,
      (select count(*)::int from invoice_lines l where l.invoice_id = i.id) as nlines,
      (select count(*)::int from approvals a where a.invoice_id = i.id and a.decision = 'approved') as ok,
      (select count(*)::int from approvals a where a.invoice_id = i.id) as lv
    from invoices i
    where (${est}::text is null or i.status = ${est})
      and (${term}::text is null or i.supplier_name ilike ${term} or i.invoice_number ilike ${term})
    order by i.received_at desc limit 200`;

  const byStatus = Object.fromEntries(counts.map((r) => [r.status, r]));
  const total = counts.reduce((a, r) => a + Number(r.c), 0);
  const pend = byStatus["pendiente_aprobacion"];

  return (
    <>
      <div className="head">
        <h1>Facturas</h1>
        <p className="muted">
          {total} facturas · {eur(pend?.t ?? 0)} esperando aprobación
        </p>
      </div>

      <div className="toolbar">
        <nav className="chips">
          <Link href="/" className={!est ? "chip on" : "chip"}>Todas <b>{total}</b></Link>
          {ORDER.map((s) => (
            <Link key={s} href={`/?estado=${s}`} className={est === s ? "chip on" : "chip"}>
              {STATUS[s]} <b>{byStatus[s]?.c ?? 0}</b>
            </Link>
          ))}
        </nav>
        <form className="search">
          {est && <input type="hidden" name="estado" value={est} />}
          <input name="q" defaultValue={q ?? ""} placeholder="Buscar proveedor o nº de factura" />
          <button className="btn">Buscar</button>
        </form>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th>Proveedor</th><th>Nº factura</th><th>Fecha</th><th>Circuito</th>
            <th className="r">Líneas</th><th className="r">Total</th><th>Aprobación</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/facturas/${r.id}`} className="lnk">{r.supplier_name || "— sin proveedor —"}</Link>
                {r.issues && <div className="issue">{r.issues}</div>}</td>
              <td>{r.invoice_number}</td>
              <td>{r.invoice_date}</td>
              <td>{r.posting_type === "logistico" ? "Logístico (PO)" : "Financiero"}</td>
              <td className="r">{r.nlines}</td>
              <td className="r num">{eur(r.total)}</td>
              <td>{r.lv ? `${r.ok}/${r.lv} niveles` : "—"}</td>
              <td><span className={`badge s-${r.status}`}>{STATUS[r.status as keyof typeof STATUS]}</span></td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={8} className="empty">No hay facturas con este filtro. Envía una al buzón y aparecerá aquí.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
