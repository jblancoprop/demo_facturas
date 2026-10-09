/* eslint-disable @typescript-eslint/no-explicit-any */
import { STATUS, eur } from "@/lib/db";
import Link from "next/link";
import { saveInvoice, validateInvoice, approveInvoice, rejectInvoice, reopenInvoice, postInvoice } from "@/app/actions";

export const Badge = ({ s }: { s: string }) => (
  <span className={`badge s-${s}`}>{STATUS[s as keyof typeof STATUS]}</span>
);

export default function Detail({ d, closeHref }: { d: { inv: any; lines: any[]; approvals: any[]; events: any[] }; closeHref?: string }) {  const { inv, lines, approvals, events } = d;
  const canEdit = inv.status === "pendiente" || inv.status === "pendiente_aprobacion";
  const next = approvals.findIndex((a: any) => a.decision === "pending");
  const sumLines = lines.reduce((a, l) => a + Number(l.amount), 0);
  const mismatch = lines.length > 0 && Math.abs(sumLines - Number(inv.base)) > 0.02;
  const noSup = ed && !inv.supplier_name;
  const noNif = ed && !inv.supplier_nif;
  const log = inv.posting_type === "logistico";

  return (
    <div className="detail" id="detalle">
      <div className="pdfpane">
      <div className="fn">📄 {inv.pdf_name ?? "factura.pdf"} · <a className="rowlink" href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">Abrir en pestaña nueva</a></div>        {inv.has_pdf ? (
          <iframe src={`/api/invoices/${inv.id}/pdf`} title="PDF de la factura" />
        ) : (
          <div className="empty">Sin PDF adjunto</div>
        )}
      </div>

      <div className="formpane">
      <div className="dh">
          {closeHref && <Link href={closeHref} className="btn sm" style={{ float: "right" }}>✕ Minimizar</Link>}          <h3>
            {inv.supplier_name || "Proveedor sin identificar"}
            <small>{inv.invoice_number}</small>
          </h3>
          <div className="bd">
            <Badge s={inv.status} />
            <span className="tag">{log ? "Logístico (con PO)" : "Financiero (sin PO)"}</span>
            <span className="tag">Confianza: {inv.confidence ?? "—"}</span>
            <span className="tag">{lines.length} líneas</span>
          </div>
        </div>

        {inv.status === "rechazada" && <div className="ban red">Rechazada: {inv.rejection_reason}</div>}
        {ed && inv.issues && <div className="ban red">⚠ {inv.issues}</div>}
        {inv.status === "pendiente_aprobacion" && (
          <div className="ban blue">
            Datos extraídos por la IA{inv.manual ? " y corregidos por Finanzas" : ""}. Revisa el PDF y aprueba o rechaza.
          </div>
        )}
        {inv.status === "aprobada" && (
          <div className="ban blue">Aprobada en todos los niveles. Lista para contabilizar. Campos bloqueados.</div>
        )}
        {inv.status === "contabilizada" && (
          <div className="ban blue">Contabilizada en SAP · documento {inv.sap_doc}. Campos bloqueados.</div>
        )}

        <form>
          <input type="hidden" name="id" value={inv.id} />
          <fieldset disabled={!canEdit} className="fs">
            <div className="grid2">
              <label className={noSup ? "bad" : ""}>Proveedor *
                <input name="supplier_name" className={noSup ? "bad" : ""} defaultValue={inv.supplier_name ?? ""} /></label>
              <label className={noNif ? "bad" : ""}>NIF proveedor *
                <input name="supplier_nif" className={noNif ? "bad" : ""} defaultValue={inv.supplier_nif ?? ""} /></label>
              <label>Nº factura<input name="invoice_number" defaultValue={inv.invoice_number ?? ""} /></label>
              <label>Fecha factura<input name="invoice_date" defaultValue={inv.invoice_date ?? ""} /></label>
              <label>Nº pedido (PO) · vacío = circuito financiero
                <input name="po_number" defaultValue={inv.po_number ?? ""} placeholder="sin pedido" /></label>
              <label>Cliente en factura
                <input value={`${inv.customer_name ?? ""} · ${inv.customer_nif ?? ""}`} readOnly disabled /></label>
            </div>

            <table className="tbl lines">
              <thead>
                <tr><th>Descripción</th><th>Código</th><th className="r">Uds</th><th className="r">Precio</th>
                  <th className="r">IVA %</th><th className="r">Subtotal</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className={l.issue || !l.internal_code ? "iss" : ""}>
                    <td>
                      <input type="hidden" name="line_id" value={l.id} />
                      <input name={`desc_${l.id}`} defaultValue={l.description ?? ""} />
                      {l.issue && <div className="iss-t">{l.issue}</div>}
                    </td>
                    <td><input name={`code_${l.id}`} defaultValue={l.internal_code ?? ""} placeholder="sin match" style={{ width: 96 }} /></td>
                    <td className="r"><input name={`qty_${l.id}`} type="number" step="any" defaultValue={Number(l.qty)} style={{ width: 72, textAlign: "right" }} /></td>
                    <td className="r"><input name={`pu_${l.id}`} type="number" step="any" defaultValue={Number(l.unit_price)} style={{ width: 84, textAlign: "right" }} /></td>
                    <td className="r"><input name={`vat_${l.id}`} type="number" step="any" defaultValue={Number(l.vat_rate)} style={{ width: 62, textAlign: "right" }} /></td>
                    <td className="r num">{eur(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>

          <div className="tot">
            <div><span className="c-mut">Base imponible</span><b>{eur(inv.base)}</b></div>
            <div><span className="c-mut">IVA</span><b>{eur(inv.vat)}</b></div>
            <div className="g"><span>Total</span><span>{eur(inv.total)}</span></div>
            {mismatch && <div className="issue">La suma de líneas ({eur(sumLines)}) no cuadra con la base.</div>}
          </div>

          {canEdit && (
            <div className="act">
              <button className="btn" formAction={saveInvoice}>Guardar cambios</button>
              {ed && <button className="btn pri" formAction={validateInvoice}>Validar y enviar a aprobación →</button>}
            </div>
          )}
        </form>

        <h4 className="sec">Circuito de aprobación{approvals.length ? ` · ${approvals.length} nivel${approvals.length > 1 ? "es" : ""} por importe` : ""}</h4>
        {approvals.length === 0 && <div className="c-mut">Se asignarán aprobadores al validar la factura.</div>}
        {approvals.map((a: any, k: number) => (
          <div className="lv" key={a.id}>
            <span className={`dot ${a.decision === "pending" && k === next ? "next" : a.decision}`} />
            <span>Nivel {a.level} · {a.approver_name ?? a.approver_email}</span>
            <span className="c-mut">— {a.decision === "approved" ? "aprobado" : a.decision === "rejected" ? "rechazado" : k === next ? "esperando decisión" : "pendiente"}{a.comment ? ` (${a.comment})` : ""}</span>
          </div>
        ))}

        <h4 className="sec">Contabilización SAP · {log ? "circuito logístico" : "circuito financiero"}</h4>
        <div className="sap">
          {log ? (
            <><b>MIRO</b> · Factura contra pedido <b>{inv.po_number || "—"}</b> · {lines.length} posiciones a casar con pedido y entrada de mercancía</>
          ) : (
            <><b>FB60</b> · Factura sin pedido · imputación a cuenta de gasto y centro de coste</>
          )}
          <div style={{ marginTop: 6 }} className={inv.sap_doc ? "" : "c-mut"}>
            {inv.sap_doc ? <>Documento SAP: <b>{inv.sap_doc}</b></> : "Se lanzará al aprobar el último nivel (simulado en la demo)."}
          </div>
        </div>

        <div className="act">
          {(inv.status === "pendiente" || inv.status === "pendiente_aprobacion") && (
            <form action={rejectInvoice} className="inline">
              <input type="hidden" name="id" value={inv.id} />
              <input name="reason" placeholder="Motivo del rechazo" required />
              <button className="btn bad">Rechazar factura</button>
            </form>
          )}
          {inv.status === "pendiente_aprobacion" && (
            <form action={approveInvoice} className="inline">
              <input type="hidden" name="id" value={inv.id} />
              <input name="comment" placeholder="Comentario (opcional)" />
              <button className="btn pri">Aprobar nivel {next + 1}</button>
            </form>
          )}
          {inv.status === "aprobada" && (
            <form action={postInvoice}>
              <input type="hidden" name="id" value={inv.id} />
              <button className="btn pri">Contabilizar en SAP (simulado)</button>
            </form>
          )}
          {(inv.status === "rechazada" || inv.status === "aprobada") && (
            <form action={reopenInvoice}>
              <input type="hidden" name="id" value={inv.id} />
              <button className="btn">Volver a revisión</button>
            </form>
          )}
        </div>

        <h4 className="sec">Histórico de intervenciones</h4>
        <ul className="hist">
          {events.map((e: any) => (
            <li key={e.id}>
              <span className="t">{new Date(e.at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}</span>
              {e.event} · {e.actor}{e.detail ? ` — ${e.detail}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
