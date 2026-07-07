// src/lib/server/blob.js — Vercel Blob 헬퍼.
// 기본 이름(BLOB_READ_WRITE_TOKEN)뿐 아니라, 스토어를 커스텀 접두사로 연결했을 때
// 주입되는 `<접두사>_READ_WRITE_TOKEN` 형태의 변수도 자동으로 찾아 사용한다.
import { put as blobPut, del as blobDel } from "@vercel/blob";

export function resolveBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const altKey = Object.keys(process.env).find((k) => k.endsWith("_READ_WRITE_TOKEN"));
  if (altKey) {
    console.warn(`[blob] BLOB_READ_WRITE_TOKEN 대신 ${altKey} 환경변수를 사용합니다.`);
    return process.env[altKey];
  }
  return null;
}

function requireToken() {
  const token = resolveBlobToken();
  if (!token) {
    console.error(
      "[blob] BLOB 토큰이 설정되지 않았어요. Vercel 대시보드 → Storage에서 Blob 스토어를 이 프로젝트에 연결한 뒤 Redeploy 하세요."
    );
    throw new Error("사진 저장소가 아직 연결되지 않았어요. 잠시 후 다시 시도해주세요.");
  }
  return token;
}

export function put(pathname, body, options = {}) {
  return blobPut(pathname, body, { token: requireToken(), ...options });
}

export function del(urls, options = {}) {
  return blobDel(urls, { token: requireToken(), ...options });
}
