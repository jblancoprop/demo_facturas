import Queue from "@/components/Queue";
export const dynamic = "force-dynamic";

export default async function Incidencias({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <Queue status="pendiente" base="/incidencias" id={id}
      title="facturas pendientes de revisión"
      empty="No hay facturas pendientes de revisión. El agente ha procesado todo correctamente." />
  );
}
