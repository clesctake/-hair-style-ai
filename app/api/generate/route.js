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
    const referenceImage = incoming.get("referenceImage");
    const userRequest = incoming.get("request");

    if (!image || !referenceImage || !userRequest) {
      return Response.json(
        { error: "写真と希望するスタイルを入力してください。" },
        { status: 400 }
      );
    }

    const form = new FormData();

    form.append("model", "gpt-image-2");
    form.append("image[]", image, image.name || "hair.jpg");
    form.append("prompt", `Use the first image as the person to edit. Use the second image only as the hairstyle and hair-color reference. Preserve the first image's identity, face, skin tone, pose, clothing, body, camera angle, lighting and background. Change only the hair. User request: ${userRequest}. Create a realistic professional salon-quality result.`);

    form.append("quality", "medium");
    

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
