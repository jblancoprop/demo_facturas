"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

const num = (x: any) => {
  const v = Number(String(x ?? 0).replace(",", "."));
  return isNaN(v) ? 0 : v;
};
const txt = (x: any) => String(x ?? "").trim();
const log = (id: string, event: string, detail?: string | null) =>
  sql`insert into invoice_events (invoice_id, event, actor, detail) values (${id}, ${event}, 'Finanzas', ${detail ?? null})`;
const refresh = (id: string) => {
  revalidatePath("/");
  revalidatePath(`/facturas/${id}`);
};

export async function saveInvoice(fd: FormData) {
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

  stmts.push(sql`update invoices set
    supplier_name = ${txt(fd.get("supplier_name"))}, supplier_nif = ${txt(fd.get("supplier_nif"))},
    invoice_number = ${txt(fd.get("invoice_number"))}, invoice_date = ${txt(fd.get("invoice_date"))},
    po_number = ${po || null},
    posting_type = case when ${po}::text <> '' then 'logistico' else 'financiero' end,
    base = case when ${lineIds.length}::int > 0 then ${base}::numeric else base end,
    vat = case when ${lineIds.length}::int > 0 then ${vat}::numeric else vat end,
    total = case when ${lineIds.length}::int > 0 then ${base + vat}::numeric else total end,
    updated_at = now()
    where id = ${id}`);
  stmts.push(log(id, "editada", "Cabecera y líneas actualizadas"));
  await sql.transaction(stmts);
  refresh(id);
}

export async function validateInvoice(fd: FormData) {
  await saveInvoice(fd);
  const id = txt(fd.get("id"));
  await sql`update invoices set status = 'pendiente_aprobacion', issues = null, updated_at = now()
            where id = ${id} and status = 'pendiente'`;
  await log(id, "validada", "Enviada a aprobación");
  refresh(id);
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
  }
  refresh(id);
}

export async function rejectInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  const reason = txt(fd.get("reason")) || "Sin motivo indicado";
  await sql`update approvals set decision = 'rejected', comment = ${reason}, decided_at = now()
            where id = (select id from approvals where invoice_id = ${id} and decision = 'pending' order by level limit 1)`;
  await sql`update invoices set status = 'rechazada', rejection_reason = ${reason}, updated_at = now() where id = ${id}`;
  await log(id, "rechazada", reason);
  refresh(id);
}

export async function reopenInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  await sql`update approvals set decision = 'pending', comment = null, decided_at = null where invoice_id = ${id}`;
  await sql`update invoices set status = 'pendiente', rejection_reason = null, updated_at = now() where id = ${id}`;
  await log(id, "reabierta", "Vuelve a revisión");
  refresh(id);
}

export async function postInvoice(fd: FormData) {
  const id = txt(fd.get("id"));
  const r = await sql`select posting_type from invoices where id = ${id}`;
  const kind = r[0]?.posting_type === "logistico" ? "logístico (MIRO)" : "financiero (FB60)";
  await sql`update invoices set status = 'contabilizada', updated_at = now() where id = ${id} and status = 'aprobada'`;
  await log(id, "contabilizada", "Posting SAP " + kind + " (simulado)");
  refresh(id);
}
