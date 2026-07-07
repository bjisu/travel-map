// src/components/DateField.js
// 여행 날짜 선택 필드 — 네이티브 <input type="date"> 대신 직접 그리는 달력.
// 네이티브 인풋은 기기·브라우저마다 폭 계산이 달라 컨테이너를 벗어나거나
// max(미래 차단)가 무시되는 문제가 있어, 폭·비활성화를 완전히 제어한다.
// - 컨테이너 폭 100%로 어떤 화면(iPhone SE 320px 포함)에서도 넘치지 않는다
// - max 이후(미래) 날짜는 흐리게 표시되고 탭해도 선택되지 않는다
// - max가 속한 달에서는 다음 달 이동 버튼 자체가 비활성화된다
"use client";
import { useState } from "react";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");
const toStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

/**
 * @param {string} value - 선택된 날짜 (YYYY-MM-DD)
 * @param {string} max - 선택 가능한 마지막 날짜 (YYYY-MM-DD, 보통 오늘)
 * @param {string} [today] - 오늘 표시(점)를 붙일 날짜
 * @param {(v: string) => void} onChange
 */
export default function DateField({ value, max, today, onChange }) {
  const sel = parse(value);
  const maxD = parse(max);
  const [open, setOpen] = useState(false);
  // 달력이 보여줄 달 — 열 때마다 선택된 날짜(없으면 max)의 달로 맞춘다
  const [view, setView] = useState(() => {
    const base = sel || maxD || { y: new Date().getFullYear(), m: new Date().getMonth() };
    return { y: base.y, m: base.m };
  });

  function toggle() {
    if (!open) {
      const base = sel || maxD;
      if (base) setView({ y: base.y, m: base.m });
    }
    setOpen(!open);
  }

  function moveMonth(delta) {
    setView(({ y, m }) => {
      const t = y * 12 + m + delta;
      return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
    });
  }

  // max가 속한 달 이후로는 넘어갈 수 없다 (넘어가 봐야 전부 비활성 날짜)
  const atMaxMonth = !!maxD && view.y * 12 + view.m >= maxD.y * 12 + maxD.m;

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <button
        type="button"
        className="field"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ justifyContent: "space-between", gap: 8 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sel ? `${sel.y}년 ${sel.m + 1}월 ${sel.d}일` : "날짜를 선택해 주세요"}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="달력"
          style={{
            marginTop: 8,
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: "10px 12px 12px",
            animation: "fadeIn .15s ease",
          }}
        >
          {/* 월 이동 헤더 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달" style={monthBtnStyle}>‹</button>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>
              {view.y}년 {view.m + 1}월
            </span>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              disabled={atMaxMonth}
              aria-label="다음 달"
              style={{ ...monthBtnStyle, opacity: atMaxMonth ? 0.3 : 1, cursor: atMaxMonth ? "default" : "pointer" }}
            >›</button>
          </div>

          {/* 요일 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
            {DAY_LABELS.map((label, i) => (
              <span
                key={label}
                style={{
                  textAlign: "center", fontSize: 11.5, padding: "4px 0",
                  color: i === 0 ? "#c96f6a" : "var(--ink-soft)",
                }}
              >{label}</span>
            ))}
          </div>

          {/* 날짜 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const dateStr = toStr(view.y, view.m, d);
              const disabled = !!max && dateStr > max; // 미래 날짜: 탭 자체가 불가
              const isSel = value === dateStr;
              const isToday = today === dateStr;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(dateStr); setOpen(false); }}
                  aria-label={`${view.y}년 ${view.m + 1}월 ${d}일${disabled ? " (선택 불가)" : ""}`}
                  aria-pressed={isSel}
                  style={{
                    position: "relative",
                    height: 36,
                    border: 0,
                    borderRadius: 10,
                    padding: 0,
                    fontSize: 13.5,
                    fontWeight: isSel || isToday ? 700 : 400,
                    background: isSel ? "var(--accent-deep)" : "transparent",
                    color: isSel ? "#fff" : i % 7 === 0 ? "#c96f6a" : "var(--ink)",
                    opacity: disabled ? 0.3 : 1,
                    cursor: disabled ? "default" : "pointer",
                  }}
                >
                  {d}
                  {isToday && (
                    <span style={{
                      position: "absolute", bottom: 4, left: "50%",
                      transform: "translateX(-50%)",
                      width: 4, height: 4, borderRadius: "50%",
                      background: isSel ? "#fff" : "var(--accent-deep)",
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const monthBtnStyle = {
  width: 32, height: 32,
  border: 0, borderRadius: 10, padding: 0,
  background: "transparent",
  color: "var(--ink-soft)",
  fontSize: 20,
};
