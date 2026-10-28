import {assistConnection,handleProDesignAssist} from '@/lib/pro-design-assist';
export const maxDuration=60;
export async function GET(){return Response.json(assistConnection({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_TEXT_MODEL}),{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({code:'invalid_origin',error:'この画面から操作してください。'},{status:403});return handleProDesignAssist(request,{apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_TEXT_MODEL});}
