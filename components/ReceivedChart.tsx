import { COLOR } from "@/lib/db";
import { fmtInt } from "@/lib/num";

export type Bar = { d: string; fut: boolean; c: number; inc: number; apr: number; ok: number; rej: number };

// Facturas recibidas por día o por mes, apiladas por lo que han acabado siendo.
// Día futuro = todavía no hay datos: queda en blanco. Día pasado sin facturas = un cero real: línea fina en la base.
export default function ReceivedChart({ bars, unit }: { bars: Bar[]; unit: "day" | "month" }) {
  const dense = bars.length > 14; // con tantas barras se acortan las etiquetas y el hueco entre ellas
  const maxD = Math.max(1, ...bars.map((x) => x.c));
  const label = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    const dm = dt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
    if (unit === "month")
      return { top: dt.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""), sub: dt.toLocaleDateString("es-ES", { year: "2-digit" }),
        weekend: false, when: dt.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
    const wd = dense ? "DLMXJVS"[dt.getDay()] : dt.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "").slice(0, 2);
    return { top: dt.toLocaleDateString("es-ES", { day: "2-digit" }), sub: wd, weekend: dt.getDay() === 0 || dt.getDay() === 6,
      when: `${dt.toLocaleDateString("es-ES", { weekday: "long" })} ${dm}` };
  };

  return (
    <>
      <div className="legend">
        <span><i style={{ background: COLOR.pendiente }} />Incidencia</span>
        <span><i style={{ background: COLOR.pendiente_aprobacion }} />En aprobación</span>
        <span><i style={{ background: COLOR.aprobada }} />Aprobada o contabilizada</span>
        <span><i style={{ background: COLOR.rechazada }} />Rechazada</span>
      </div>
      {bars.every((x) => x.c === 0) ? (
        <div className="chart-empty">Sin facturas recibidas en este periodo.</div>
      ) : (
        <div className={`chart ${dense ? "dense" : ""}`}>
          {bars.map((x) => {
            const lab = label(x.d);
            if (x.fut)
              return (
                <div className="b fut" key={x.d} title={`${lab.when}: todavía no ha llegado`}>
                  <em /><div className="stack" /><span>&nbsp;<br /><small>&nbsp;</small></span>
                </div>
              );
            const parts: [number, string, string][] = [
              [x.inc, COLOR.pendiente, "incidencia"], [x.apr, COLOR.pendiente_aprobacion, "en aprobación"],
              [x.ok, COLOR.aprobada, "aprobada"], [x.rej, COLOR.rechazada, "rechazada"],
            ];
            const tip = `${lab.when}: ${x.c} recibidas` + parts.filter(([n]) => n).map(([n, , t]) => ` · ${n} ${t}`).join("");
            return (
              <div className={`b ${lab.weekend ? "we" : ""}`} key={x.d} title={tip}>
                <em>{x.c ? fmtInt(x.c) : ""}</em>
                {x.c ? (
                  <div className="stack" style={{ height: `${(x.c / maxD) * 100}%` }}>
                    {parts.filter(([n]) => n > 0).map(([n, c, t]) => <i key={t} style={{ flex: n, background: c }} />)}
                  </div>
                ) : <div className="zero" />}
                <span>{lab.top}<br /><small>{lab.sub}</small></span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
