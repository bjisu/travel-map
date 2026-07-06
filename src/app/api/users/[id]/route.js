// GET   /api/users/[id] → 사용자 조회 (없으면 null)
// PATCH /api/users/[id] → 닉네임 수정
import { db, toUser, ok, fail } from "@/lib/server/db";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return ok(toUser(row));
  } catch (e) {
    console.error("[api/users/[id] GET]", e);
    return fail("사용자 조회 중 오류가 발생했어요.", 500);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const nickname = (body.nickname || "").trim().slice(0, 12);
    if (!nickname) return fail("닉네임을 입력해 주세요.");
    const r = db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nickname, id);
    if (r.changes === 0) return fail("사용자를 찾을 수 없어요.", 404);
    return ok({ ok: true });
  } catch (e) {
    console.error("[api/users/[id] PATCH]", e);
    return fail("저장 중 오류가 발생했어요.", 500);
  }
}
