"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { syncExcel } from "@/lib/sync";
import { parseNum } from "@/lib/num";
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
const log = (id: string, event: string, detail?: string | null) =>
  sql`insert into invoice_events (invoice_id, event, actor, detail) values (${id}, ${event}, 'Finanzas', ${detail ?? null})`;

async function finish(id: string) {
  revalidatePath("/", "layout");
  await syncOne(id);
}

// Avisa a n8n del estado actual de una factura para que actualice el Excel.
async function syncOne(id: string) {
  const [r] = await sql`select i.*,
    (select count(*)::int from approvals a where a.invoice_id = i.id) as lv,
    (select count(*)::int from approvals a where a.invoice_id = i.id and a.decision = 'approved') as ok
    from invoices i where i.id = ${id}`;
  if (!r) return;
  await syncExcel({
    id: r.id,
    estado: EXCEL_ESTADO[r.status as string] ?? r.status,
    motivo: r.rejection_reason ?? r.issues ?? "",
    nivel_aprobado: `${r.ok}/${r.lv}`,
    sap_doc: r.sap_doc ?? "",
    proveedor: r.supplier_name,
    nif: r.supplier_nif,
    n_factura: r.invoice_number,
    fecha_factura: r.invoice_date,
    base: Number(r.base),
    iva: Number(r.vat),
    total: Number(r.total),
  });
}

async function persist(fd: FormData) {
  const id = txt(fd.get("id"));
  const lineIds = fd.getAll("line_id").map(String);
  const po = txt(fd.get("po_number"));
  const stmts: any[] = [];
  let base = 0;
  let vat = 0;

  for (const lid of lineIds) {
    const qty = num(fd.get(`qty_${lid}`));
    const pu = num(fd.get(`pu_${lid}`));
    const rate = num(fd.get(`vat_${lid}`));
    const code = txt(fd.get(`code_${lid}`));
    const amount = Math.round(qty * pu * 100) / 100;
    base += amount;
    vat += (amount * rate) / 100;
    stmts.push(sql`update invoice_lines set
      description = ${txt(fd.get(`desc_${lid}`))}, internal_code = ${code || null},
      qty = ${qty}, unit_price = ${pu}, vat_rate = ${rate}, amount = ${amount},
      issue = case when ${code}::text <> '' then null else issue end
      where id = ${Number(lid)}`);
  }
  base = Math.round(base * 100) / 100;
  vat = Math.round(vat * 100) / 100;
  const [{ adjustments }] = await sql`select coalesce(adjustments, '[]'::jsonb) as adjustments from invoices where id = ${id}`;
  const adj = Math.round(((adjustments as any[]) ?? []).reduce((a, x) => a + num(x.importe), 0) * 100) / 100;

  stmts.push(sql`update invoices set
    supplier_name = ${txt(fd.get("supplier_name"))}, supplier_nif = ${txt(fd.get("supplier_nif"))},
    invoice_number = ${txt(fd.get("invoice_number"))}, invoice_date = ${txt(fd.get("invoice_date"))},
    po_number = ${po || null},
    posting_type = case when ${po}::text <> '' then 'logistico' else 'financiero' end,
    base = case when ${lineIds.length}::int > 0 then ${base}::numeric else base end,
    vat = case when ${lineIds.length}::int > 0 then ${vat}::numeric else vat end,
    total = case when ${lineIds.length}::int > 0 then ${Math.round((base + vat + adj) * 100) / 100}::numeric else total end,
    updated_at = now()
    where id = ${id}`);
  stmts.push(log(id, "editada", "Cabecera y líneas actualizadas"));
  await sql.transaction(stmts);
  return id;
}

export async function saveInvoice(fd: FormData) {
  const id = await persist(fd);
  await finish(id);
}

export async function validateInvoice(fd: FormData) {
  const id = await persist(fd);
  const [inv] = await sql`select supplier_name, supplier_nif, total from invoices where id = ${id}`;
  const [{ miss }] = await sql`select count(*)::int as miss from invoice_lines
    where invoice_id = ${id} and (internal_code is null or internal_code = '')`;
  if (!inv?.supplier_name || !inv?.supplier_nif || miss > 0) {
    await log(id, "validación fallida", "Faltan proveedor, NIF o códigos de producto");
    await finish(id);
    return;
  }
  await sql`update invoices set status = 'pendiente_aprobacion', issues = null, manual = true, updated_at = now()
            where id = ${id} and status = 'pendiente'`;
  await log(id, "validada", "Enviada a aprobación");
  await finish(id);
}

export async function approveInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  const comment = txt(fd.get("comment"));
  const next = await sql`select id, level from approvals
    where invoice_id = ${id} and decision = 'pending' order by level limit 1`;
  if (next[0]) {
    await sql`update approvals set decision = 'approved', comment = ${comment || null}, decided_at = now()
              where id = ${next[0].id}`;
    await log(id, "aprobada nivel " + next[0].level, comment || null);
  }
  const left = await sql`select 1 from approvals where invoice_id = ${id} and decision = 'pending'`;
  if (!left.length) {
    await sql`update invoices set status = 'aprobada', updated_at = now() where id = ${id}`;
    await log(id, "aprobada", "Todos los niveles aprobados");
  }
  await finish(id);
}

export async function rejectInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  const reason = txt(fd.get("reason")) || "Sin motivo indicado";
  await sql`update approvals set decision = 'rejected', comment = ${reason}, decided_at = now()
            where id = (select id from approvals where invoice_id = ${id} and decision = 'pending' order by level limit 1)`;
  await sql`update invoices set status = 'rechazada', rejection_reason = ${reason}, updated_at = now() where id = ${id}`;
  await log(id, "rechazada", reason);
  await finish(id);
}

export async function reopenInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  await sql`update approvals set decision = 'pending', comment = null, decided_at = null where invoice_id = ${id}`;
  await sql`update invoices set status = 'pendiente', rejection_reason = null, sap_doc = null, updated_at = now() where id = ${id}`;
  await log(id, "reabierta", "Vuelve a revisión");
  await finish(id);
}

// Contabiliza una factura aprobada (simulado). Devuelve false si no estaba en estado "aprobada".
async function postOne(id: string): Promise<boolean> {
  const [r] = await sql`select posting_type from invoices where id = ${id}`;
  const kind = r?.posting_type === "logistico" ? "logístico (MIRO)" : "financiero (FB60)";
  const doc = "5105" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  const done = await sql`update invoices set status = 'contabilizada', sap_doc = ${doc}, updated_at = now()
            where id = ${id} and status = 'aprobada' returning id`;
  if (!done.length) return false;
  await log(id, "contabilizada", `Posting SAP ${kind} · doc ${doc} (simulado)`);
  return true;
}

export async function postInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  await postOne(id);
  await finish(id);
}

async function postMany(ids: string[]) {
  const posted: string[] = [];
  for (const id of ids) if (await postOne(id)) posted.push(id);
  revalidatePath("/", "layout");
  await Promise.all(posted.map(syncOne));
}

// Contabiliza las facturas marcadas con la casilla de la tabla.
export async function postSelected(fd: FormData) {
  await postMany(fd.getAll("sel").map(String));
}

// Contabiliza todas las aprobadas que cumplen los filtros actuales (también las de otras páginas).
export async function postAllFiltered(fd: FormData) {
  const raw: RawFilters = {};
  for (const k of ["estado", "ci", "q", "prov", "canal", "desde", "hasta", "min", "max"] as const) {
    const v = fd.get(`f_${k}`);
    if (typeof v === "string" && v) raw[k] = v;
  }
  const rows = await listInvoices(parseFilters(raw));
  await postMany(rows.filter((r) => r.status === "aprobada").map((r) => r.id as string));
}
