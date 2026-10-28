import {handleSimulationGenerate,simulationConnection} from '../../../src/lib/hair-simulation-api.ts';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROMPT_VERSION = "hair-identity-style-color-v3";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const json = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const model = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

// Checks configuration without sending photos or making a billable API request.
export async function GET() {
  return json(simulationConnection());
}

async function validPhoto(file) {
  if (!(file instanceof File) || !TYPES.has(file.type) || !file.size || file.size > MAX_FILE_BYTES) return false;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (file.type === "image/png") return [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  return new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
}

export async function POST(request) {
  // This endpoint is intended for the protected demo, not an anonymous paid service.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "この画面から生成してください。", code: "invalid_origin" }, 403);
  if (!process.env.OPENAI_API_KEY) return json({ error: "画像生成の接続設定が必要です。管理者がサーバーのOPENAI_API_KEYを設定してください。", code: "not_configured", providerAttempted: false }, 503);
  if (Number(request.headers.get("content-length")) > 67 * 1024 * 1024) return json({ error: "写真の合計サイズが大きすぎます。", code: "invalid_input" }, 413);

  let incoming;
  try { incoming = await request.formData(); }
  catch { return json({ error: "写真と希望を送信し直してください。", code: "invalid_input" }, 400); }
  if(incoming.has("generationRequest"))return handleSimulationGenerate(request,incoming);
  if(Number(request.headers.get("content-length"))>6.5*1024*1024)return json({error:"写真の合計サイズが大きすぎます。",code:"invalid_input"},413);
  const image=incoming.get("image"),referenceImage=incoming.get("referenceImage"),styleImage=incoming.get("styleReferenceImage"),colorImage=incoming.get("colorReferenceImage"),mode=incoming.get("mode"),userRequest=incoming.get("request");
  const separated=mode!==null;
  if(typeof userRequest!=="string"||!userRequest.trim()||userRequest.length>4500||!(await validPhoto(image))||
    (separated?(!["style_only","color_only","style_color"].includes(mode)||referenceImage!==null||mode==="style_only"&&colorImage!==null||mode==="color_only"&&styleImage!==null||styleImage!==null&&!(await validPhoto(styleImage))||colorImage!==null&&!(await validPhoto(colorImage))):styleImage!==null||colorImage!==null||!(await validPhoto(referenceImage)))){
   return json({error:"本人写真・参考写真の役割と希望文を確認してください。写真は各2MB以下のJPEG・PNG・WebPに対応しています。",code:"invalid_input"},400);
  }
  const form=new FormData();form.append("model",model());
  const append=(file,name)=>form.append("image[]",file,name+(file.type==="image/jpeg"?".jpg":file.type==="image/png"?".png":".webp"));
  append(image,"current-person");
  const roles=["Image 1: CURRENT PERSON. This is the only identity to preserve."];
  if(separated){
   let index=2;
   if(styleImage){append(styleImage,"style-shape-reference");roles.push(`Image ${index++}: STYLE reference ONLY. Use hair shape, length, silhouette, layers, weight, volume, ends, bangs, part and face-framing. Ignore its hair color and person.`);}
   if(colorImage){append(colorImage,"color-tone-reference");roles.push(`Image ${index++}: COLOR reference ONLY. Use hair color, hue, lightness, saturation and tone. Ignore its hairstyle and person.`);}
   roles.push(mode==="style_only"?"Change only hairstyle. Preserve the CURRENT PERSON's hair color. Ignore any color-change wording.":mode==="color_only"?"Change only hair color. Preserve the CURRENT PERSON's haircut, length, silhouette, bangs, part and face-framing. Ignore any hairstyle-change wording.":"Combine STYLE shape with COLOR tone on the CURRENT PERSON. Follow written shape overrides for bangs and face-framing. Never let STYLE hair color determine the final color or COLOR shape determine the hairstyle.");
  }else{append(referenceImage,"legacy-target-reference");roles.push("Image 2: legacy TARGET HAIRSTYLE REFERENCE. Use only its hair; never copy its face or identity. Follow the user's requested color; otherwise preserve current color.");}
  form.append("prompt",`${roles.join('\n')}
Keep the identity, face, facial features, age, skin, expression, pose, clothing and background of the FIRST image. Edit only their hair. Do not copy a reference person's face or identity. No skin smoothing.
Create one realistic salon consultation photograph. No text, grids, labels or collage.
This is a visual design concept, not a scientifically calculated chemical color result. Do not imply that a color recipe guarantees this appearance.
User request:\n${userRequest.trim()}`);
  form.append("quality", "medium");
  form.append("size", "1024x1536");
  form.append("output_format", "png");
  form.append("n", "1");

  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form, signal: AbortSignal.timeout(285000),
    });
    const data = await response.json();
    if (!response.ok) {
      // Do not log customer photos, prompts, credentials or full provider error bodies.
      console.error("Image generation failed", { status: response.status, requestId: response.headers.get("x-request-id") });
      if (response.status === 429) return json({ error: "生成が混み合っているか、APIの利用上限に達しました。時間をおいて再試行してください。", code: "provider_limit" }, 429);
      if ([401,403].includes(response.status)) return json({ error: "画像生成APIの利用権限を確認してください。サーバーのキー・モデル設定を管理者が確認する必要があります。", code: "provider_access" }, 502);
      return json({ error: "画像生成APIで生成を完了できませんでした。希望文や写真を確認して再試行してください。", code: "provider_error" }, 502);
    }
    const base64 = data?.data?.[0]?.b64_json;
    if (typeof base64 !== "string" || !base64 || base64.length > 24000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return json({ error: "生成画像を取得できませんでした。", code: "invalid_output" }, 502);
    return json({
      image: `data:image/png;base64,${base64}`,
      generation: { origin: "openai_images_edit", model: model(), promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(), requestId: response.headers.get("x-request-id") },
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") return json({ error: "生成の待ち時間を超えました。時間をおいて再試行してください。", code: "timeout" }, 504);
    return json({ error: "画像生成APIに接続できませんでした。時間をおいて再試行してください。", code: "connection_error" }, 502);
  }
}
