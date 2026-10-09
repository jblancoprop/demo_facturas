import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "HIPRA · Facturas de proveedor" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">HIPRA Facturas</Link>
          <span className="muted">Recepción y aprobación de facturas de proveedor</span>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
