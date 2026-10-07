import { createClient } from "@supabase/supabase-js";
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function authenticatedClient(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiError("서버 환경변수가 설정되지 않았습니다.", 503);
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new ApiError("로그인이 필요합니다.", 401);
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError("로그인을 다시 확인해 주세요.", 401);
  return db;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};
export const jsonResponse = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: corsHeaders });
export const optionsResponse = () => new Response(null, { status: 204, headers: corsHeaders });
export function errorResponse(e: unknown) {
  const status = e instanceof ApiError ? e.status : 400;
  const message = e instanceof Error ? e.message : "요청을 처리하지 못했습니다.";
  const safe =
    e instanceof ApiError || /[가-힣]/.test(message)
      ? message
      : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return jsonResponse({ error: safe }, status);
}
