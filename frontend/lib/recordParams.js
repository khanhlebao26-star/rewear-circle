import { notFound } from "next/navigation";
import { isRecordId } from "./routes.mjs";

export async function readRecordParams(params) {
  const records = await params;
  if (!Object.values(records).every(isRecordId)) notFound();
  return records;
}
