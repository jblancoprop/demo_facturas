// Parseo y formato de números tolerante a distintos países. Sin imports de servidor: se usa también en el navegador.

// Acepta "1.234,56", "1,234.56", "1 234,56", "1'234.56", "96.5", "96,5" o un número. Devuelve 0 si no se entiende.
export function parseNum(x: unknown): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  let s = String(x ?? "").trim().replace(/[\s €$£']/g, "");
  if (!s) return 0;
  const lc = s.lastIndexOf(",");
  const ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) {
    // Con los dos separadores, el último es el decimal y el otro es de miles.
    const dec = lc > ld ? "," : ".";
    const th = dec === "," ? "." : ",";
    s = s.split(th).join("").replace(dec, ".");
  } else if (lc >= 0) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (ld >= 0 && (s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

// Formato único de toda la web: coma decimal y punto de miles SIEMPRE.
// (El es-ES por defecto no agrupa los números de 4 cifras: 1208,00 frente a 12.500,00.)
export const fmtNum = (n: unknown, min = 0, max = 4) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: "always" }).format(
    Number(n) || 0
  );

export const eur = (n: unknown) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" }).format(Number(n) || 0);

export const fmtInt = (n: unknown) => fmtNum(n, 0, 0);
