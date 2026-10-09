import { sql } from "./db";

export async function getDetail(id: string) {
  const [inv] = await sql`select id, pdf_name, supplier_name, supplier_nif, customer_name, customer_nif,
    invoice_number, invoice_date, base, vat, total, po_number, posting_type, status, confidence, issues,
    rejection_reason, manual, sap_doc, (pdf_b64 is not null) as has_pdf from invoices where id = ${id}`;
  if (!inv) return null;
  const [lines, approvals, events] = await Promise.all([
    sql`select * from invoice_lines where invoice_id = ${id} order by line_no`,
    sql`select * from approvals where invoice_id = ${id} order by level`,
    sql`select * from invoice_events where invoice_id = ${id} order by at desc`,
  ]);
  return { inv, lines, approvals, events };
}
