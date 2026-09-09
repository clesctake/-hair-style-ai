"use client";

import { useState } from "react";

export default function Home() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
const [referencePreview, setReferencePreview] = useState(null);
  const [request, setRequest] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleImage(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);

          if (!blob) {
            setError("画像の変換に失敗しました。");
            return;
          }

          const jpegFile = new File([blob], "hair.jpg", {
            type: "image/jpeg",
          });

          setImage(jpegFile);
          setPreview(URL.createObjectURL(jpegFile));
          setResult(null);
          setError("");
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("この画像を読み込めませんでした。別の写真を選んでください。");
    };

    img.src = url;
  } catch {
    setError("画像の変換に失敗しました。");
  }
}
  async function handleReferenceImage(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);

          if (!blob) {
            setError("イメージ画像の変換に失敗しました。");
            return;
          }

          const jpegFile = new File([blob], "reference.jpg", {
            type: "image/jpeg",
          });

          setReferenceImage(jpegFile);
          setReferencePreview(URL.createObjectURL(jpegFile));
          setResult(null);
          setError("");
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("イメージ画像を読み込めませんでした。");
    };

    img.src = url;
  } catch {
    setError("イメージ画像の変換に失敗しました。");
  }
  }
  async function generate() {
    if (!image || !referenceImage || !request.trim()) { 
      setError("写真と、なりたい髪型・髪色を入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("image", image);
    formData.append("referenceImage", referenceImage);
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
  <h2>なりたいイメージ写真</h2>
</div>

<label className="upload">
  {referencePreview ? (
    <img src={referencePreview} alt="Reference" />
  ) : (
    <>
      <strong>イメージ写真を選択</strong>
      <small>なりたい髪型・髪色の参考写真</small>
    </>
  )}

  <input
    type="file"
    accept="image/*"
    onChange={handleReferenceImage}
    hidden
  />
</label>
      <div className="step">
          <span>3</span>
          <h2>なりたいスタイル</h2>
        </div>

        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="例：韓国風の顔まわりレイヤー。髪色は透明感のあるオリーブベージュ。長さは変えない。"
        />

        <div className="step">
          <span>4</span>
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
 
