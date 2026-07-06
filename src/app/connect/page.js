// src/app/connect/page.js — 초대·연결 화면 (지도에서 언제든 들어올 수 있음)
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/session";
import { getUser, getCouple, connectCouple } from "@/lib/data";
import { withTimeout } from "@/lib/utils";

export default function Connect() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [partnerCode, setPartnerCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = getUserId();
    if (!id) { router.replace("/"); return; }
    (async () => {
      try {
        const u = await getUser(id);
        if (!u) { router.replace("/"); return; }
        const c = u.coupleId ? await getCouple(u.coupleId) : null;
        if (c && c.memberB) { router.replace("/map"); return; } // 이미 연결 완료
        setMe(u);
      } catch (e) {
        console.error("[Connect] 불러오기 실패:", e);
        router.replace("/map");
      }
    })();
  }, [router]);

  async function handleConnect() {
    setBusy(true); setErr("");
    try {
      await withTimeout(connectCouple(me.id, partnerCode));
      router.replace("/map");
    } catch (e) {
      console.error("[Connect] 연결 실패:", e);
      setErr(e?.message || "연결에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(me.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("[Connect] 코드 복사 실패:", e);
    }
  }

  if (!me) return <main className="screen" />;

  return (
    <main className="screen" style={{ justifyContent: "center", gap: 22 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24 }}>커플 연결하기</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
          내 코드를 알려주거나, 상대 코드를 입력하면 둘이 연결돼요.
        </p>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <p className="muted" style={{ fontSize: 13 }}>내 코드</p>
        <div style={{
          fontSize: 30, fontWeight: 800, letterSpacing: 5,
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

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          className="field"
          placeholder="상대 코드 6자리"
          value={partnerCode}
          maxLength={6}
          onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
          style={{ textAlign: "center", letterSpacing: 5, fontWeight: 700 }}
        />
        <button className="btn" onClick={handleConnect} disabled={busy || partnerCode.length < 6}>
          {busy ? "연결 중…" : "연결하기"}
        </button>
        <button className="btn btn-ghost" onClick={() => router.back()} disabled={busy}>
          뒤로가기
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.6, margin: "0 16px" }}>
        한 번 연결하면 해제할 수 없어요.
        <br />
        연결 전 혼자 기록한 여행은 함께 합쳐져요.
      </p>

      {err && <p style={{ color: "#a13e3a", fontSize: 13, textAlign: "center" }}>{err}</p>}
    </main>
  );
}
