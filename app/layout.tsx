import type { Metadata } from "next";
import { Exo_2, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Tabs from "@/components/Tabs";
import { allInvoices } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "HIPRA Finanzas · Monitor de facturas",
  icons: { icon: [{ url: "/pt-logo.png", type: "image/png" }] },
};

const exo = Exo_2({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-exo" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const all = await allInvoices();
  const c = [{ inc: all.filter((r) => r.status === "pendiente").length, apr: all.filter((r) => r.status === "pendiente_aprobacion").length }];
  return (
    <html lang="es" className={`${exo.variable} ${plex.variable}`}>
      <body>
        <div className="shell">
          <div className="top">
            <div className="brand">HIPRA <span>Finanzas</span></div>
            <div className="ctx">Facturas de proveedor</div>
            <div className="who">Finanzas</div>
          </div>
          <Tabs inc={c[0]?.inc ?? 0} apr={c[0]?.apr ?? 0} />
          <main className="view">{children}</main>
        </div>
      </body>
    </html>
  );
}
