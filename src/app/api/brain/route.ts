// GET /api/brain — Read all brain insights
// PATCH /api/brain — Update an insight (toggle active, edit fields)
// DELETE /api/brain — Delete an insight by ID

import { NextRequest, NextResponse } from "next/server";
import { loadBrain, updateInsight, deleteInsight } from "@/lib/data";

export async function GET() {
  try {
    const brain = await loadBrain();
    return NextResponse.json(brain);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const updated = await updateInsight(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }
    return NextResponse.json({ insight: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const deleted = await deleteInsight(id);
    if (!deleted) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
