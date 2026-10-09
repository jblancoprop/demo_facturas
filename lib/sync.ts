/* eslint-disable @typescript-eslint/no-explicit-any */
// Avisa a n8n para que actualice el Excel. Si no hay webhook configurado, no hace nada.
export async function syncExcel(payload: Record<string, any>) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.INGEST_API_KEY ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    /* la demo no se rompe si n8n no responde */
  }
}
