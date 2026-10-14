"use client";
import { useState } from "react";

type Line = {
  id: number;
  description: string | null;
  internal_code: string | null;
  qty: number | string;
  unit_price: number | string;
  vat_rate: number | string;
  issue: string | null;
};

// Local a propósito: lib/db importa el driver de Neon y no puede ir al navegador.
const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
const num = (s: string) => {
  const v = parseFloat(String(s).replace(",", "."));
  return isNaN(v) ? 0 : v;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function LinesEditor({
  lines, savedBase, savedVat, savedTotal,
}: { lines: Line[]; savedBase: number; savedVat: number; savedTotal: number }) {
  const [v, setV] = useState(() =>
    lines.map((l) => ({ q: String(Number(l.qty)), p: String(Number(l.unit_price)), t: String(Number(l.vat_rate)) }))
  );
  const set = (i: number, k: "q" | "p" | "t", val: string) =>
    setV((a) => a.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  const amt = v.map((x) => r2(num(x.q) * num(x.p)));
  const live = {
    base: r2(amt.reduce((a, b) => a + b, 0)),
    vat: r2(v.reduce((a, x, i) => a + (amt[i] * num(x.t)) / 100, 0)),
    total: 0,
  };
  live.total = r2(live.base + live.vat);
  const show = lines.length ? live : { base: savedBase, vat: savedVat, total: savedTotal };
  const dirty = lines.length > 0 && Math.abs(live.total - savedTotal) > 0.005;

  return (
    <>
      <table className="tbl lines">
        <thead>
          <tr><th>Descripción</th><th>Código</th><th className="r">Uds</th><th className="r">Precio</th>
            <th className="r">IVA %</th><th className="r">Subtotal</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className={l.issue || !l.internal_code ? "iss" : ""}>
              <td>
                <input type="hidden" name="line_id" value={l.id} />
                <input name={`desc_${l.id}`} defaultValue={l.description ?? ""} />
                {l.issue && <div className="iss-t">{l.issue}</div>}
              </td>
              <td><input name={`code_${l.id}`} defaultValue={l.internal_code ?? ""} placeholder="sin match" style={{ width: 96 }} /></td>
              <td className="r"><input name={`qty_${l.id}`} type="number" step="any" value={v[i].q} onChange={(e) => set(i, "q", e.target.value)} style={{ width: 72, textAlign: "right" }} /></td>
              <td className="r"><input name={`pu_${l.id}`} type="number" step="any" value={v[i].p} onChange={(e) => set(i, "p", e.target.value)} style={{ width: 84, textAlign: "right" }} /></td>
              <td className="r"><input name={`vat_${l.id}`} type="number" step="any" value={v[i].t} onChange={(e) => set(i, "t", e.target.value)} style={{ width: 62, textAlign: "right" }} /></td>
              <td className="r num">{eur(amt[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tot">
        <div><span className="c-mut">Base imponible</span><b>{eur(show.base)}</b></div>
        <div><span className="c-mut">IVA</span><b>{eur(show.vat)}</b></div>
        <div className="g"><span>Total</span><span>{eur(show.total)}</span></div>
        {dirty && <div style={{ color: "var(--amb)", fontSize: 12 }}>Recalculado, sin guardar. Pulsa «Guardar cambios».</div>}
      </div>
    </>
  );
}
