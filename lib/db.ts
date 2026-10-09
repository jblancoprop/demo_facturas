import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

export const STATUS = {
  pendiente: "Pendiente",
  pendiente_aprobacion: "Pendiente aprobación",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  contabilizada: "Contabilizada",
} as const;
export type Status = keyof typeof STATUS;
export const ORDER = ["pendiente", "pendiente_aprobacion", "aprobada", "rechazada", "contabilizada"] as const;
export const COLOR: Record<string, string> = {
  pendiente: "#f0c94a",
  pendiente_aprobacion: "#5aa7e6",
  aprobada: "#2fa37a",
  rechazada: "#e8664f",
  contabilizada: "#8e9aaa",
};

export const eur = (n: unknown) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

export const qs = (o: Record<string, string | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
