import { createClient } from "@supabase/supabase-js";
export async function authenticatedClient(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Error("서버 환경변수가 설정되지 않았습니다.");
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw Error("로그인이 필요합니다.");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw Error("로그인을 다시 확인해 주세요.");
  return db;
}
export const jsonResponse = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
