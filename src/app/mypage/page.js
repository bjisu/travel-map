// src/app/mypage/page.js
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId, clearUserId } from "@/lib/session";
import { getUser, updateUser } from "@/lib/data";

export default function MyPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = getUserId();
    if (!id) { router.replace("/"); return; }
    getUser(id).then((u) => {
      if (!u) { router.replace("/"); return; }
      setMe(u);
      setNickname(u.nickname || "");
    }).catch(() => router.replace("/"));
  }, [router]);

  async function handleSave() {
    if (!nickname.trim()) { setMsg("닉네임을 입력해 주세요."); return; }
    setBusy(true); setMsg("");
    try {
      await updateUser(me.id, { nickname: nickname.trim() });
      setMe({ ...me, nickname: nickname.trim() });
      setMsg("저장했어요.");
    } catch {
      setMsg("저장에 실패했어요.");
    } finally { setBusy(false); }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(me.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function handleLogout() {
    clearUserId();
    router.replace("/");
  }

  if (!me) return <main className="screen" />;

  return (
    <main className="screen">
      <header style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "transparent", border: 0, fontSize: 22,
            color: "var(--ink-soft)", padding: 4, cursor: "pointer",
          }}
          aria-label="뒤로"
        >‹</button>
        <h1 style={{ fontSize: 20, marginLeft: 8 }}>마이페이지</h1>
      </header>

      <div className="card" style={{ marginBottom: 14, textAlign: "center" }}>
        <p className="muted" style={{ fontSize: 12 }}>내 코드</p>
        <div style={{
          fontSize: 26, fontWeight: 800, letterSpacing: 5,
          marginTop: 8, color: "var(--accent-deep)",
        }}>{me.code}</div>
        <button
          onClick={copyCode}
          style={{
            marginTop: 10, background: "transparent",
            border: "1px solid var(--line)", borderRadius: 99,
            padding: "5px 14px", fontSize: 12, color: "var(--ink-soft)",
            cursor: "pointer",
          }}
        >{copied ? "복사했어요!" : "코드 복사"}</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>닉네임</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="field"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
          />
          <button className="btn" style={{ width: "auto", padding: "0 18px" }} onClick={handleSave} disabled={busy}>
            저장
          </button>
        </div>
        {msg && <p style={{ color: "var(--accent-deep)", fontSize: 12.5, marginTop: 8 }}>{msg}</p>}
      </div>

      <button className="btn btn-ghost" style={{ marginTop: "auto" }} onClick={handleLogout}>
        로그아웃
      </button>
      <p className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 10 }}>
        로그아웃해도 코드로 다시 입장할 수 있어요.
      </p>
    </main>
  );
}
