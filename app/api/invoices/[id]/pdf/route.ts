import { findInvoice } from "@/lib/store";

// El PDF vive en un campo adjunto de Airtable; su URL caduca, así que se lee en cada petición y se sirve desde aquí.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await findInvoice(id, true);
  if (!inv?.pdf_url) return new Response("not found", { status: 404 });
  const r = await fetch(inv.pdf_url as string);
  if (!r.ok) return new Response("not found", { status: 404 });
  return new Response(await r.arrayBuffer(), { headers: { "content-type": "application/pdf", "content-disposition": "inline" } });
}
