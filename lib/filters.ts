import { sql, STATUS } from "./db";

// Filtros del listado de facturas. Los usan el Monitor, la exportación a CSV y la contabilización masiva,
// así que "lo que ves filtrado" es siempre "lo que se exporta" y "lo que se contabiliza".

export type RawFilters = {
  estado?: string; ci?: string; q?: string; prov?: string; canal?: string;
  desde?: string; hasta?: string; min?: string; max?: string;
};

export type Filters = {
  statuses: string | null; // lista separada por comas, o null = todos
  ci: "logistico" | "financiero" | null;
  canal: "auto" | "manual" | null;
  prov: string | null;
  term: string | null; // texto a buscar en nº de factura o proveedor
  desde: string | null; // YYYYMMDD
  hasta: string | null; // YYYYMMDD
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
    term: raw.q?.trim() ? `%${raw.q.trim()}%` : null,
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
  };
}

// La fecha de factura se guarda como texto DD/MM/YYYY. Se compara como AAAAMMDD para no fallar con fechas raras.
// (Los where de abajo son iguales en las tres consultas, salvo el estado en byStatus.)

export async function listInvoices(f: Filters, opts: { limit?: number; offset?: number } = {}) {
  return sql`select id, supplier_name, supplier_nif, invoice_number, invoice_date, base, vat, total,
      posting_type, status, po_number, sap_doc, rejection_reason, manual, received_at
    from invoices
    where (${f.statuses}::text is null or status = any(string_to_array(${f.statuses}::text, ',')))
      and (${f.ci}::text is null or posting_type = ${f.ci})
      and (${f.canal}::text is null or manual = (${f.canal}::text = 'manual'))
      and (${f.prov}::text is null or supplier_name = ${f.prov})
      and (${f.term}::text is null or supplier_name ilike ${f.term} or invoice_number ilike ${f.term})
      and (${f.min}::numeric is null or total >= ${f.min})
      and (${f.max}::numeric is null or total <= ${f.max})
      and (${f.desde}::text is null or (case when invoice_date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
            then substr(invoice_date, 7, 4) || substr(invoice_date, 4, 2) || substr(invoice_date, 1, 2) end) >= ${f.desde})
      and (${f.hasta}::text is null or (case when invoice_date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
            then substr(invoice_date, 7, 4) || substr(invoice_date, 4, 2) || substr(invoice_date, 1, 2) end) <= ${f.hasta})
    order by received_at desc
    limit ${opts.limit ?? null} offset ${opts.offset ?? 0}`;
}

// Cuántas facturas hay por estado con el resto de filtros aplicados (alimenta los chips de estado).
export async function countByStatus(f: Filters) {
  const rows = await sql`select status, count(*)::int as c from invoices
    where (${f.ci}::text is null or posting_type = ${f.ci})
      and (${f.canal}::text is null or manual = (${f.canal}::text = 'manual'))
      and (${f.prov}::text is null or supplier_name = ${f.prov})
      and (${f.term}::text is null or supplier_name ilike ${f.term} or invoice_number ilike ${f.term})
      and (${f.min}::numeric is null or total >= ${f.min})
      and (${f.max}::numeric is null or total <= ${f.max})
      and (${f.desde}::text is null or (case when invoice_date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
            then substr(invoice_date, 7, 4) || substr(invoice_date, 4, 2) || substr(invoice_date, 1, 2) end) >= ${f.desde})
      and (${f.hasta}::text is null or (case when invoice_date ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
            then substr(invoice_date, 7, 4) || substr(invoice_date, 4, 2) || substr(invoice_date, 1, 2) end) <= ${f.hasta})
    group by status`;
  return Object.fromEntries(rows.map((r) => [r.status as string, r.c as number])) as Record<string, number>;
}
