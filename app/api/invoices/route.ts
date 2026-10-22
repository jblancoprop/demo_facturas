/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseNum } from "@/lib/num";
import { missingFields } from "@/lib/required";

export const maxDuration = 30;

const num = parseNum;

export async function POST(req: Request) {
  if (!process.env.INGEST_API_KEY || req.headers.get("x-api-key") !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let d: any;
  let pdf: string | null = null;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    d = JSON.parse(String(fd.get("data")));
    const f = fd.get("pdf");
    if (f && typeof f !== "string") pdf = Buffer.from(await f.arrayBuffer()).toString("base64");
  } else {
    d = await req.json();
    pdf = d.pdf_base64 ?? null;
  }

  const id: string = d.id ?? "F-" + Date.now();
  // Aunque n8n diga que todo está bien, sin los datos obligatorios la factura va a Incidencias.
  const missing = missingFields({ supplier_name: d.proveedor, supplier_nif: d.nif_proveedor, invoice_number: d.numero_factura,
    invoice_date: d.fecha_factura, total: d.total });
  const issues = [d.incidencias, missing.length ? `Faltan datos obligatorios: ${missing.join(", ")}` : ""].filter(Boolean).join("; ");
  const status = issues || d.estado === "Revisión manual" ? "pendiente" : "pendiente_aprobacion";
  const posting = d.po_number ? "logistico" : "financiero";
  const adjustments = (Array.isArray(d.ajustes) ? d.ajustes : [])
    .map((a: any) => ({ concepto: String(a?.concepto ?? "").trim(), importe: num(a?.importe) }))
    .filter((a: { concepto: string; importe: number }) => a.concepto || a.importe);

  const ins = await sql`
    insert into invoices (id, pdf_name, pdf_b64, received_at, sender, subject,
      supplier_name, supplier_nif, customer_name, customer_nif, invoice_number, invoice_date,
      base, vat, total, adjustments, po_number, posting_type, status, confidence, issues)
    values (${id}, ${d.nombre_pdf ?? null}, ${pdf}, ${d.fecha_recepcion ?? new Date().toISOString()},
      ${d.remitente ?? null}, ${d.asunto ?? null},
      ${d.proveedor ?? null}, ${d.nif_proveedor ?? null}, ${d.nombre_cliente ?? null}, ${d.nif_cliente ?? null},
      ${d.numero_factura ?? null}, ${d.fecha_factura ?? null},
      ${num(d.base_imponible)}, ${num(d.cuota_iva)}, ${num(d.total)}, ${JSON.stringify(adjustments)}::jsonb,
      ${d.po_number ?? null}, ${posting}, ${status}, ${d.confianza ?? null}, ${issues || null})
    on conflict (supplier_nif, invoice_number) do nothing
    returning id`;
  if (!ins.length) return NextResponse.json({ duplicate: true });

  const stmts = [
    ...(d.lineas ?? []).map((l: any, i: number) => {
      const qty = num(l.cantidad);
      const amount = num(l.importe);
      const pu = l.precio_unitario != null ? num(l.precio_unitario) : qty ? amount / qty : 0;
      return sql`insert into invoice_lines
        (invoice_id, line_no, description, internal_code, qty, unit_price, vat_rate, amount, issue)
        values (${id}, ${i + 1}, ${l.descripcion ?? null}, ${l.codigo_interno ?? null},
          ${qty}, ${pu}, ${l.iva_pct != null ? num(l.iva_pct) : 21}, ${amount}, ${l.incidencia ?? null})`;
    }),
    ...(d.aprobadores ?? []).map((a: any, i: number) =>
      sql`insert into approvals (invoice_id, level, approver_name, approver_email)
          values (${id}, ${i + 1}, ${a.nombre ?? null}, ${a.email ?? null})`
    ),
    sql`insert into invoice_events (invoice_id, event, actor, detail)
        values (${id}, 'recibida', 'n8n', ${d.asunto ?? null})`,
  ];
  await sql.transaction(stmts);

  return NextResponse.json({ ok: true, id, status });
}
