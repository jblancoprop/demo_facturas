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

export const eur = (n: unknown) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
