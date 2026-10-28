/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { create, esc, remove, select, uploadAttachment } from "@/lib/airtable";
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
  let pdfName: string | null = null; // nombre del archivo adjunto, por si n8n no manda el resto de datos
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    d = JSON.parse(String(fd.get("data")));
    const f = fd.get("pdf");
    if (f && typeof f !== "string") {
      pdf = Buffer.from(await f.arrayBuffer()).toString("base64");
      pdfName = f.name || null;
    }
  } else {
    d = await req.json();
    pdf = d.pdf_base64 ?? null;
  }

  const id: string = d.id ?? "F-" + Date.now();
  // Aunque n8n diga que todo está bien, sin los datos obligatorios la factura va a Incidencias.
  const missing = missingFields({ supplier_name: d.proveedor, supplier_nif: d.nif_proveedor, invoice_number: d.numero_factura,
    invoice_date: d.fecha_factura, total: d.total });
  // Si n8n no pudo analizar el PDF (el agente falló), llega sin resultado: se guarda igualmente como Incidencia con el PDF.
  const failed = !d.estado && !d.destino;
  const bigPdf = !!pdf && pdf.length * 0.75 > 5_000_000; // Airtable admite adjuntos de hasta 5 MB
  const issues = [bigPdf ? "El PDF supera los 5 MB y no se ha podido adjuntar." : "", failed ? "El proceso automático no ha podido analizar esta factura. Revisa el PDF a mano." : "", d.incidencias, missing.length ? `Faltan datos obligatorios: ${missing.join(", ")}` : ""].filter(Boolean).join("; ");
  const status = issues || d.estado === "Revisión manual" ? "pendiente" : "pendiente_aprobacion"; // con incidencia o sin resultado, siempre a revisión
  const posting = d.po_number ? "logistico" : "financiero";
  const adjustments = (Array.isArray(d.ajustes) ? d.ajustes : [])
    .map((a: any) => ({ concepto: String(a?.concepto ?? "").trim(), importe: num(a?.importe) }))
    .filter((a: { concepto: string; importe: number }) => a.concepto || a.importe);

  // Una misma factura (NIF del proveedor + número) no se guarda dos veces.
  if (d.nif_proveedor && d.numero_factura) {
    const dup = await select("invoices", { formula: `AND({supplier_nif}='${esc(String(d.nif_proveedor))}',{invoice_number}='${esc(String(d.numero_factura))}')`, fields: ["id"] });
    if (dup.length) return NextResponse.json({ duplicate: true });
  }

  const now = new Date().toISOString();
  const [inv] = await create("invoices", [{
    id, pdf_name: d.nombre_pdf ?? pdfName, received_at: d.fecha_recepcion ?? now, sender: d.remitente ?? null, subject: d.asunto ?? null,
    supplier_name: d.proveedor ?? null, supplier_nif: d.nif_proveedor ?? null, customer_name: d.nombre_cliente ?? null,
    customer_nif: d.nif_cliente != null ? String(d.nif_cliente) : null, invoice_number: d.numero_factura ?? null, invoice_date: d.fecha_factura ?? null,
    base: num(d.base_imponible), vat: num(d.cuota_iva), total: num(d.total), adjustments: JSON.stringify(adjustments),
    po_number: d.po_number != null ? String(d.po_number) : null, posting_type: posting, status, confidence: d.confianza ?? null,
    issues: issues || null, manual: false, created_at: now, updated_at: now,
  }]);

  // Líneas, aprobadores, histórico y PDF: si algo falla se borra la factura para que el reintento de n8n empiece limpio.
  try {
    if (pdf && !bigPdf) await uploadAttachment(inv.id, "pdf", (d.nombre_pdf ?? pdfName ?? "factura.pdf") as string, pdf);
    await create("invoice_lines", (d.lineas ?? []).map((l: any, i: number) => {
      const qty = num(l.cantidad);
      const amount = num(l.importe);
      const pu = l.precio_unitario != null ? num(l.precio_unitario) : qty ? amount / qty : 0;
      return { invoice_id: id, line_no: i + 1, description: l.descripcion ?? null, internal_code: l.codigo_interno ?? null, qty, unit_price: pu,
        vat_rate: l.iva_pct != null ? num(l.iva_pct) : 21, amount, issue: l.incidencia ?? null };
    }));
    await create("approvals", (d.aprobadores ?? []).map((a: any, i: number) =>
      ({ invoice_id: id, level: i + 1, approver_name: a.nombre ?? null, approver_email: a.email ?? null, decision: "pending" })));
    await create("invoice_events", [{ invoice_id: id, event: "recibida", actor: "n8n", detail: d.asunto ?? null, at: now }]);
  } catch (e) {
    await remove("invoices", [inv.id]).catch(() => {});
    throw e;
  }

  return NextResponse.json({ ok: true, id, status });
}
