/* eslint-disable @typescript-eslint/no-explicit-any */
import { STATUS } from "./db";
import { allInvoices } from "./store";
import { VISTA_DEFECTO, parseVista } from "./periods";

// Filtros de la pantalla. Los usan el Monitor entero (KPIs, gráfico, top de proveedores, chips y tabla),
// la exportación a CSV y la contabilización masiva: lo que ves filtrado es lo que se exporta y se contabiliza.
// La única fecha es la de RECEPCIÓN del correo (zona Europe/Madrid), la misma que usa el gráfico.

export type RawFilters = {
  estado?: string; ci?: string; q?: string; prov?: string; canal?: string;
  desde?: string; hasta?: string; min?: string; max?: string;
  vista?: string; // periodo del gráfico de recibidas; no filtra nada
};

export type Filters = {
  statuses: string | null; // lista separada por comas, o null = todos
  ci: "logistico" | "financiero" | null;
  canal: "auto" | "manual" | null;
  prov: string | null;
  term: string | null; // texto a buscar en nº de factura o proveedor
  desde: string | null; // AAAAMMDD, fecha de recepción
  hasta: string | null; // AAAAMMDD, fecha de recepción
  min: number | null;
  max: number | null;
};

const isoKey = (s?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s!.replace(/-/g, "") : null);
const amount = (s?: string) => {
  if (!s?.trim()) return null;
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

// "aprobadas" agrupa Aprobada + Contabilizada (todo lo que ya se ha aprobado).
export const APROBADAS = "aprobadas";

export function parseFilters(raw: RawFilters): Filters {
  const e = raw.estado;
  const statuses = e === APROBADAS ? "aprobada,contabilizada" : e && e in STATUS ? e : null;
  return {
    statuses,
    ci: raw.ci === "logistico" || raw.ci === "financiero" ? raw.ci : null,
    canal: raw.canal === "auto" || raw.canal === "manual" ? raw.canal : null,
    prov: raw.prov?.trim() || null,
    term: raw.q?.trim().toLowerCase() || null,
    desde: isoKey(raw.desde),
    hasta: isoKey(raw.hasta),
    min: amount(raw.min),
    max: amount(raw.max),
  };
}

// Parámetros de URL que se conservan al navegar (vacíos fuera).
export function keepParams(raw: RawFilters): Record<string, string | undefined> {
  const f = parseFilters(raw);
  return {
    estado: raw.estado === APROBADAS || (raw.estado && raw.estado in STATUS) ? raw.estado : undefined,
    ci: f.ci ?? undefined,
    canal: f.canal ?? undefined,
    prov: f.prov ?? undefined,
    q: raw.q?.trim() || undefined,
    desde: f.desde ? raw.desde : undefined,
    hasta: f.hasta ? raw.hasta : undefined,
    min: f.min !== null ? raw.min : undefined,
    max: f.max !== null ? raw.max : undefined,
    vista: parseVista(raw.vista) !== VISTA_DEFECTO ? parseVista(raw.vista) : undefined,
  };
}

// Día de recepción (AAAAMMDD) en zona Europe/Madrid.
const madridDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" });
const dayOf = (iso: unknown) => (iso ? madridDay.format(new Date(iso as string)) : "");

// Filtros que no dependen del estado ni de las fechas (los comparten tabla, KPIs, gráfico y top).
const matchBase = (f: Filters) => (r: Record<string, any>) =>
  (!f.ci || r.posting_type === f.ci) &&
  (!f.canal || r.manual === (f.canal === "manual")) &&
  (!f.prov || r.supplier_name === f.prov) &&
  (!f.term || String(r.supplier_name ?? "").toLowerCase().includes(f.term) || String(r.invoice_number ?? "").toLowerCase().includes(f.term)) &&
  (f.min === null || r.total >= f.min) &&
  (f.max === null || r.total <= f.max);

// Tabla: aplica todos los filtros y pagina.
export async function listInvoices(f: Filters, opts: { limit?: number; offset?: number } = {}) {
  const st = f.statuses ? f.statuses.split(",") : null;
  const base = matchBase(f);
  const rows = (await allInvoices())
    .filter((r) => base(r) && (!st || st.includes(r.status)))
    .filter((r) => {
      const d = dayOf(r.received_at).replace(/-/g, "");
      return (!f.desde || d >= f.desde) && (!f.hasta || d <= f.hasta);
    })
    .sort((a, b) => String(b.received_at ?? "").localeCompare(String(a.received_at ?? "")));
  const o = opts.offset ?? 0;
  return opts.limit ? rows.slice(o, o + opts.limit) : rows.slice(o);
}

export type BaseRow = { status: string; total: number | string; supplier_name: string | null; d: string };

// Base de los KPIs, el gráfico, el top de proveedores y los chips: todas las facturas que cumplen los filtros
// EXCEPTO el estado y las fechas (cada uno de esos elementos aplica el suyo: el gráfico agrupa por fecha y
// los KPIs por estado). Se resumen en memoria, así un filtro afecta siempre a todo por igual.
export async function baseRows(f: Filters): Promise<BaseRow[]> {
  const base = matchBase(f);
  return (await allInvoices()).filter(base).map((r) => ({ status: r.status, total: r.total, supplier_name: r.supplier_name, d: dayOf(r.received_at) }));
}
