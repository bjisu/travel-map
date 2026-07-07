// PATCH  /api/couples/[id]/trips/[tripId]/photos/[photoId] → 대표 사진으로 설정
// DELETE /api/couples/[id]/trips/[tripId]/photos/[photoId]
//        - 남은 사진 order 재배치, 대표 삭제 시 다음 사진이 자동 승계, 마지막 사진이면 trip 삭제
import { del } from "@/lib/server/blob";
import { row, rows, tx, now, ok, fail } from "@/lib/server/db";

export async function PATCH(request, { params }) {
  try {
    const { id: coupleId, tripId, photoId } = await params;
    await tx(async (c) => {
      const trip = (await c.query(
        "SELECT id FROM trips WHERE id = $1 AND couple_id = $2", [tripId, coupleId]
      )).rows[0];
      if (!trip) throw new Error("여행 정보를 찾을 수 없어요.");
      const photo = (await c.query(
        "SELECT thumb_url FROM photos WHERE id = $1 AND trip_id = $2", [photoId, tripId]
      )).rows[0];
      if (!photo) throw new Error("사진을 찾을 수 없어요.");
      await c.query(
        "UPDATE trips SET cover_photo_id = $1, cover_thumb_url = $2, updated_at = $3 WHERE id = $4",
        [photoId, photo.thumb_url, now(), tripId]
      );
    });
    return ok({ ok: true });
  } catch (e) {
    console.error("[api/photos PATCH]", e);
    return fail(e.message || "대표 사진 변경 중 오류가 발생했어요.", 400);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id: coupleId, tripId, photoId } = await params;
    const trip = await row(
      "SELECT * FROM trips WHERE id = $1 AND couple_id = $2", [tripId, coupleId]
    );
    if (!trip) return ok({ ok: true });

    const photos = await rows(
      "SELECT * FROM photos WHERE trip_id = $1 ORDER BY ord ASC", [tripId]
    );
    const target = photos.find((p) => p.id === photoId);
    if (!target) return ok({ ok: true });

    // 삭제 대상이 대표인지 판단 (예전 데이터는 cover_photo_id가 없으므로 썸네일 URL로 판별)
    const wasCover = trip.cover_photo_id
      ? trip.cover_photo_id === photoId
      : trip.cover_thumb_url === target.thumb_url;

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
      } else if (wasCover) {
        // 대표가 삭제된 경우에만 첫 사진이 자동 승계
        await c.query(
          "UPDATE trips SET photo_count = $1, cover_thumb_url = $2, cover_photo_id = $3, updated_at = $4 WHERE id = $5",
          [remaining.length, remaining[0].thumb_url, remaining[0].id, now(), tripId]
        );
      } else {
        await c.query(
          "UPDATE trips SET photo_count = $1, updated_at = $2 WHERE id = $3",
          [remaining.length, now(), tripId]
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
