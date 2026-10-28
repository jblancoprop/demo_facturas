/* eslint-disable @typescript-eslint/no-explicit-any */
// Cliente mínimo de la API de Airtable. Variables de entorno: AIRTABLE_TOKEN y AIRTABLE_BASE_ID.
// Airtable admite 5 peticiones por segundo por base: se espacian las llamadas y se reintentan los 429/5xx.

export type Rec = { id: string; fields: Record<string, any> };

const API = "https://api.airtable.com/v0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const baseId = () => process.env.AIRTABLE_BASE_ID!;

let nextSlot = 0;
async function gate() {
  const now = Date.now();
  const t = Math.max(now, nextSlot);
  nextSlot = t + 230; // ~4 peticiones por segundo
  if (t > now) await sleep(t - now);
}

async function call(url: string, init: RequestInit = {}): Promise<any> {
  for (let i = 0; ; i++) {
    await gate();
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, "Content-Type": "application/json", ...init.headers },
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && i < 4) {
      await sleep(res.status === 429 ? 1500 * (i + 1) : 500 * (i + 1));
      continue;
    }
    throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// Escapa un texto para usarlo entre comillas simples dentro de una fórmula de Airtable.
export const esc = (s: string) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export type Sort = [field: string, dir: "asc" | "desc"];

export async function select(table: string, o: { formula?: string; fields?: string[]; sort?: Sort[] } = {}): Promise<Rec[]> {
  const out: Rec[] = [];
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ pageSize: "100" });
    if (o.formula) p.set("filterByFormula", o.formula);
    o.fields?.forEach((f) => p.append("fields[]", f));
    o.sort?.forEach(([f, d], i) => { p.set(`sort[${i}][field]`, f); p.set(`sort[${i}][direction]`, d); });
    if (offset) p.set("offset", offset);
    const d = await call(`${API}/${baseId()}/${encodeURIComponent(table)}?${p}`);
    out.push(...d.records);
    offset = d.offset;
  } while (offset);
  return out;
}

const chunks = <T>(a: T[], n = 10) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// typecast: Airtable convierte textos y números al tipo del campo en lugar de rechazarlos.
export async function create(table: string, rows: Record<string, any>[]): Promise<Rec[]> {
  const out: Rec[] = [];
  for (const c of chunks(rows)) {
    const d = await call(`${API}/${baseId()}/${encodeURIComponent(table)}`, {
      method: "POST",
      body: JSON.stringify({ typecast: true, records: c.map((fields) => ({ fields })) }),
    });
    out.push(...d.records);
  }
  return out;
}

export async function update(table: string, rows: { id: string; fields: Record<string, any> }[]): Promise<void> {
  for (const c of chunks(rows)) {
    await call(`${API}/${baseId()}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      body: JSON.stringify({ typecast: true, records: c }),
    });
  }
}

export async function remove(table: string, ids: string[]): Promise<void> {
  for (const c of chunks(ids)) {
    const p = new URLSearchParams();
    c.forEach((i) => p.append("records[]", i));
    await call(`${API}/${baseId()}/${encodeURIComponent(table)}?${p}`, { method: "DELETE" });
  }
}

// Sube el PDF (base64, hasta 5 MB) al campo adjunto de una factura.
export async function uploadAttachment(recordId: string, field: string, filename: string, base64: string) {
  return call(`https://content.airtable.com/v0/${baseId()}/${recordId}/${encodeURIComponent(field)}/uploadAttachment`, {
    method: "POST",
    body: JSON.stringify({ contentType: "application/pdf", filename, file: base64 }),
  });
}
