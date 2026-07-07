// POST /api/couples/[id]/maps → 새 지도 추가 (마지막 지도가 17곳 모두 채워졌을 때만)
import { tx, ok, fail } from "@/lib/server/db";

const TOTAL_REGIONS = 17;

export async function POST(request, { params }) {
  try {
    const { id: coupleId } = await params;
    const mapCount = await tx(async (c) => {
      const couple = (await c.query("SELECT * FROM couples WHERE id = $1", [coupleId])).rows[0];
      if (!couple) throw new Error("커플 정보를 찾을 수 없어요.");
      const count = couple.map_count || 1;
      const filled = (await c.query(
        "SELECT COUNT(*)::int AS n FROM trips WHERE couple_id = $1 AND map_no = $2 AND photo_count > 0",
        [coupleId, count]
      )).rows[0].n;
      if (filled < TOTAL_REGIONS) {
        throw new Error("현재 지도를 모두 채우면 새 지도를 만들 수 있어요.");
      }
      await c.query("UPDATE couples SET map_count = $1 WHERE id = $2", [count + 1, coupleId]);
      return count + 1;
    });
    return ok({ mapCount });
  } catch (e) {
    console.error("[api/couples/[id]/maps POST]", e);
    return fail(e.message || "새 지도를 만들지 못했어요.", 409);
  }
}
