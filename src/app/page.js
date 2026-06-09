"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId, saveUserId } from "@/lib/session";
import { createUser, getUser, findUserByCode } from "@/lib/data";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState("home");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    const id = getUserId();
    if (!id) return;
    getUser(id).then((u) => {
      if (!u) return;
      router.replace(u.coupleId ? "/map" : "/connect");
    }).catch(() => {});
  }, [router]);

  async function handleCreate() {
    setBusy(true); setErr("");
    try {
      const { id, code } = await createUser();
      saveUserId(id);
      setNewCode(code);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function handleEnter() {
    setBusy(true); setErr("");
    try {
      const u = await findUserByCode(code);
      if (!u) { setErr("코드를 찾을 수 없어요."); return; }
      saveUserId(u.id);
      router.replace(u.coupleId ? "/map" : "/connect");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <main className="screen" style={{ justifyContent: "center", gap: 22 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 54 }}>🗺️</div>
        <h1 style={{ fontSize: 26, marginTop: 12 }}>우리 여행 지도</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          둘이 함께 채워가는 한국 지도
        </p>
      </div>

      {newCode ? (
        <div className="card" style={{ textAlign: "center" }}>
          <p className="muted" style={{ fontSize: 13 }}>당신의 코드예요</p>
          <div style={{
            fontSize: 32, fontWeight: 800, letterSpacing: 5,
            margin: "12px 0", color: "var(--accent-deep)",
          }}>{newCode}</div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            상대에게 알려주거나, 상대 코드로 연결하세요.
          </p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => router.replace("/connect")}>
            연결하러 가기
          </button>
        </div>
      ) : mode === "home" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button className="btn" onClick={handleCreate} disabled={busy}>
            {busy ? "발급 중…" : "새로 시작하기"}
          </button>
          <button className="btn btn-ghost" onClick={() => setMode("enter")}>
            코드가 있어요
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="field"
            placeholder="코드 6자리"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ textAlign: "center", letterSpacing: 5, fontWeight: 700 }}
          />
          <button className="btn" onClick={handleEnter} disabled={busy || code.length < 6}>
            {busy ? "확인 중…" : "입장하기"}
          </button>
          <button className="btn btn-ghost" onClick={() => setMode("home")}>뒤로</button>
        </div>
      )}

      {err && <p style={{ color: "#a13e3a", fontSize: 13, textAlign: "center" }}>{err}</p>}
    </main>
  );
}
