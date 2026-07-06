// DELETE /api/couples/[id]/trips/[tripId]/photos/[photoId]
// - 남은 사진 order 재배치, 대표 자동 승계, 마지막 사진이면 trip 삭제
import fs from "node:fs";
import path from "node:path";
import { db, tx, now, UPLOADS_DIR, ok, fail } from "@/lib/server/db";

export async function DELETE(request, { params }) {
  try {
    const { id: coupleId, tripId, photoId } = await params;
    const trip = db.prepare(
      "SELECT id FROM trips WHERE id = ? AND couple_id = ?"
    ).get(tripId, coupleId);
    if (!trip) return ok({ ok: true });

    const photos = db.prepare(
      "SELECT * FROM photos WHERE trip_id = ? ORDER BY ord ASC"
    ).all(tripId);
    const target = photos.find((p) => p.id === photoId);
    if (!target) return ok({ ok: true });

    tx(() => {
      db.prepare("DELETE FROM photos WHERE id = ?").run(photoId);
      const remaining = photos.filter((p) => p.id !== photoId);
      remaining.forEach((p, i) => {
        if (p.ord !== i) db.prepare("UPDATE photos SET ord = ? WHERE id = ?").run(i, p.id);
      });
      if (remaining.length === 0) {
        db.prepare("DELETE FROM trips WHERE id = ?").run(tripId);
      } else {
        db.prepare(
          "UPDATE trips SET photo_count = ?, cover_thumb_url = ?, updated_at = ? WHERE id = ?"
        ).run(remaining.length, remaining[0].thumb_url, now(), tripId);
      }
    });

    // 디스크 파일 정리 (실패해도 무시)
    for (const rel of [target.photo_path, target.thumb_path]) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, rel)); }
      catch (e) { console.warn("[api/photos DELETE] 파일 삭제 실패:", rel, e.code); }
    }

    return ok({ ok: true });
  } catch (e) {
    console.error("[api/photos DELETE]", e);
    return fail("사진 삭제 중 오류가 발생했어요.", 500);
  }
}
