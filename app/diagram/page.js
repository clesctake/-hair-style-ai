"use client";

import { useState } from "react";

export default function DiagramPage() {
  const [currentImage, setCurrentImage] = useState(null);
  const [goalImage, setGoalImage] = useState(null);

  const [currentPreview, setCurrentPreview] = useState(null);
  const [goalPreview, setGoalPreview] = useState(null);

  function selectCurrentImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCurrentImage(file);
    setCurrentPreview(URL.createObjectURL(file));
  }

  function selectGoalImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setGoalImage(file);
    setGoalPreview(URL.createObjectURL(file));
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
      <p
        style={{
          fontSize: "12px",
          letterSpacing: "2px",
        }}
      >
        HAIR MIRROR AI
      </p>

      <h1>AI CUT DESIGN</h1>

      <p>
        現在の髪と、なりたいスタイルから完成イメージとカット展開図を作成します。
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "20px",
          marginTop: "30px",
        }}
      >
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "18px",
            padding: "20px",
          }}
        >
          <h2>現在の写真</h2>

          <input
            type="file"
            accept="image/*"
            onChange={selectCurrentImage}
          />

          {currentPreview && (
            <img
              src={currentPreview}
              alt="現在の写真"
              style={{
                width: "100%",
                marginTop: "20px",
                borderRadius: "14px",
              }}
            />
          )}
        </section>

        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: "18px",
            padding: "20px",
          }}
        >
          <h2>なりたいスタイル</h2>

          <input
            type="file"
            accept="image/*"
            onChange={selectGoalImage}
          />

          {goalPreview && (
            <img
              src={goalPreview}
              alt="なりたいスタイル"
              style={{
                width: "100%",
                marginTop: "20px",
                borderRadius: "14px",
              }}
            />
          )}
        </section>
      </div>

      <button
        disabled={!currentImage || !goalImage}
        style={{
          width: "100%",
          marginTop: "25px",
          padding: "17px",
          border: "none",
          borderRadius: "14px",
          fontSize: "16px",
          fontWeight: "bold",
          background:
            currentImage && goalImage ? "#111" : "#ccc",
          color: "#fff",
        }}
      >
        AIでスタイルを分析
      </button>

      <section
        style={{
          marginTop: "40px",
          paddingTop: "30px",
          borderTop: "1px solid #ddd",
        }}
      >
        <h2>AI STYLE PROPOSAL</h2>

        <p>
          顔の形と現在の髪を分析し、なりたいスタイルをベースに似合わせイメージを提案します。
        </p>

        <div
          style={{
            padding: "40px 20px",
            marginTop: "15px",
            textAlign: "center",
            background: "#f6f6f6",
            borderRadius: "16px",
          }}
        >
          ここに完成イメージと顔まわりの別提案を表示
        </div>
      </section>

      <section
        style={{
          marginTop: "40px",
          paddingTop: "30px",
          borderTop: "1px solid #ddd",
        }}
      >
        <h2>CUT DIAGRAM</h2>

        <div
          style={{
            padding: "50px 20px",
            marginTop: "15px",
            textAlign: "center",
            background: "#f6f6f6",
            borderRadius: "16px",
          }}
        >
          選択した完成スタイルのカット展開図をここに表示
        </div>
      </section>
    </main>
  );
}
