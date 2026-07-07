// POST /api/blob/upload → 클라이언트 직접 업로드용 토큰 발급.
// Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한되어 원본 사진(≤10MB)을
// API 라우트로 보내면 413이 난다. 그래서 브라우저가 Vercel Blob에 직접 올리고,
// 이 라우트는 업로드 토큰만 발급한다. (DB 등록은 업로드 뒤 /photos API가 담당)
import { handleUpload } from "@vercel/blob/client";
import { resolveBlobToken } from "@/lib/server/blob";
import { row, fail } from "@/lib/server/db";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
// photos/<coupleId>/<파일명> · thumbs/<coupleId>/<파일명> 경로만 허용
const PATH_RE = /^(photos|thumbs)\/([A-Za-z0-9-]{8,64})\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await handleUpload({
      request,
      body,
      token: resolveBlobToken(),
      onBeforeGenerateToken: async (pathname) => {
        const m = PATH_RE.exec(pathname);
        if (!m) throw new Error("허용되지 않는 업로드 경로예요.");
        const couple = await row("SELECT id FROM couples WHERE id = $1", [m[2]]);
        if (!couple) throw new Error("커플 정보를 찾을 수 없어요.");
        return {
          allowedContentTypes: ["image/*"],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
        };
      },
      // 등록은 클라이언트가 업로드 완료 후 /photos API로 직접 요청하므로 여기선 없음
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (e) {
    console.error("[api/blob/upload]", e);
    return fail(e.message || "사진 업로드 준비에 실패했어요.", 400);
  }
}
