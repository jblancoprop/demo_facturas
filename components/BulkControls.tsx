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
