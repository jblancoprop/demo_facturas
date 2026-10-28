/* eslint-disable @typescript-eslint/no-explicit-any */
// Lecturas sobre Airtable. Las filas tienen los mismos nombres de campo que tenían en Postgres,
// así que las pantallas no cambian. Cada fila lleva además _rid (id interno de registro de Airtable).
import { cache } from "react";
import { esc, select, type Rec } from "./airtable";

const INV_FIELDS = ["id", "pdf_name", "received_at", "sender", "subject", "supplier_name", "supplier_nif", "customer_name",
  "customer_nif", "invoice_number", "invoice_date", "base", "vat", "total", "adjustments", "po_number", "posting_type", "status",
  "confidence", "issues", "rejection_reason", "manual", "sap_doc", "created_at", "updated_at"];

const parseAdj = (v: unknown) => {
  try { const a = JSON.parse(String(v ?? "[]")); return Array.isArray(a) ? a : []; } catch { return []; }
};

export function toInvoice(r: Rec): Record<string, any> {
  const f = r.fields;
  const o: Record<string, any> = { _rid: r.id };
  for (const k of INV_FIELDS) o[k] = f[k] ?? null;
  o.base = Number(f.base ?? 0);
  o.vat = Number(f.vat ?? 0);
  o.total = Number(f.total ?? 0);
  o.manual = !!f.manual;
  o.adjustments = parseAdj(f.adjustments);
  o.has_pdf = Array.isArray(f.pdf) && f.pdf.length > 0;
  o.pdf_url = o.has_pdf ? (f.pdf[0].url as string) : null; // la URL de Airtable caduca: se lee en el momento de servir el PDF
  o.posting_type = f.posting_type || "financiero";
  o.status = f.status || "pendiente";
  return o;
}

// Todas las facturas (sin el PDF). Se lee una sola vez por petición aunque varias partes de la pantalla la pidan.
export const allInvoices = cache(async () => (await select("invoices", { fields: INV_FIELDS })).map(toInvoice));

export async function findInvoice(id: string, withPdf = false) {
  const r = await select("invoices", { formula: `{id}='${esc(id)}'`, fields: withPdf ? [...INV_FIELDS, "pdf"] : INV_FIELDS });
  return r[0] ? toInvoice(r[0]) : null;
}

export const orFormula = (field: string, ids: string[]) => `OR(${ids.map((i) => `{${field}}='${esc(i)}'`).join(",")})`;

const LINE_FIELDS = ["invoice_id", "line_no", "description", "internal_code", "qty", "unit_price", "vat_rate", "amount", "issue"];
const num = (v: unknown) => Number(v ?? 0);

export async function linesOf(id: string) {
  const r = await select("invoice_lines", { formula: `{invoice_id}='${esc(id)}'`, fields: LINE_FIELDS, sort: [["line_no", "asc"]] });
  return r.map((x) => ({
    id: x.id, invoice_id: id, line_no: num(x.fields.line_no), description: x.fields.description ?? null,
    internal_code: x.fields.internal_code ?? null, qty: num(x.fields.qty), unit_price: num(x.fields.unit_price),
    vat_rate: num(x.fields.vat_rate), amount: num(x.fields.amount), issue: x.fields.issue || null,
  }));
}

const APPR_FIELDS = ["invoice_id", "level", "approver_name", "approver_email", "decision", "comment", "decided_at"];
export const toApproval = (x: Rec) => ({
  id: x.id, invoice_id: x.fields.invoice_id as string, level: num(x.fields.level), approver_name: x.fields.approver_name ?? null,
  approver_email: x.fields.approver_email ?? null, decision: (x.fields.decision as string) || "pending",
  comment: x.fields.comment ?? null, decided_at: x.fields.decided_at ?? null,
});

export async function approvalsOf(id: string) {
  return (await select("approvals", { formula: `{invoice_id}='${esc(id)}'`, fields: APPR_FIELDS, sort: [["level", "asc"]] })).map(toApproval);
}

const groups = <T>(a: T[], n = 40) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function approvalsOfMany(ids: string[]) {
  const out = await Promise.all(groups(ids).map((g) =>
    select("approvals", { formula: orFormula("invoice_id", g), fields: APPR_FIELDS, sort: [["level", "asc"]] })));
  return out.flat().map(toApproval);
}

export async function invoicesByIds(ids: string[]) {
  const out = await Promise.all(groups(ids).map((g) => select("invoices", { formula: orFormula("id", g), fields: INV_FIELDS })));
  return out.flat().map(toInvoice);
}

export async function eventsOf(id: string) {
  const r = await select("invoice_events", { formula: `{invoice_id}='${esc(id)}'`, fields: ["invoice_id", "event", "actor", "detail", "at"], sort: [["at", "desc"]] });
  return r.map((x) => ({ id: x.id, event: x.fields.event ?? "", actor: x.fields.actor ?? "", detail: x.fields.detail ?? null, at: x.fields.at }));
}
