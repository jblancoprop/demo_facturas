import Queue from "@/components/Queue";
export const dynamic = "force-dynamic";

export default async function Aprobaciones({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <Queue status="pendiente_aprobacion" base="/aprobaciones" id={id}
      title="facturas pendientes de aprobación"
      empty="No hay facturas pendientes de aprobar." />
  );
}
