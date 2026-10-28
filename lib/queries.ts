import { approvalsOf, eventsOf, findInvoice, linesOf } from "./store";

export async function getDetail(id: string) {
  const inv = await findInvoice(id, true);
  if (!inv) return null;
  const [lines, approvals, events] = await Promise.all([linesOf(id), approvalsOf(id), eventsOf(id)]);
  return { inv, lines, approvals, events };
}
