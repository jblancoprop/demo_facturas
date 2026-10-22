"use client";
import type { ReactNode } from "react";

// Casilla de la cabecera: marca o desmarca todas las casillas de la tabla (name="sel").
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Seleccionar todas las aprobadas de esta página"
      title="Seleccionar todas las aprobadas de esta página"
      onChange={(e) =>
        document.querySelectorAll<HTMLInputElement>('input[name="sel"]').forEach((c) => (c.checked = e.target.checked))
      }
    />
  );
}

// Botón de un formulario que pide confirmación antes de enviar.
export function ConfirmButton({
  action, confirmText, className, children,
}: { action: (fd: FormData) => Promise<void>; confirmText: string; className?: string; children: ReactNode }) {
  return (
    <button
      className={className}
      formAction={action}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

// Botón que pide el motivo antes de rechazar las marcadas (el motivo viaja en el campo oculto "reason" del formulario).
export function RejectButton({ action, className, children }: { action: (fd: FormData) => Promise<void>; className?: string; children: ReactNode }) {
  return (
    <button
      className={className}
      formAction={action}
      onClick={(e) => {
        const form = e.currentTarget.form;
        const marked = form ? document.querySelectorAll<HTMLInputElement>('input[name="sel"]:checked').length : 0;
        if (!marked) { e.preventDefault(); window.alert("Marca primero las facturas que quieres rechazar."); return; }
        const reason = window.prompt(`Motivo del rechazo (obligatorio) para ${marked} ${marked === 1 ? "factura" : "facturas"}:`)?.trim();
        if (!reason) { e.preventDefault(); return; }
        (form!.elements.namedItem("reason") as HTMLInputElement).value = reason;
      }}
    >
      {children}
    </button>
  );
}
