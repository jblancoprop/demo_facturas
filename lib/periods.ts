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
