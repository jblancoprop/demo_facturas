"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Tabs({ inc, apr }: { inc: number; apr: number }) {
  const p = usePathname();
  const T: { href: string; label: string; n: number | null; warn?: boolean }[] = [
    { href: "/", label: "Monitor", n: null },
    { href: "/incidencias", label: "Incidencias", n: inc, warn: true },
    { href: "/aprobaciones", label: "Aprobaciones", n: apr },
  ];
  return (
    <nav className="tabs">
      {T.map((t) => (
        <Link key={t.href} href={t.href} className={`tab ${p === t.href ? "on" : ""} ${t.warn && t.n ? "warn" : ""}`}>
          {t.label}
          {t.n !== null && <span className="n">({t.n})</span>}
        </Link>
      ))}
    </nav>
  );
}
