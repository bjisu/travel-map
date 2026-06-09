// src/app/connect/page.js
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/session";
import { getUser, connectCouple } from "@/lib/data";

export default function Connect() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [partnerCode, setPartnerCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = getUserId();
    if (!id) { router.replace("/"); return; }
    getUser(id).then((u) => {
      if (!u) { router.replace("/"); return; }
      if (u.coupleId) { router.replace("/map"); return; }
      setMe(u);
    }).catch(() => router.replace("/"));
  }, [router]);

  async function handleConnect() {
    setBusy(true); setErr("");
    try {
      await connectCouple(me.id, partnerCode);
      router.replace("/map");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!me) return <main className="screen" />;

  return (
    <main className="screen" style={{ justifyContent: "center", gap: 22 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 46 }}>🤝</div>
        <h1 style={{ fontSize: 24, marginTop: 12 }}>커플 연결하기</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
          상대의 코드를 입력하면 둘이 연결돼요.
        </p>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <p className="muted" style={{ fontSize: 13 }}>내 코드</p>
        <div style={{
          fontSize: 30, fontWeight: 800, letterSpacing: 5,
          marginTop: 8, color: "var(--accent-deep)",
        }}>{me.code}</div>
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
      </div>

      <p className="muted" style={{ fontSize: 11.5, textAlign: "center" }}>
        ⚠️ 한 번 연결하면 해제할 수 없어요. 신중하게 입력해 주세요.
      </p>

      {err && <p style={{ color: "#a13e3a", fontSize: 13, textAlign: "center" }}>{err}</p>}
    </main>
  );
}
