// DELETE /api/couples/[id]/trips/[tripId]/photos/[photoId]
// - 남은 사진 order 재배치, 대표 자동 승계, 마지막 사진이면 trip 삭제
import { del } from "@vercel/blob";
import { row, rows, tx, now, ok, fail } from "@/lib/server/db";

export async function DELETE(request, { params }) {
  try {
    const { id: coupleId, tripId, photoId } = await params;
    const trip = await row(
      "SELECT id FROM trips WHERE id = $1 AND couple_id = $2", [tripId, coupleId]
    );
    if (!trip) return ok({ ok: true });

    const photos = await rows(
      "SELECT * FROM photos WHERE trip_id = $1 ORDER BY ord ASC", [tripId]
    );
    const target = photos.find((p) => p.id === photoId);
    if (!target) return ok({ ok: true });

    await tx(async (c) => {
      await c.query("DELETE FROM photos WHERE id = $1", [photoId]);
      const remaining = photos.filter((p) => p.id !== photoId);
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].ord !== i) {
          await c.query("UPDATE photos SET ord = $1 WHERE id = $2", [i, remaining[i].id]);
        }
      }
      if (remaining.length === 0) {
        await c.query("DELETE FROM trips WHERE id = $1", [tripId]);
      } else {
        await c.query(
          "UPDATE trips SET photo_count = $1, cover_thumb_url = $2, updated_at = $3 WHERE id = $4",
          [remaining.length, remaining[0].thumb_url, now(), tripId]
        );
      }
    });

    // Blob 파일 정리 (실패해도 무시)
    try { await del([target.photo_url, target.thumb_url]); }
    catch (e) { console.warn("[api/photos DELETE] blob 삭제 실패:", e); }

    return ok({ ok: true });
  } catch (e) {
    console.error("[api/photos DELETE]", e);
    return fail("사진 삭제 중 오류가 발생했어요.", 500);
  }
}
