// Periodos del gráfico de facturas recibidas. "back" es cuánto se retrocede desde el final del periodo en curso;
// null = desde el 1 de enero (año en curso).
export const VISTAS = {
  semana: { label: "Última semana", title: "últimos 7 días", unit: "day", step: "1 day", back: "6 days" },
  mes: { label: "Último mes", title: "últimos 30 días", unit: "day", step: "1 day", back: "29 days" },
  trimestre: { label: "Últimos 3 meses", title: "últimos 3 meses, por semanas", unit: "week", step: "1 week", back: "12 weeks" },
  ytd: { label: "Año en curso", title: "en lo que va de año, por meses", unit: "month", step: "1 month", back: null },
} as const;

export type Vista = keyof typeof VISTAS;
export const VISTA_DEFECTO: Vista = "mes";
export const parseVista = (v?: string): Vista => (v && v in VISTAS ? (v as Vista) : VISTA_DEFECTO);
