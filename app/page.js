"use client";

import { useState } from "react";

export default function Home() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [request, setRequest] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError("");
  }

  async function generate() {
    if (!image || !request.trim()) {
      setError("写真と、なりたい髪型・髪色を入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("image", image);
    formData.append("request", request);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "生成に失敗しました。");
      }

      setResult(data.image);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="hero">
        <p className="eyebrow">AI HAIR SIMULATION</p>
        <h1>HAIR MIRROR AI</h1>
        <p className="description">
          写真をアップロードして、なりたい髪型や髪色を入力してください。
          AIが仕上がりイメージを作成します。
        </p>
      </div>

      <section className="card">
        <div className="step">
          <span>1</span>
          <h2>現在の写真</h2>
        </div>

        <label className="upload">
          {preview ? (
            <img src={preview} alt="Before" />
          ) : (
            <>
              <strong>写真を選択</strong>
              <small>正面から撮影した写真がおすすめです</small>
            </>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={handleImage}
            hidden
          />
        </label>

        <div className="step">
          <span>2</span>
          <h2>なりたいスタイル</h2>
        </div>

        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="例：韓国風の顔まわりレイヤー。髪色は透明感のあるオリーブベージュ。長さは変えない。"
        />

        <div className="step">
          <span>3</span>
          <h2>AIでシミュレーション</h2>
        </div>

        <button onClick={generate} disabled={loading}>
          {loading ? "AIが生成しています..." : "仕上がりを生成する"}
        </button>

        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="result">
          <h2>Before / AI After</h2>

          <div className="comparison">
            <div>
              <p>BEFORE</p>
              <img src={preview} alt="Before" />
            </div>

            <div>
              <p>AI AFTER</p>
              <img src={result} alt="AI After" />
            </div>
          </div>

          <a href={result} download="hair-mirror-ai.png">
            生成画像を保存
          </a>
        </section>
      )}
    </main>
  );
}
