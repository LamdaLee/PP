import { jsonResponse, optionsResponse } from "@/lib/server";
export function OPTIONS() {
  return optionsResponse();
}
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return jsonResponse(
      { error: "Supabase 환경변수를 먼저 등록해 주세요." },
      503,
    );
  let publicKey = key.startsWith("sb_publishable_");
  try {
    publicKey ||=
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role === "anon";
  } catch {}
  if (!publicKey)
    return jsonResponse(
      { error: "공개 가능한 Supabase publishable key를 설정해 주세요." },
      503,
    );
  return jsonResponse({ supabaseUrl: url, publishableKey: key });
}
