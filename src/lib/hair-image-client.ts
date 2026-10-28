import { validateHairImage,hairImageProvenance, type HairImageInput, type HairImageGenerator, type GeneratedHairImage } from './hair-images.ts';

function photoFile(dataUrl: string, name: string): File {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('写真の形式を確認してください。');
  const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
  return new File([bytes], name, { type: match[1] });
}

export function createHairImageGenerator(fetcher: typeof fetch = fetch): HairImageGenerator {
  return {
    async status() {
      const response = await fetcher('/api/generate', { cache: 'no-store' });
      if (!response.ok) throw new Error('画像生成の接続状態を確認できません。');
      const data = await response.json();
      if (typeof data.configured !== 'boolean' || typeof data.model !== 'string') throw new Error('画像生成の接続状態を確認できません。');
      return { configured: data.configured, model: data.model };
    },
    async generate(input: HairImageInput, signal: AbortSignal) {
      const form = new FormData();
      form.append('image', photoFile(input.current.dataUrl, 'current.jpg'));
      if(input.roles){form.append('mode',input.roles.mode);if(input.styleReference)form.append('styleReferenceImage',photoFile(input.styleReference.dataUrl,'style-reference.jpg'));if(input.colorReference)form.append('colorReferenceImage',photoFile(input.colorReference.dataUrl,'color-reference.jpg'));}
      else form.append('referenceImage', photoFile(input.reference.dataUrl, 'reference.jpg'));
      form.append('request', input.requestText);
      const response = await fetcher('/api/generate', { method: 'POST', body: form, signal, cache: 'no-store' });
      let data;
      try { data = await response.json(); }
      catch { throw new Error('画像生成の応答を読み取れません。接続状態を確認してください。'); }
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '画像を生成できませんでした。');
      if (typeof data.image !== 'string' || !/^data:image\/png;base64,/.test(data.image) || data.image.length > 24000030 ||
          data.generation?.origin !== 'openai_images_edit') throw new Error('生成画像を取得できませんでした。');
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('生成した画像を表示できません。'));
        img.src = data.image;
      });
      const result: GeneratedHairImage = {
        ...data.generation, id: crypto.randomUUID(), dataUrl: data.image,
        ...hairImageProvenance(input),
        width: image.naturalWidth, height: image.naturalHeight,
      };
      validateHairImage(result);
      return result;
    },
  };
}
