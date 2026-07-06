// PATCH /api/couples/[id]/trips/[tripId] → 캡션·날짜 수정
import { db, now, localToday, ok, fail } from "@/lib/server/db";

const MAX_CAPTION = 120;

export async function PATCH(request, { params }) {
  try {
    const { id: coupleId, tripId } = await params;
    const body = await request.json().catch(() => ({}));
    const { userId, caption, visitedAt } = body;

    if (caption !== undefined && caption && caption.length > MAX_CAPTION) {
      return fail(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
    }
    if (visitedAt && String(visitedAt).slice(0, 10) > localToday()) {
      return fail("미래 날짜는 선택할 수 없어요.");
    }

    const trip = db.prepare(
      "SELECT id FROM trips WHERE id = ? AND couple_id = ?"
    ).get(tripId, coupleId);
    if (!trip) return fail("여행 정보를 찾을 수 없어요.", 404);

    const sets = ["updated_by = ?", "updated_at = ?"];
    const args = [userId || null, now()];
    if (caption !== undefined) { sets.push("caption = ?"); args.push(caption || ""); }
    if (visitedAt !== undefined) {
      sets.push("visited_at = ?");
      args.push(visitedAt ? new Date(visitedAt).toISOString() : null);
    }
    args.push(tripId);
    db.prepare(`UPDATE trips SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return ok({ ok: true });
  } catch (e) {
    console.error("[api/trips PATCH]", e);
    return fail("저장 중 오류가 발생했어요.", 500);
  }
}
