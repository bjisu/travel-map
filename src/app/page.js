"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getUserId, saveUserId, setCreatePending, clearCreatePending, setCreateError,
} from "@/lib/session";
import { createUser, getUser, findUserByCode, getCouple, connectCouple } from "@/lib/data";
import { withTimeout } from "@/lib/utils";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState("home"); // home | enter | choose
  const [code, setCode] = useState("");
  const [owner, setOwner] = useState(null); // 조회된 코드 주인 (아직 혼자인 경우)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = getUserId();
    if (!id) return;
    getUser(id).then((u) => {
      if (u) router.replace("/map");
    }).catch((e) => console.error("[Home] 기존 사용자 조회 실패:", e));
  }, [router]);

  // 즉시 지도로 이동하고, 코드 발급은 백그라운드에서 진행한다.
  // 실패해도 지도 화면에서 안내 + 재시도할 수 있다.
  function handleCreate() {
    setCreatePending();
    createUser()
      .then(({ id }) => {
        saveUserId(id);
        clearCreatePending();
      })
      .catch((e) => {
        console.error("[Home] 코드 발급 실패:", e);
        setCreateError("코드 발급에 실패했어요. 다시 시도해주세요.");
      });
    router.push("/map");
  }

  async function handleEnter() {
    setBusy(true); setErr("");
    try {
      const u = await withTimeout(findUserByCode(code));
      if (!u) { setErr("코드를 다시 확인해주세요."); return; }
      const c = u.coupleId ? await withTimeout(getCouple(u.coupleId)) : null;
      if (c && c.memberB) {
        // 이미 완성된 커플 — 어느 멤버의 코드든 그 커플 지도로 입장
        saveUserId(u.id);
        router.replace("/map");
        return;
      }
      // 아직 혼자인 코드 — 내 코드(재입장)인지 상대 코드(연결)인지 선택
      setOwner(u);
      setMode("choose");
    } catch (e) {
      console.error("[Home] 코드 확인 실패:", e);
      setErr("코드 확인에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  function handleItsMine() {
    saveUserId(owner.id);
    router.replace("/map");
  }

  async function handleItsPartners() {
    setBusy(true); setErr("");
    try {
      let myId = getUserId();
      if (!myId) {
        const r = await withTimeout(createUser());
        myId = r.id;
        saveUserId(myId);
      }
      await withTimeout(connectCouple(myId, owner.code));
      router.replace("/map");
    } catch (e) {
      console.error("[Home] 커플 연결 실패:", e);
      setErr(e?.message || "연결에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
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

      {mode === "home" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button className="btn" onClick={handleCreate}>새로 시작하기</button>
          <button className="btn btn-ghost" onClick={() => { setMode("enter"); setErr(""); }}>
            코드가 있어요
          </button>
        </div>
      )}

      {mode === "enter" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
            내 코드 또는 상대방 코드를 입력하세요.
          </p>
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
          <button className="btn btn-ghost" onClick={() => { setMode("home"); setErr(""); }}>뒤로</button>
        </div>
      )}

      {mode === "choose" && owner && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <p className="muted" style={{ fontSize: 13 }}>이 코드는 누구의 코드인가요?</p>
            <div style={{
              fontSize: 26, fontWeight: 800, letterSpacing: 5,
              margin: "10px 0 4px", color: "var(--accent-deep)",
            }}>{owner.code}</div>
            <p className="muted" style={{ fontSize: 12.5 }}>{owner.nickname}</p>
          </div>
          <button className="btn" onClick={handleItsMine} disabled={busy}>
            내 코드예요 — 이어서 하기
          </button>
          <button className="btn" onClick={handleItsPartners} disabled={busy}>
            {busy ? "연결 중…" : "상대방 코드예요 — 커플로 연결하기"}
          </button>
          <button className="btn btn-ghost" onClick={() => { setMode("enter"); setErr(""); }} disabled={busy}>
            뒤로
          </button>
        </div>
      )}

      {err && <p style={{ color: "#a13e3a", fontSize: 13, textAlign: "center" }}>{err}</p>}
    </main>
  );
}
