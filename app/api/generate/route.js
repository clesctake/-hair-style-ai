export const runtime = "nodejs";

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEYが設定されていません。" },
        { status: 500 }
      );
    }

    const incoming = await request.formData();
    const image = incoming.get("image");
    const userRequest = incoming.get("request");

    if (!image || !userRequest) {
      return Response.json(
        { error: "写真と希望するスタイルを入力してください。" },
        { status: 400 }
      );
    }

    const form = new FormData();

    form.append("model", "gpt-image-2");
    form.append("image", image, image.name || "hair.jpg");

    form.append(
      "prompt",
      `
これは美容室で使用するヘアスタイル・ヘアカラーの
リアルな仕上がりシミュレーションです。

【お客様の希望】
${userRequest}

添付された人物写真を編集してください。

重要な条件：
- 同一人物として自然に維持する
- 顔の形、目、鼻、口、肌、表情をできる限り変更しない
- 年齢や人物の特徴を変更しない
- ポーズと撮影アングルを維持する
- 背景をできる限り維持する
- 主に髪だけを編集する
- 指定された髪型、長さ、レイヤー、前髪、髪色を反映する
- 毛流れ、毛先、ツヤ、陰影を写真として自然にする
- ウィッグのような不自然な質感にしない
- 実際に美容室で施術した後の写真のような仕上がりにする
- 過度な美肌加工や顔の加工をしない
      `.trim()
    );

    form.append("quality", "medium");
    form.append("input_fidelity", "high");

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return Response.json(
        {
          error:
            data?.error?.message ||
            "AI画像の生成に失敗しました。",
        },
        { status: response.status }
      );
    }

    const base64 = data?.data?.[0]?.b64_json;

    if (!base64) {
      return Response.json(
        { error: "生成画像を取得できませんでした。" },
        { status: 500 }
      );
    }

    return Response.json({
      image: `data:image/png;base64,${base64}`,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error:
          error?.message ||
          "予期しないエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
