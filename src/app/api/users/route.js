// POST /api/users        → 새 사용자 생성 (연결 코드 발급 + 혼자용 지도 생성)
// GET  /api/users?code=X → 코드로 사용자 찾기 (없으면 null)
import { row, tx, newId, now, toUser, ok, fail } from "@/lib/server/db";
import { generateCode } from "@/lib/utils";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nickname = (body.nickname || "여행자").slice(0, 12);

    for (let i = 0; i < 5; i++) {
      const code = generateCode();
      const dup = await row("SELECT id FROM users WHERE code = $1", [code]);
      if (dup) continue;
      const id = newId();
      const coupleId = newId();
      await tx(async (c) => {
        await c.query(
          "INSERT INTO couples (id, member_a, member_b, connected_at) VALUES ($1, $2, NULL, $3)",
          [coupleId, id, now()]
        );
        await c.query(
          "INSERT INTO users (id, code, nickname, couple_id, created_at) VALUES ($1, $2, $3, $4, $5)",
          [id, code, nickname, coupleId, now()]
        );
      });
      return ok({ id, code, coupleId });
    }
    return fail("코드 생성에 실패했어요. 다시 시도해 주세요.", 500);
  } catch (e) {
    console.error("[api/users POST]", e);
    return fail("사용자 생성 중 오류가 발생했어요.", 500);
  }
}

export async function GET(request) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return fail("code 파라미터가 필요해요.");
    const r = await row("SELECT * FROM users WHERE code = $1", [code.toUpperCase().trim()]);
    return ok(toUser(r));
  } catch (e) {
    console.error("[api/users GET]", e);
    return fail("사용자 조회 중 오류가 발생했어요.", 500);
  }
}
