// src/app/mypage/page.js
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getUserId, clearUserId } from "@/lib/session";
import { getUser, updateUser, getCouple } from "@/lib/data";

export default function MyPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const msgTimers = useRef([]);
  const [copied, setCopied] = useState(false);
  const [solo, setSolo] = useState(false);

  // 언마운트 시 메시지 타이머 정리
  useEffect(() => {
    const timers = msgTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // 저장 결과 메시지: 3초 표시 후 즉시 사라짐
  function flashMsg(text) {
    msgTimers.current.forEach(clearTimeout);
    setMsg(text);
    msgTimers.current = [setTimeout(() => setMsg(""), 3000)];
  }

  useEffect(() => {
    const id = getUserId();
    if (!id) { router.replace("/"); return; }
    (async () => {
      try {
        const u = await getUser(id);
        if (!u) { router.replace("/"); return; }
        setMe(u);
        setNickname(u.nickname || "");
        const c = u.coupleId ? await getCouple(u.coupleId) : null;
        setSolo(!c || !c.memberB);
      } catch (e) {
        console.error("[MyPage] 불러오기 실패:", e);
        router.replace("/");
      }
    })();
  }, [router]);

  async function handleSave() {
    if (!nickname.trim()) { flashMsg("닉네임을 입력해 주세요."); return; }
    setBusy(true);
    try {
      await updateUser(me.id, { nickname: nickname.trim() });
      setMe({ ...me, nickname: nickname.trim() });
      flashMsg("저장했어요.");
    } catch (e) {
      console.error("[MyPage] 닉네임 저장 실패:", e);
      flashMsg("저장에 실패했어요.");
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
          aria-label="뒤로"
          style={{
            background: "transparent", border: 0, cursor: "pointer",
            width: 44, height: 44, marginLeft: -12, marginRight: -7,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--ink)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 20 }}>설정</h1>
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
        {solo && (
          <button
            className="btn"
            style={{ marginTop: 12, fontSize: 13 }}
            onClick={() => router.push("/connect")}
          >커플 연결</button>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>닉네임</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="field"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
            style={{ flex: 1, minWidth: 0, height: 48, padding: "0 16px" }}
          />
          <button
            className="btn"
            style={{
              flex: "0 0 auto", width: 92, height: 48, padding: 0,
              whiteSpace: "nowrap", fontSize: 14.5,
            }}
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
        {msg && (
          <p style={{ color: "var(--accent-deep)", fontSize: 12, marginTop: 8 }}>
            {msg}
          </p>
        )}
      </div>

      <button
        onClick={handleLogout}
        style={{
          marginTop: "auto", alignSelf: "center",
          background: "transparent", border: 0,
          color: "var(--ink-soft)", fontSize: 13, padding: "10px 14px",
          textDecoration: "underline", textUnderlineOffset: 3,
        }}
      >
        로그아웃
      </button>
    </main>
  );
}
