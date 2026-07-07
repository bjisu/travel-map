// PATCH /api/couples/[id]/trips/[tripId] → 캡션·날짜 수정
import { row, run, now, localToday, ok, fail } from "@/lib/server/db";

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

    const trip = await row(
      "SELECT id FROM trips WHERE id = $1 AND couple_id = $2", [tripId, coupleId]
    );
    if (!trip) return fail("여행 정보를 찾을 수 없어요.", 404);

    const sets = ["updated_by = $1", "updated_at = $2"];
    const args = [userId || null, now()];
    if (caption !== undefined) { args.push(caption || ""); sets.push(`caption = $${args.length}`); }
    if (visitedAt !== undefined) {
      args.push(visitedAt ? new Date(visitedAt).toISOString() : null);
      sets.push(`visited_at = $${args.length}`);
    }
    args.push(tripId);
    await run(`UPDATE trips SET ${sets.join(", ")} WHERE id = $${args.length}`, args);
    return ok({ ok: true });
  } catch (e) {
    console.error("[api/trips PATCH]", e);
    return fail("저장 중 오류가 발생했어요.", 500);
  }
}
