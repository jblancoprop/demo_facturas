import { parseNum } from "./num";

// Datos sin los cuales una factura no se puede validar ni aprobar. Una sola lista para toda la web
// (ingesta, validar, aprobar y pantalla); el agente de n8n usa la misma lista en sus instrucciones.
export type RequiredData = {
  supplier_name?: unknown; supplier_nif?: unknown; invoice_number?: unknown; invoice_date?: unknown; total?: unknown;
};

const blank = (v: unknown) => !String(v ?? "").trim();

// Fecha DD/MM/AAAA que exista de verdad en el calendario (31/02 no vale).
export function validDate(s: unknown): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Devuelve lo que falta, con nombres para personas (vacío = la factura está completa).
export function missingFields(i: RequiredData): string[] {
  const out: string[] = [];
  if (blank(i.supplier_name)) out.push("proveedor");
  if (blank(i.supplier_nif)) out.push("NIF del proveedor");
  if (blank(i.invoice_number)) out.push("número de factura");
  if (!validDate(i.invoice_date)) out.push("fecha de factura (DD/MM/AAAA)");
  if (!parseNum(i.total)) out.push("importe total");
  return out;
}
