import {handleReviewFeedback} from '@/lib/after-review-feedback';
const handle=(request:Request)=>handleReviewFeedback(request,{apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_TEXT_MODEL});
export const GET=handle;
export const POST=handle;
