"use client";

import { useState } from "react";

export default function DiagramPage() {
  const [angle, setAngle] = useState(90);

  // 頭皮面を0°、頭皮に対して垂直を90°として計算
  const rad = (angle * Math.PI) / 180;

  const rootX = 190;
  const rootY = 230;
  const panelLength = 130;

  const endX = rootX + Math.cos(rad) * panelLength;
  const endY = rootY - Math.sin(rad) * panelLength;

  let form = "セイムレイヤー";

  if (angle < 90) {
    form = "グラデーション";
  } else if (angle > 90) {
    form = "レイヤー";
  }

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "30px 20px 80px",
        fontFamily: "sans-serif",
      }}
    >
      <p style={{ fontSize: "12px", letterSpacing: "2px" }}>
        HAIR MIRROR AI
      </p>

      <h1>3D CUT DIAGRAM</h1>

      <p>
        頭皮基準の引き出し角度から、カットパネルを可視化するテストページです。
      </p>

      <section
        style={{
          marginTop: "30px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "18px",
        }}
      >
        <h2>引き出し角度：{angle}°</h2>

        <p>
          FORM：<strong>{form}</strong>
        </p>

        <input
          type="range"
          min="0"
          max="150"
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
          style={{ width: "100%" }}
        />

        <div style={{ marginTop: "25px" }}>
          <svg
            viewBox="0 0 400 330"
            style={{
              width: "100%",
              background: "#f7f7f7",
              borderRadius: "14px",
            }}
          >
            {/* 頭部 */}
            <ellipse
              cx="150"
              cy="190"
              rx="85"
              ry="110"
              fill="#ead8cc"
              stroke="#333"
              strokeWidth="3"
            />

            {/* 頭皮基準線 */}
            <line
              x1={rootX - 80}
              y1={rootY}
              x2={rootX + 80}
              y2={rootY}
              stroke="#888"
              strokeWidth="3"
              strokeDasharray="8 6"
            />

            {/* 引き出しパネル */}
            <line
              x1={rootX}
              y1={rootY}
              x2={endX}
              y2={endY}
              stroke="#1976d2"
              strokeWidth="18"
              strokeLinecap="round"
              opacity="0.65"
            />

            {/* 根元 */}
            <circle cx={rootX} cy={rootY} r="7" fill="#111" />

            {/* 90度基準 */}
            <line
              x1={rootX}
              y1={rootY}
              x2={rootX}
              y2={rootY - 130}
              stroke="#22a06b"
              strokeWidth="3"
              strokeDasharray="6 6"
            />

            <text x="205" y="255" fontSize="14">
              頭皮面 0°
            </text>

            <text x="200" y="95" fontSize="14">
              90°
            </text>

            <text
              x={endX + 8}
              y={endY}
              fontSize="16"
              fontWeight="bold"
            >
              {angle}°
            </text>
          </svg>
        </div>

        <div style={{ marginTop: "20px", lineHeight: "1.8" }}>
          <strong>現在の判定</strong>

          <p>
            {angle < 90 &&
              "90°未満：グラデーション。自然落下時にパネル上面が長く、下面が短くなる。"}

            {angle === 90 &&
              "90°：セイムレイヤー。頭皮に対して垂直に引き出す。"}

            {angle > 90 &&
              "90°超：レイヤー。自然落下時にパネル上面が短く、下面が長くなる。"}
          </p>
        </div>
      </section>
    </main>
  );
}
