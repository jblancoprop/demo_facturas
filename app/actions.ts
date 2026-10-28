"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { create, update } from "@/lib/airtable";
import { approvalsOf, approvalsOfMany, findInvoice, invoicesByIds, linesOf } from "@/lib/store";
import { syncExcel } from "@/lib/sync";
import { parseNum } from "@/lib/num";
import { missingFields } from "@/lib/required";
import { listInvoices, parseFilters, type RawFilters } from "@/lib/filters";

const EXCEL_ESTADO: Record<string, string> = {
  pendiente: "Revisión manual",
  pendiente_aprobacion: "Pendiente aprobación",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  contabilizada: "Contabilizada",
};

const num = parseNum;
const txt = (x: any) => String(x ?? "").trim();
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;
const ev = (id: string, event: string, detail?: string | null) => ({ invoice_id: id, event, actor: "Finanzas", detail: detail ?? null, at: now() });
const log = (id: string, event: string, detail?: string | null) => create("invoice_events", [ev(id, event, detail)]);
const touch = (rid: string, fields: Record<string, any>) => update("invoices", [{ id: rid, fields: { ...fields, updated_at: now() } }]);

async function finish(id: string) {
  revalidatePath("/", "layout");
  await syncMany([id]);
}

// Avisa a n8n del estado actual de las facturas para que actualice la tabla de seguimiento.
async function syncMany(ids: string[]) {
  if (!ids.length) return;
  const [invs, apps] = await Promise.all([invoicesByIds(ids), approvalsOfMany(ids)]);
  await Promise.all(invs.map((r) => {
    const mine = apps.filter((a) => a.invoice_id === r.id);
    const lastComment = mine.filter((a) => a.comment).sort((a, b) => String(b.decided_at ?? "").localeCompare(String(a.decided_at ?? "")))[0]?.comment;
    return syncExcel({
      id: r.id,
      estado: EXCEL_ESTADO[r.status as string] ?? r.status,
      motivo: r.rejection_reason || lastComment || r.issues || "", // rechazo, si no el último comentario de aprobación, si no las incidencias
      nivel_aprobado: `${mine.filter((a) => a.decision === "approved").length}/${mine.length}`,
      sap_doc: r.sap_doc ?? "",
      proveedor: r.supplier_name,
      nif: r.supplier_nif,
      n_factura: r.invoice_number,
      fecha_factura: r.invoice_date,
      base: Number(r.base),
      iva: Number(r.vat),
      total: Number(r.total),
    });
  }));
}

async function persist(fd: FormData) {
  const id = txt(fd.get("id"));
  const inv = await findInvoice(id);
  if (!inv) throw new Error("Factura no encontrada");
  const lineIds = fd.getAll("line_id").map(String); // id de registro de cada línea
  const po = txt(fd.get("po_number"));
  const tm = txt(fd.get("total_manual")); // solo aparece cuando la factura no tiene líneas
  const totalManual = tm ? num(tm) : null;
  let base = 0;
  let vat = 0;
  const lineUpdates: { id: string; fields: Record<string, any> }[] = [];

  for (const lid of lineIds) {
    const qty = num(fd.get(`qty_${lid}`));
    const pu = num(fd.get(`pu_${lid}`));
    const rate = num(fd.get(`vat_${lid}`));
    const code = txt(fd.get(`code_${lid}`));
    const amount = round2(qty * pu);
    base += amount;
    vat += (amount * rate) / 100;
    const fields: Record<string, any> = { description: txt(fd.get(`desc_${lid}`)), internal_code: code || null, qty, unit_price: pu, vat_rate: rate, amount };
    if (code) fields.issue = null; // con código asignado, la incidencia de la línea desaparece
    lineUpdates.push({ id: lid, fields });
  }
  base = round2(base);
  vat = round2(vat);
  const adj = round2((inv.adjustments as any[]).reduce((a, x) => a + num(x.importe), 0));

  const fields: Record<string, any> = {
    supplier_name: txt(fd.get("supplier_name")), supplier_nif: txt(fd.get("supplier_nif")),
    invoice_number: txt(fd.get("invoice_number")), invoice_date: txt(fd.get("invoice_date")),
    po_number: po || null, posting_type: po ? "logistico" : "financiero",
  };
  if (lineIds.length) { fields.base = base; fields.vat = vat; fields.total = round2(base + vat + adj); }
  else if (totalManual !== null) fields.total = totalManual;

  await update("invoice_lines", lineUpdates);
  await touch(inv._rid, fields);
  await log(id, "editada", "Cabecera y líneas actualizadas");
  return id;
}

export async function saveInvoice(fd: FormData) {
  const id = await persist(fd);
  await finish(id);
}

export async function validateInvoice(fd: FormData) {
  const id = await persist(fd);
  const inv = await findInvoice(id);
  if (!inv) return;
  const miss = (await linesOf(id)).filter((l) => !l.internal_code).length;
  const missing = missingFields(inv);
  if (missing.length || miss > 0) {
    await log(id, "validación fallida", [missing.length ? `Faltan datos obligatorios: ${missing.join(", ")}` : "", miss > 0 ? "Faltan códigos de producto" : ""].filter(Boolean).join(". "));
    await finish(id);
    return;
  }
  if (inv.status === "pendiente") await touch(inv._rid, { status: "pendiente_aprobacion", issues: null, manual: true });
  await log(id, "validada", "Enviada a aprobación");
  await finish(id);
}

export async function approveInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  const comment = txt(fd.get("comment"));
  const inv = await findInvoice(id);
  if (!inv) return;
  const missing = missingFields(inv);
  if (missing.length) {
    await log(id, "aprobación bloqueada", `Faltan datos obligatorios: ${missing.join(", ")}`);
    await finish(id);
    return;
  }
  const apps = await approvalsOf(id);
  const next = apps.find((a) => a.decision === "pending");
  if (next) {
    await update("approvals", [{ id: next.id, fields: { decision: "approved", comment: comment || null, decided_at: now() } }]);
    await log(id, "aprobada nivel " + next.level, comment || null);
  }
  if (!apps.some((a) => a !== next && a.decision === "pending")) {
    await touch(inv._rid, { status: "aprobada" });
    await log(id, "aprobada", "Todos los niveles aprobados");
  }
  await finish(id);
}

// Rechaza las facturas que todavía están en revisión o en aprobación (las demás se ignoran). Devuelve las que se rechazaron.
async function rejectMany(ids: string[], reason: string): Promise<string[]> {
  const ok = (await invoicesByIds(ids)).filter((r) => r.status === "pendiente" || r.status === "pendiente_aprobacion");
  if (!ok.length) return [];
  await update("invoices", ok.map((r) => ({ id: r._rid, fields: { status: "rechazada", rejection_reason: reason, updated_at: now() } })));
  const apps = await approvalsOfMany(ok.map((r) => r.id));
  const firsts = ok.map((r) => apps.filter((a) => a.invoice_id === r.id && a.decision === "pending").sort((a, b) => a.level - b.level)[0]).filter(Boolean);
  await update("approvals", firsts.map((a) => ({ id: a.id, fields: { decision: "rejected", comment: reason, decided_at: now() } })));
  await create("invoice_events", ok.map((r) => ev(r.id, "rechazada", reason)));
  return ok.map((r) => r.id);
}

export async function rejectInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  await rejectMany([id], txt(fd.get("reason")) || "Sin motivo indicado");
  await finish(id);
}

// Rechaza las facturas marcadas en la tabla con el mismo motivo (solo las que siguen en revisión o aprobación).
export async function rejectSelected(fd: FormData) {
  const done = await rejectMany(fd.getAll("sel").map(String), txt(fd.get("reason")) || "Sin motivo indicado");
  revalidatePath("/", "layout");
  await syncMany(done);
}

export async function reopenInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  const inv = await findInvoice(id);
  if (!inv) return;
  const apps = await approvalsOf(id);
  await update("approvals", apps.map((a) => ({ id: a.id, fields: { decision: "pending", comment: null, decided_at: null } })));
  await touch(inv._rid, { status: "pendiente", rejection_reason: null, sap_doc: null });
  await log(id, "reabierta", "Vuelve a revisión");
  await finish(id);
}

// Contabiliza (simulado) las facturas que estén en estado "aprobada"; las demás se ignoran. Devuelve las contabilizadas.
async function postMany(ids: string[]): Promise<string[]> {
  const ok = (await invoicesByIds(ids)).filter((r) => r.status === "aprobada");
  if (!ok.length) return [];
  const docs = ok.map((r) => ({ r, doc: "5105" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0") }));
  await update("invoices", docs.map(({ r, doc }) => ({ id: r._rid, fields: { status: "contabilizada", sap_doc: doc, updated_at: now() } })));
  await create("invoice_events", docs.map(({ r, doc }) =>
    ev(r.id, "contabilizada", `Posting SAP ${r.posting_type === "logistico" ? "logístico (MIRO)" : "financiero (FB60)"} · doc ${doc} (simulado)`)));
  return ok.map((r) => r.id);
}

export async function postInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  await postMany([id]);
  await finish(id);
}

// Contabiliza las facturas marcadas con la casilla de la tabla.
export async function postSelected(fd: FormData) {
  const done = await postMany(fd.getAll("sel").map(String));
  revalidatePath("/", "layout");
  await syncMany(done);
}

// Contabiliza todas las aprobadas que cumplen los filtros actuales (también las de otras páginas).
export async function postAllFiltered(fd: FormData) {
  const raw: RawFilters = {};
  for (const k of ["estado", "ci", "q", "prov", "canal", "desde", "hasta", "min", "max"] as const) {
    const v = fd.get(`f_${k}`);
    if (typeof v === "string" && v) raw[k] = v;
  }
  const rows = await listInvoices(parseFilters(raw));
  const done = await postMany(rows.filter((r) => r.status === "aprobada").map((r) => r.id as string));
  revalidatePath("/", "layout");
  await syncMany(done);
}
