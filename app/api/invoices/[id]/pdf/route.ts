import { sql } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await sql`select pdf_b64 from invoices where id = ${id}`;
  if (!r[0]?.pdf_b64) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(r[0].pdf_b64 as string, "base64")), {
    headers: { "content-type": "application/pdf", "content-disposition": "inline" },
  });
}