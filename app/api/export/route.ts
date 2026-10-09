import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const est = u.searchParams.get("estado") || null;
  const cir = u.searchParams.get("ci") || null;
  const q = u.searchParams.get("q")?.trim();
  const term = q ? `%${q}%` : null;
  const rows = await sql`select invoice_number, supplier_name, supplier_nif, invoice_date, base, vat, total,
    posting_type, status, po_number, sap_doc, rejection_reason
    from invoices
    where (${est}::text is null or status = ${est})
      and (${cir}::text is null or posting_type = ${cir})
      and (${term}::text is null or supplier_name ilike ${term} or invoice_number ilike ${term})
    order by received_at desc`;
  const head = ["N_factura","Proveedor","NIF","Fecha","Base","IVA","Total","Circuito","Estado","PO","Doc_SAP","Motivo_rechazo"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [head.join(";"), ...rows.map((r) => Object.values(r).map(esc).join(";"))].join("\r\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="facturas_hipra.csv"' },
  });
}
