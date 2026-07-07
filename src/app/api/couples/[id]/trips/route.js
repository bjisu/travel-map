// GET /api/couples/[id]/trips                  → 커플의 모든 trip 목록 (전체 지도)
// GET /api/couples/[id]/trips?regionId=X&map=N → 해당 지도의 지역 trip 하나 (없으면 null)
import { row, rows, toTrip, ok, fail } from "@/lib/server/db";

export async function GET(request, { params }) {
  try {
    const { id: coupleId } = await params;
    const regionId = request.nextUrl.searchParams.get("regionId");
    const mapNo = parseInt(request.nextUrl.searchParams.get("map") || "1", 10) || 1;

    if (regionId) {
      const r = await row(
        "SELECT * FROM trips WHERE couple_id = $1 AND map_no = $2 AND region_id = $3",
        [coupleId, mapNo, regionId]
      );
      return ok(toTrip(r));
    }

    const list = await rows("SELECT * FROM trips WHERE couple_id = $1", [coupleId]);
    return ok(list.map(toTrip));
  } catch (e) {
    console.error("[api/couples/[id]/trips GET]", e);
    return fail("여행 목록 조회 중 오류가 발생했어요.", 500);
  }
}
