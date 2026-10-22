import { listInvoices, parseFilters, type RawFilters } from "@/lib/filters";
import { parseNum } from "@/lib/num";

// Exporta exactamente lo que se ve en el Monitor con los mismos filtros.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const raw: RawFilters = {};
  for (const k of ["estado", "ci", "q", "prov", "canal", "desde", "hasta", "min", "max"] as const) {
    const v = u.get(k);
    if (v) raw[k] = v;
  }
  const rows = await listInvoices(parseFilters(raw));
  const head = ["N_factura", "Proveedor", "NIF", "Fecha", "Base", "IVA", "Total", "Circuito", "Estado", "Canal", "PO", "Doc_SAP", "Motivo_rechazo"];
  const money = (v: unknown) => String(parseNum(v)).replace(".", ","); // coma decimal, sin separador de miles
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = (r: Record<string, unknown>) =>
    [r.invoice_number, r.supplier_name, r.supplier_nif, r.invoice_date, money(r.base), money(r.vat), money(r.total),
      r.posting_type, r.status, r.manual ? "Manual" : "Auto", r.po_number, r.sap_doc, r.rejection_reason].map(esc).join(";");
  const csv = "﻿" + [head.join(";"), ...rows.map(line)].join("\r\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="facturas_hipra.csv"' },
  });
}
