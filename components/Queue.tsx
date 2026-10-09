/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { sql } from "@/lib/db";
import { getDetail } from "@/lib/queries";
import Detail from "./Detail";

// Cola de facturas de un estado: una a una, con flechas, PDF y datos extraídos.
export default async function Queue({
  status, base, id, title, empty,
}: { status: string; base: string; id?: string; title: string; empty: string }) {
  const list = await sql`select id from invoices where status = ${status} order by received_at`;
  if (!list.length) return <div className="panel empty">{empty}</div>;
  let idx = list.findIndex((r) => r.id === id);
  if (idx < 0) idx = 0;
  const d = await getDetail(list[idx].id as string);
  const prev = list[Math.max(0, idx - 1)].id;
  const nxt = list[Math.min(list.length - 1, idx + 1)].id;
  return (
    <>
      <div className="pager">
        <b className={status === "pendiente" ? "c-red" : "c-cy"}>{list.length} {title}</b>
        <span style={{ flex: 1 }} />
        <Link className="btn sm" href={`${base}?id=${prev}`}>←</Link>
        <span>{idx + 1} / {list.length}</span>
        <Link className="btn sm" href={`${base}?id=${nxt}`}>→</Link>
      </div>
      {d && <Detail d={d} />}
    </>
  );
}
