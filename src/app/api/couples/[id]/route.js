// GET /api/couples/[id] → 커플 조회 (없으면 null)
import { row, toCouple, ok, fail } from "@/lib/server/db";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const r = await row("SELECT * FROM couples WHERE id = $1", [id]);
    return ok(toCouple(r));
  } catch (e) {
    console.error("[api/couples/[id] GET]", e);
    return fail("커플 조회 중 오류가 발생했어요.", 500);
  }
}
