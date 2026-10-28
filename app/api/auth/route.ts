export const dynamic='force-dynamic';
/** Same identity-only probe as the hosted Worker; no secret or personal data. */
export async function GET(request:Request){return Response.json({authenticated:Boolean(request.headers.get('oai-authenticated-user-id'))},{headers:{'Cache-Control':'no-store'}});}
