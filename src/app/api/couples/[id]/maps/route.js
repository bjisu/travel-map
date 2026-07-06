// POST /api/couples/[id]/maps → 새 지도 추가 (마지막 지도가 17곳 모두 채워졌을 때만)
import { db, tx, ok, fail } from "@/lib/server/db";

const TOTAL_REGIONS = 17;

export async function POST(request, { params }) {
  try {
    const { id: coupleId } = await params;
    const mapCount = tx(() => {
      const couple = db.prepare("SELECT * FROM couples WHERE id = ?").get(coupleId);
      if (!couple) throw new Error("커플 정보를 찾을 수 없어요.");
      const count = couple.map_count || 1;
      const filled = db.prepare(
        "SELECT COUNT(*) AS n FROM trips WHERE couple_id = ? AND map_no = ? AND photo_count > 0"
      ).get(coupleId, count).n;
      if (filled < TOTAL_REGIONS) {
        throw new Error("현재 지도를 모두 채우면 새 지도를 만들 수 있어요.");
      }
      db.prepare("UPDATE couples SET map_count = ? WHERE id = ?").run(count + 1, coupleId);
      return count + 1;
    });
    return ok({ mapCount });
  } catch (e) {
    console.error("[api/couples/[id]/maps POST]", e);
    return fail(e.message || "새 지도를 만들지 못했어요.", 409);
  }
}

