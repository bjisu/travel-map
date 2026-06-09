// src/components/TripModal.js
"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  listenPhotos, getTripByRegion, addPhotoToRegion, deletePhoto, updateTripMeta,
  MAX_PHOTOS_PER_TRIP, MAX_CAPTION,
} from "@/lib/data";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputValue(ts) {
  if (!ts) return todayStr();
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TripModal({
  coupleId, userId, members, region, onClose, onToast,
}) {
  const [trip, setTrip] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("view"); // view | add | editMeta
  const fileRef = useRef(null);

  const [caption, setCaption] = useState("");
  const [visitedAt, setVisitedAt] = useState(todayStr());
  const [file, setFile] = useState(null);

  // trip 초기 로드 (region 바뀔 때만 실행)
  useEffect(() => {
    let cancelled = false;
    getTripByRegion(coupleId, region.id)
      .then((t) => {
        if (cancelled) return;
        setTrip(t);
        if (!t) {
          setMode("add");
        } else {
          setCaption(t.caption || "");
          setVisitedAt(dateInputValue(t.visitedAt));
        }
      })
      .catch(() => { if (!cancelled) setMode("add"); });
    return () => { cancelled = true; };
  }, [coupleId, region.id]);

  // photos 실시간 구독 — trip.id 가 생기거나 바뀔 때 자동 재구독
  // (새 지역에 첫 사진 추가 후 setTrip 되면 여기서 구독이 시작됨)
  const tripId = trip?.id;
  useEffect(() => {
    if (!tripId) return;
    return listenPhotos(coupleId, tripId, setPhotos);
  }, [coupleId, tripId]);

  // slide 보정: useEffect 대신 렌더 시점 파생값으로 계산 (lint error 해소)
  const displaySlide = photos.length > 0 ? Math.min(slide, photos.length - 1) : 0;

  async function handleAddPhoto() {
    if (!file) { onToast("사진을 선택해 주세요."); return; }
    if (caption.length > MAX_CAPTION) {
      onToast(`캡션은 ${MAX_CAPTION}자 이내로 적어주세요.`);
      return;
    }
    setBusy(true);
    try {
      await addPhotoToRegion({
        coupleId, userId,
        regionId: region.id,
        regionName: region.fullName,
        file,
        caption: trip ? undefined : caption,
        visitedAt: trip ? undefined : visitedAt,
      });
      setFile(null);
      const reloaded = await getTripByRegion(coupleId, region.id);
      setTrip(reloaded); // tripId 변경 → photos useEffect 가 자동으로 구독 시작
      if (reloaded) {
        setCaption(reloaded.caption || "");
        setVisitedAt(dateInputValue(reloaded.visitedAt));
      }
      setMode("view");
      onToast("사진을 추가했어요.");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMeta() {
    setBusy(true);
    try {
      await updateTripMeta(coupleId, trip.id, userId, { caption, visitedAt });
      setMode("view");
      onToast("저장했어요.");
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePhoto(photoId) {
    if (!confirm("이 사진을 삭제할까요?")) return;
    setBusy(true);
    try {
      await deletePhoto(coupleId, trip.id, photoId);
      const left = photos.length - 1;
      if (left === 0) {
        onToast("사진을 모두 삭제해 지역이 비워졌어요.");
        onClose();
      } else {
        onToast("사진을 삭제했어요.");
      }
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const current = photos[displaySlide];
  const uploader = current ? members?.[current.uploadedBy]?.nickname : null;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 20 }}>{region.fullName}</h2>
            {trip && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                사진 {photos.length} / {MAX_PHOTOS_PER_TRIP}장 · {formatDate(trip.visitedAt)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: 0, fontSize: 24,
              color: "var(--ink-soft)", cursor: "pointer", padding: 4,
            }}
            aria-label="닫기"
          >×</button>
        </div>

        {/* === 뷰 모드 === */}
        {mode === "view" && trip && photos.length > 0 && (
          <>
            <div style={{
              position: "relative",
              aspectRatio: "1",
              borderRadius: 16,
              overflow: "hidden",
              background: "#000",
              marginBottom: 12,
            }}>
              <Image
                src={current.photoUrl}
                alt=""
                fill
                style={{ objectFit: "cover" }}
                sizes="(max-width: 480px) 100vw, 480px"
              />
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setSlide((s) => (s - 1 + photos.length) % photos.length)}
                    style={navBtnStyle("left")}
                    aria-label="이전"
                  >‹</button>
                  <button
                    onClick={() => setSlide((s) => (s + 1) % photos.length)}
                    style={navBtnStyle("right")}
                    aria-label="다음"
                  >›</button>
                  <div style={{
                    position: "absolute", bottom: 10, left: "50%",
                    transform: "translateX(-50%)", display: "flex", gap: 6,
                  }}>
                    {photos.map((_, i) => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: i === displaySlide ? "#fff" : "rgba(255,255,255,0.5)",
                      }} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {uploader && `${uploader}이(가) 올림`}
                {displaySlide === 0 && <span style={{
                  marginLeft: 8, padding: "2px 8px", borderRadius: 99,
                  background: "var(--accent-soft)", color: "var(--accent-deep)",
                  fontSize: 11, fontWeight: 700,
                }}>대표</span>}
              </span>
              <button
                className="btn-danger"
                onClick={() => handleDeletePhoto(current.id)}
                disabled={busy}
                style={{ border: "1px solid #d9aaa8", borderRadius: 99, padding: "5px 12px", fontSize: 12, background: "transparent", color: "#a13e3a" }}
              >
                삭제
              </button>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <p className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>캡션</p>
              <p style={{ fontSize: 14.5, whiteSpace: "pre-wrap" }}>
                {trip.caption || <span className="muted">캡션이 없어요.</span>}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setMode("editMeta")}
              >캡션 · 날짜 수정</button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setMode("add")}
                disabled={photos.length >= MAX_PHOTOS_PER_TRIP}
              >
                {photos.length >= MAX_PHOTOS_PER_TRIP ? "가득 참" : "사진 추가"}
              </button>
            </div>
          </>
        )}

        {/* === 캡션·날짜 수정 모드 === */}
        {mode === "editMeta" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="muted" style={{ fontSize: 12 }}>여행 날짜</label>
              <input
                type="date"
                className="field"
                value={visitedAt}
                onChange={(e) => setVisitedAt(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </div>
            <div>
              <label className="muted" style={{ fontSize: 12 }}>
                캡션 ({caption.length}/{MAX_CAPTION})
              </label>
              <textarea
                className="field"
                rows={3}
                placeholder="이 여행을 짧게 기록해 보세요"
                value={caption}
                maxLength={MAX_CAPTION}
                onChange={(e) => setCaption(e.target.value)}
                style={{ marginTop: 6, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode("view")}>취소</button>
              <button className="btn" style={{ flex: 1 }} onClick={handleSaveMeta} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}

        {/* === 사진 추가 모드 === */}
        {mode === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <button
              className="btn btn-ghost"
              onClick={() => fileRef.current?.click()}
              style={{ padding: 30, fontSize: 14 }}
            >
              {file ? `📷 ${file.name}` : "📷 사진 선택하기"}
            </button>

            {!trip && (
              <>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>여행 날짜</label>
                  <input
                    type="date"
                    className="field"
                    value={visitedAt}
                    onChange={(e) => setVisitedAt(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    캡션 ({caption.length}/{MAX_CAPTION})
                  </label>
                  <textarea
                    className="field"
                    rows={3}
                    placeholder="이 여행을 짧게 기록해 보세요"
                    value={caption}
                    maxLength={MAX_CAPTION}
                    onChange={(e) => setCaption(e.target.value)}
                    style={{ marginTop: 6, resize: "vertical" }}
                  />
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {trip && (
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode("view")}>
                  취소
                </button>
              )}
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={handleAddPhoto}
                disabled={busy || !file}
              >
                {busy ? "업로드 중…" : "추가"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function navBtnStyle(side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 8,
    width: 36, height: 36,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: 0,
    fontSize: 22,
    cursor: "pointer",
  };
}
