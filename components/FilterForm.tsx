"use client";
import type { ReactNode } from "react";

// Formulario de filtros: al elegir un proveedor, un desplegable o una fecha se filtra al momento.
// Los campos de texto e importes se aplican con Intro o con el botón Filtrar.
export default function FilterForm({ children }: { children: ReactNode }) {
  return (
    <form
      className="filters"
      action="/"
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement | HTMLSelectElement;
        if (t.tagName === "SELECT" || (t as HTMLInputElement).type === "date") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
