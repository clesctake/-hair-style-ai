import {handleSupportPlan} from '@/lib/after-support-plan';
export const maxDuration=60;
const runtime=()=>({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_TEXT_MODEL});
export function GET(request:Request){return handleSupportPlan(request,runtime());}
export function POST(request:Request){return handleSupportPlan(request,runtime());}

