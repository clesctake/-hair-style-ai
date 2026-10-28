/** Sites dispatch owns authentication; never manufacture a visitor identity. */
export function siteSignInPath(returnTo:string){
 let path='/';try{const url=new URL(returnTo,'https://app.local');if(returnTo.startsWith('/')&&!returnTo.startsWith('//')&&url.origin==='https://app.local'&&!['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))path=url.pathname+url.search+url.hash;}catch{/* Keep same-origin home fallback. */}
 return '/signin-with-chatgpt?return_to='+encodeURIComponent(path);
}
export async function requireSiteUser(){
 const response=await fetch('/api/auth',{cache:'no-store'}),value=await response.json() as {authenticated?:boolean};
 if(!response.ok)throw new Error('ログイン状態を確認できません。もう一度お試しください。');
 if(!value.authenticated)throw new SiteSignInRequired();
}
export class SiteSignInRequired extends Error{constructor(){super('AI解析・画像生成にはChatGPTでのログインが必要です。写真の手動登録は引き続き利用できます。');this.name='SiteSignInRequired';}}
