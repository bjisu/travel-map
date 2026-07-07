// GET /api/couples/[id]/trips/[tripId]/photos → 사진 목록 (order 순)
import { row, rows, toPhoto, ok, fail } from "@/lib/server/db";

export async function GET(request, { params }) {
  try {
    const { id: coupleId, tripId } = await params;
    const trip = await row(
      "SELECT id FROM trips WHERE id = $1 AND couple_id = $2", [tripId, coupleId]
    );
    if (!trip) return ok([]);

    const list = await rows(
      "SELECT * FROM photos WHERE trip_id = $1 ORDER BY ord ASC", [tripId]
    );
    return ok(list.map(toPhoto));
  } catch (e) {
    console.error("[api/photos GET]", e);
    return fail("사진 목록 조회 중 오류가 발생했어요.", 500);
  }
}
