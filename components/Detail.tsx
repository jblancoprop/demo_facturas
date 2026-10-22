/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { STATUS } from "@/lib/db";
import LinesEditor from "./LinesEditor";
import { missingFields } from "@/lib/required";
import { saveInvoice, validateInvoice, approveInvoice, rejectInvoice, reopenInvoice, postInvoice } from "@/app/actions";

export const Badge = ({ s }: { s: string }) => (
  <span className={`badge s-${s}`}>{STATUS[s as keyof typeof STATUS]}</span>
);

export default function Detail({
  d,
  closeHref,
}: {
  d: { inv: any; lines: any[]; approvals: any[]; events: any[] };
  closeHref?: string;
}) {
  const { inv, lines, approvals, events } = d;
  const ed = inv.status === "pendiente";
  const canEdit = inv.status === "pendiente" || inv.status === "pendiente_aprobacion";
  const next = approvals.findIndex((a: any) => a.decision === "pending");
  // Datos obligatorios: sin ellos no se puede validar ni aprobar (lo comprueba también el servidor).
  const missing = canEdit ? missingFields(inv) : [];
  const blocked = missing.length > 0;
  const bad = (k: string) => missing.some((m) => m.startsWith(k));
  const noSup = bad("proveedor");
  const noNif = bad("NIF");
  const log = inv.posting_type === "logistico";

  return (
    <div className="detail" id="detalle">
      <div className="pdfpane">
        <div className="fn">
          📄 {inv.pdf_name ?? "factura.pdf"} ·{" "}
          <a className="rowlink" href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
            Abrir en pestaña nueva
          </a>
        </div>
        {inv.has_pdf ? (
          <iframe src={`/api/invoices/${inv.id}/pdf`} title="PDF de la factura" />
        ) : (
          <div className="empty">Sin PDF adjunto</div>
        )}
      </div>

      <div className="formpane">
        <div className="dh">
          {closeHref && (
            <Link href={closeHref} className="btn sm" style={{ float: "right" }}>
              ✕ Minimizar
            </Link>
          )}
          <h3>
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
        {blocked && (
          <div className="ban red">
            ⚠ Faltan datos obligatorios: {missing.join(", ")}. No se puede {ed ? "validar" : "aprobar"} hasta completarlos y guardar.
          </div>
        )}
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
              <label className={bad("número") ? "bad" : ""}>Nº factura *<input name="invoice_number" className={bad("número") ? "bad" : ""} defaultValue={inv.invoice_number ?? ""} /></label>
              <label className={bad("fecha") ? "bad" : ""}>Fecha factura * (DD/MM/AAAA)<input name="invoice_date" className={bad("fecha") ? "bad" : ""} placeholder="DD/MM/AAAA" defaultValue={inv.invoice_date ?? ""} /></label>
              <label>Nº pedido (PO) · vacío = circuito financiero
                <input name="po_number" defaultValue={inv.po_number ?? ""} placeholder="sin pedido" /></label>
              <label>Cliente en factura
                <input value={`${inv.customer_name ?? ""} · ${inv.customer_nif ?? ""}`} readOnly disabled /></label>
            </div>

            {lines.length === 0 && (
              <label className={bad("importe") ? "bad" : ""}>Importe total * (€)
                <input name="total_manual" inputMode="decimal" className={bad("importe") ? "bad" : ""}
                  defaultValue={Number(inv.total) ? String(inv.total) : ""} placeholder="0,00" /></label>
            )}
            <LinesEditor
              lines={lines}
              adjustments={inv.adjustments ?? []}
              savedBase={Number(inv.base)}
              savedVat={Number(inv.vat)}
              savedTotal={Number(inv.total)}
            />
          </fieldset>

          {canEdit && (
            <div className="act">
              <button className="btn" formAction={saveInvoice}>Guardar cambios</button>
              {ed && <button className="btn pri" formAction={validateInvoice} disabled={blocked} title={blocked ? "Faltan datos obligatorios" : undefined}>Validar y enviar a aprobación →</button>}
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
              <button className="btn pri" disabled={blocked} title={blocked ? "Faltan datos obligatorios" : undefined}>Aprobar nivel {next + 1}</button>
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
