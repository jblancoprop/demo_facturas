// Periodos del gráfico de facturas recibidas: siempre periodos de calendario (zona Europe/Madrid).
//  - Semanas: de lunes a domingo.  - Meses: del día 1 al último día.  - Año en curso: de enero al mes actual.
// Cada periodo se define así: empieza en date_trunc(trunc, ahora) + shift y termina en el inicio + span
// (o, si span es null, en el mes actual). unit/step marcan el tamaño de cada barra.
export const VISTAS = {
  semana: { label: "Esta semana", title: "esta semana", trunc: "week", shift: "0 days", span: "6 days", unit: "day", step: "1 day" },
  semana_pasada: { label: "Semana pasada", title: "la semana pasada", trunc: "week", shift: "-7 days", span: "6 days", unit: "day", step: "1 day" },
  mes: { label: "Este mes", title: "este mes", trunc: "month", shift: "0 days", span: "1 month -1 day", unit: "day", step: "1 day" },
  mes_pasado: { label: "Mes pasado", title: "el mes pasado", trunc: "month", shift: "-1 month", span: "1 month -1 day", unit: "day", step: "1 day" },
  ytd: { label: "Año en curso", title: "el año en curso, por meses", trunc: "year", shift: "0 days", span: null, unit: "month", step: "1 month" },
} as const;

export type Vista = keyof typeof VISTAS;
export const VISTA_DEFECTO: Vista = "mes";
export const parseVista = (v?: string): Vista => (v && v in VISTAS ? (v as Vista) : VISTA_DEFECTO);

// Ejes del gráfico: un día (o un mes en "año en curso") por barra, en zona Europe/Madrid. fut = todavía no ha llegado.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export function buildBuckets(vista: Vista, now: Date = new Date()): { d: string; fut: boolean }[] {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(now); // AAAA-MM-DD
  const [y, m] = today.split("-").map(Number);
  const t = new Date(`${today}T00:00:00Z`);
  const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
  const days: Date[] = [];
  const run = (ini: Date, end: Date) => { for (let d = ini; d <= end; d = addDays(d, 1)) days.push(d); };
  if (vista === "semana") run(monday, addDays(monday, 6));
  else if (vista === "semana_pasada") run(addDays(monday, -7), addDays(monday, -1));
  else if (vista === "mes") run(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)));
  else if (vista === "mes_pasado") run(new Date(Date.UTC(y, m - 2, 1)), new Date(Date.UTC(y, m - 1, 0)));
  else for (let k = 0; k < m; k++) days.push(new Date(Date.UTC(y, k, 1)));
  return days.map((d) => ({ d: ymd(d), fut: ymd(d) > today }));
}
