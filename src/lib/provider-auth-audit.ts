/** Server-only, value-free diagnostics. Never return provider bodies or credentials. */
export async function auditProviderAuthentication(key:string|undefined,fetcher:typeof fetch=fetch,verify=true){
 const format={configured:Boolean(key),outerWhitespace:Boolean(key&&key!==key.trim()),lineBreak:Boolean(key&&/[\r\n]/.test(key)),quoted:Boolean(key&&/^["']|["']$/.test(key.trim())),bearerPrefix:Boolean(key&&/^Bearer\s/i.test(key.trim())),literalEscape:Boolean(key&&/\\[rn]/.test(key)),expectedKeyPrefix:Boolean(key&&key.startsWith('sk-')),containsRedactionMarkers:Boolean(key&&/[*•●…]|\.{2,}/.test(key)),assignmentSyntax:Boolean(key&&/^(?:export\s+)?OPENAI_API_KEY\s*=/.test(key)),maskedPlaceholder:Boolean(key&&(/^[*•●]+$/.test(key)||/^sk-[*•●.]+$/.test(key))),jsonContainer:Boolean(key&&/^[{[]/.test(key))};
 if(!key)return {format,attempted:false,status:null,authenticated:false,code:'not_configured'};
 if(!verify)return {format,attempted:false,status:null,authenticated:false,code:'format_only'};
 // Do not silently rewrite credentials. A restricted key may legitimately lack models.read.
 try{const response=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>null),code=['invalid_api_key','insufficient_permissions','unsupported_country_region_territory'].includes(body?.error?.code)?body.error.code:null;
 return {format,attempted:true,status:response.status,authenticated:response.ok,code};
 }catch{return {format,attempted:true,status:null,authenticated:false,code:'transport_error'};}
}
