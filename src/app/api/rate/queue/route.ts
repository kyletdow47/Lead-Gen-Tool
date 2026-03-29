import { NextResponse } from "next/server";
import { IMPORT_QUEUE_FILE, readJSON } from "@/lib/data";

// GET /api/rate/queue — return pending import queue
export async function GET() {
  const queue = (await readJSON(IMPORT_QUEUE_FILE)) || [];
  return NextResponse.json({ pending: queue.length, queue });
}
