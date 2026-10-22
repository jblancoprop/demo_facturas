"use client";
import { useState } from "react";
import { parseNum as num, fmtNum, eur } from "@/lib/num";

type Line = {
  id: number;
  description: string | null;
  internal_code: string | null;
  qty: number | string;
  unit_price: number | string;
  vat_rate: number | string;
  issue: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

type Adjustment = { concepto: string; importe: number };

export default function LinesEditor({
  lines, adjustments, savedBase, savedVat, savedTotal,
}: { lines: Line[]; adjustments: Adjustment[]; savedBase: number; savedVat: number; savedTotal: number }) {
  const adjSum = r2(adjustments.reduce((a, x) => a + Number(x.importe || 0), 0));
  const [v, setV] = useState(() =>
    lines.map((l) => ({
      q: fmtNum(Number(l.qty), 0, 3),
      p: fmtNum(Number(l.unit_price), 2, 4),
      t: fmtNum(Number(l.vat_rate), 0, 2),
    }))
  );
  const set = (i: number, k: "q" | "p" | "t", val: string) =>
    setV((a) => a.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  const amt = v.map((x) => r2(num(x.q) * num(x.p)));
  const live = {
    base: r2(amt.reduce((a, b) => a + b, 0)),
    vat: r2(v.reduce((a, x, i) => a + (amt[i] * num(x.t)) / 100, 0)),
    total: 0,
  };
  live.total = r2(live.base + live.vat + adjSum);
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
              <td className="r"><input name={`qty_${l.id}`} type="text" inputMode="decimal" value={v[i].q} onChange={(e) => set(i, "q", e.target.value)} style={{ width: 72, textAlign: "right" }} /></td>
              <td className="r"><input name={`pu_${l.id}`} type="text" inputMode="decimal" value={v[i].p} onChange={(e) => set(i, "p", e.target.value)} style={{ width: 84, textAlign: "right" }} /></td>
              <td className="r"><input name={`vat_${l.id}`} type="text" inputMode="decimal" value={v[i].t} onChange={(e) => set(i, "t", e.target.value)} style={{ width: 62, textAlign: "right" }} /></td>
              <td className="r num">{eur(amt[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tot">
        <div><span className="c-mut">Base imponible</span><b>{eur(show.base)}</b></div>
        <div><span className="c-mut">IVA</span><b>{eur(show.vat)}</b></div>
        {adjustments.map((a, i) => (
          <div key={i}><span className="c-mut">{a.concepto || "Ajuste"}</span><b>{eur(Number(a.importe))}</b></div>
        ))}
        <div className="g"><span>Total</span><span>{eur(show.total)}</span></div>
        {dirty && <div style={{ color: "var(--amb)", fontSize: 12 }}>Recalculado, sin guardar. Pulsa «Guardar cambios».</div>}
      </div>
    </>
  );
}
