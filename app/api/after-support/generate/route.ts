import {handleSupportGenerate} from '@/lib/after-support-api';
export const maxDuration=300;
const runtime=()=>({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_IMAGE_MODEL});
export function GET(request:Request){return handleSupportGenerate(request,runtime());}
export function POST(request:Request){return handleSupportGenerate(request,runtime());}

