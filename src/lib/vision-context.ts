export const VISION_CONTEXT_ERROR='このブラウザではWebGL 2を利用できないため、端末内の髪・顔解析を実行できません。写真やAPIキーのエラーではありません。WebGL 2対応のSafari・Chromeで確認してください。未解析の線やスコアは補完しません。';
/** CPU inference still uses MediaPipe's GPU-buffer image transport. */
export function requireVisionContext(canvas:{getContext:(kind:'webgl2')=>unknown}){
 const context=canvas.getContext('webgl2');if(!context)throw new Error(VISION_CONTEXT_ERROR);
 return context;
}
