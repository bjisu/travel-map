// GET /api/couples/[id]/trips                  → 커플의 모든 trip 목록 (전체 지도)
// GET /api/couples/[id]/trips?regionId=X&map=N → 해당 지도의 지역 trip 하나 (없으면 null)
import { db, toTrip, ok, fail } from "@/lib/server/db";

export async function GET(request, { params }) {
  try {
    const { id: coupleId } = await params;
    const regionId = request.nextUrl.searchParams.get("regionId");
    const mapNo = parseInt(request.nextUrl.searchParams.get("map") || "1", 10) || 1;

    if (regionId) {
      const row = db.prepare(
        "SELECT * FROM trips WHERE couple_id = ? AND map_no = ? AND region_id = ?"
      ).get(coupleId, mapNo, regionId);
      return ok(toTrip(row));
    }

    const rows = db.prepare("SELECT * FROM trips WHERE couple_id = ?").all(coupleId);
    return ok(rows.map(toTrip));
  } catch (e) {
    console.error("[api/couples/[id]/trips GET]", e);
    return fail("여행 목록 조회 중 오류가 발생했어요.", 500);
  }
}
