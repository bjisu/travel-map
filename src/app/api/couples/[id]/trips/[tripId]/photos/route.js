// GET /api/couples/[id]/trips/[tripId]/photos → 사진 목록 (order 순)
import { db, toPhoto, ok, fail } from "@/lib/server/db";

export async function GET(request, { params }) {
  try {
    const { id: coupleId, tripId } = await params;
    const trip = db.prepare(
      "SELECT id FROM trips WHERE id = ? AND couple_id = ?"
    ).get(tripId, coupleId);
    if (!trip) return ok([]);

    const rows = db.prepare(
      "SELECT * FROM photos WHERE trip_id = ? ORDER BY ord ASC"
    ).all(tripId);
    return ok(rows.map(toPhoto));
  } catch (e) {
    console.error("[api/photos GET]", e);
    return fail("사진 목록 조회 중 오류가 발생했어요.", 500);
  }
}
