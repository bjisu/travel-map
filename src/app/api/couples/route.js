// POST /api/couples → 커플 연결 (상대의 지도에 합류, 내 혼자 기록은 함께 병합. 연결 1회·해제 불가)
import { db, tx, newId, now, ok, fail } from "@/lib/server/db";

export async function POST(request) {
  try {
    const { myUserId, partnerCode } = await request.json().catch(() => ({}));
    if (!myUserId || !partnerCode) return fail("필수 값이 빠졌어요.");

    const coupleId = tx(() => {
      const me = db.prepare("SELECT * FROM users WHERE id = ?").get(myUserId);
      if (!me) throw new Error("사용자 정보를 찾을 수 없어요.");
      const partner = db.prepare("SELECT * FROM users WHERE code = ?")
        .get(String(partnerCode).toUpperCase().trim());
      if (!partner) throw new Error("그 코드를 가진 사용자를 찾을 수 없어요.");
      if (partner.id === me.id) throw new Error("본인 코드로는 연결할 수 없어요.");

      const myCouple = me.couple_id
        ? db.prepare("SELECT * FROM couples WHERE id = ?").get(me.couple_id) : null;
      const partnerCouple = partner.couple_id
        ? db.prepare("SELECT * FROM couples WHERE id = ?").get(partner.couple_id) : null;

      if (myCouple && partnerCouple && myCouple.id === partnerCouple.id) {
        throw new Error("이미 연결되어 있어요.");
      }
      if (myCouple && myCouple.member_b) {
        throw new Error("이미 연결된 상태예요. 연결은 해제할 수 없어요.");
      }
      if (partnerCouple && partnerCouple.member_b) {
        throw new Error("상대가 이미 다른 사람과 연결되어 있어요.");
      }

      // 합류 대상: 상대의 지도 (없으면 새로 만든다)
      let targetId = partnerCouple?.id;
      if (!targetId) {
        targetId = newId();
        db.prepare(
          "INSERT INTO couples (id, member_a, member_b, connected_at) VALUES (?, ?, NULL, ?)"
        ).run(targetId, partner.id, now());
        db.prepare("UPDATE users SET couple_id = ? WHERE id = ?").run(targetId, partner.id);
      }

      // 내 혼자 기록을 상대의 1번 지도로 병합 (같은 지역이 양쪽에 있으면 중단)
      if (myCouple) {
        if ((myCouple.map_count || 1) > 1) {
          throw new Error("지도가 여러 장인 계정은 연결할 수 없어요. 상대가 내 코드를 입력해 연결해 주세요.");
        }
        const conflict = db.prepare(`
          SELECT t1.region_name FROM trips t1
          JOIN trips t2 ON t2.region_id = t1.region_id AND t2.couple_id = ? AND t2.map_no = 1
          WHERE t1.couple_id = ? AND t1.map_no = 1
        `).get(targetId, myCouple.id);
        if (conflict) {
          throw new Error(
            `두 지도 모두 '${conflict.region_name}' 기록이 있어 합칠 수 없어요. 한쪽 기록을 정리한 뒤 다시 연결해 주세요.`
          );
        }
        db.prepare("UPDATE trips SET couple_id = ? WHERE couple_id = ?").run(targetId, myCouple.id);
        db.prepare("DELETE FROM couples WHERE id = ?").run(myCouple.id);
      }

      db.prepare("UPDATE couples SET member_b = ?, connected_at = ? WHERE id = ?")
        .run(me.id, now(), targetId);
      db.prepare("UPDATE users SET couple_id = ? WHERE id = ?").run(targetId, me.id);
      return targetId;
    });

    return ok({ coupleId });
  } catch (e) {
    console.error("[api/couples POST]", e);
    return fail(e.message || "연결 중 오류가 발생했어요.", 409);
  }
}
