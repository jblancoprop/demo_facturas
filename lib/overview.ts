// Resumen de la bandeja para el Monitor: KPIs, chips, gráfico y top de proveedores salen de las MISMAS filas ya
// filtradas, así que un filtro (proveedor, fechas, importe...) afecta a todo por igual.

export type Row = { status: string; total: number | string; supplier_name: string | null; d: string };
export type Bucket = { d: string; fut: boolean }; // d = AAAA-MM-DD (inicio del día o del mes)
export type Bar = { d: string; fut: boolean; c: number; inc: number; apr: number; ok: number; rej: number };
export type Range = { desde: string | null; hasta: string | null }; // AAAAMMDD

export const inRange = (d: string, r: Range) => {
  const k = d.replace(/-/g, "");
  return (!r.desde || k >= r.desde) && (!r.hasta || k <= r.hasta);
};

const APROBADO = ["aprobada", "contabilizada"];

export function summarize(rows: Row[], range: Range, buckets: Bucket[], unit: "day" | "month") {
  // Lo que cae dentro de las fechas elegidas (o todo, si no hay fechas): alimenta KPIs, chips y top.
  const scoped = rows.filter((r) => inRange(r.d, range));
  const byStatus: Record<string, { n: number; amt: number }> = {};
  for (const r of scoped) {
    const x = (byStatus[r.status] ??= { n: 0, amt: 0 });
    x.n += 1;
    x.amt += Number(r.total) || 0;
  }
  const sum = (sts: string[]) => sts.reduce((a, s) => ({ n: a.n + (byStatus[s]?.n ?? 0), amt: a.amt + (byStatus[s]?.amt ?? 0) }), { n: 0, amt: 0 });

  const topMap = new Map<string, { s: string; t: number; n: number }>();
  for (const r of scoped) {
    if (!APROBADO.includes(r.status) || !r.supplier_name) continue;
    const x = topMap.get(r.supplier_name) ?? { s: r.supplier_name, t: 0, n: 0 };
    x.t += Number(r.total) || 0;
    x.n += 1;
    topMap.set(r.supplier_name, x);
  }
  const top = [...topMap.values()].sort((a, b) => b.t - a.t).slice(0, 5);

  // Gráfico: ignora las fechas del filtro (su eje ya es la fecha); los días futuros no existen, así que se cortan.
  const key = (d: string) => (unit === "month" ? d.slice(0, 7) : d);
  const bars: Bar[] = buckets.filter((b) => !b.fut).map((b) => ({ d: b.d, fut: false, c: 0, inc: 0, apr: 0, ok: 0, rej: 0 }));
  const idx = new Map(bars.map((b, i) => [key(b.d), i]));
  for (const r of rows) {
    const i = idx.get(key(r.d));
    if (i === undefined) continue;
    const b = bars[i];
    b.c += 1;
    if (r.status === "pendiente") b.inc += 1;
    else if (r.status === "pendiente_aprobacion") b.apr += 1;
    else if (APROBADO.includes(r.status)) b.ok += 1;
    else if (r.status === "rechazada") b.rej += 1;
  }

  return {
    scoped, byStatus, count: scoped.length,
    pend: sum(["pendiente_aprobacion"]), inc: sum(["pendiente"]), rej: sum(["rechazada"]), apr: sum(APROBADO), cont: sum(["contabilizada"]),
    porContabilizar: byStatus.aprobada?.n ?? 0, top, bars,
  };
}
