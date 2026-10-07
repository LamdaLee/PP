package app.pauseponder;

import android.content.Context;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class Api {
  final Vault vault;
  private static final Object AUTH_LOCK = new Object();

  Api(Context c) {
    vault = Vault.get(c);
  }

  static JSONObject request(String url, String method, JSONObject body, String key, String token)
      throws Exception {
    if (!url.startsWith("https://")) throw new Exception("HTTPS 주소를 사용해 주세요.");
    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
    c.setConnectTimeout(15000);
    c.setReadTimeout(65000);
    c.setRequestMethod(method);
    c.setRequestProperty("Content-Type", "application/json");
    c.setInstanceFollowRedirects(false);
    if (key != null) c.setRequestProperty("apikey", key);
    if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
    try {
      if (body != null) {
        c.setDoOutput(true);
        try (var out = c.getOutputStream()) {
          out.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
      }
      int code = c.getResponseCode();
      var in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
      String text = "";
      if (in != null)
        try (in) {
          java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
          byte[] buffer = new byte[4096];
          int n;
          while ((n = in.read(buffer)) != -1) bytes.write(buffer, 0, n);
          text = bytes.toString(StandardCharsets.UTF_8.name());
        }
      JSONObject result;
      try {
        result = new JSONObject(text);
      } catch (Exception e) {
        throw new Exception("서버 응답을 확인해 주세요. 최신 웹 코드를 배포했는지 확인하세요.");
      }
      if (code < 200 || code >= 300)
        throw new Exception(
            result.optString("error", result.optString("msg", "서버와 연결하지 못했습니다. (" + code + ")")));
      return result;
    } finally {
      c.disconnect();
    }
  }

  void login(String email, String password) throws Exception {
    JSONObject config =
        request(BuildConfig.API_BASE + "/api/client-config", "GET", null, null, null);
    JSONObject session =
        request(
            config.getString("supabaseUrl") + "/auth/v1/token?grant_type=password",
            "POST",
            new JSONObject().put("email", email).put("password", password),
            config.getString("publishableKey"),
            null);
    String existingUid = vault.uid();
    if (!existingUid.isEmpty()
        && !existingUid.equals(session.getJSONObject("user").getString("id")))
      throw new Exception("대기 입력을 유지하려면 기존 계정으로 로그인해 주세요.");
    session.put(
        "expires_at", System.currentTimeMillis() / 1000 + session.optLong("expires_in", 3600));
    vault.write("config", config.toString());
    vault.write("session", session.toString());
  }

  String token(boolean force) throws Exception {
    synchronized (AUTH_LOCK) {
      JSONObject s = vault.object("session");
      String uid = vault.uid();
      if (uid.isEmpty()) throw new Exception("로그인이 필요합니다.");
      if (!force && s.optLong("expires_at") > System.currentTimeMillis() / 1000 + 60)
        return s.getString("access_token");
      JSONObject config = vault.object("config");
      JSONObject next =
          request(
              config.getString("supabaseUrl") + "/auth/v1/token?grant_type=refresh_token",
              "POST",
              new JSONObject().put("refresh_token", s.getString("refresh_token")),
              config.getString("publishableKey"),
              null);
      next.put("expires_at", System.currentTimeMillis() / 1000 + next.optLong("expires_in", 3600));
      if (!uid.equals(vault.uid())) throw new Exception("계정이 변경되었습니다.");
      vault.writeForUser(uid, "session", next.toString());
      return next.getString("access_token");
    }
  }

  JSONObject call(String endpoint, JSONObject body) throws Exception {
    return request(
        BuildConfig.API_BASE + endpoint, body == null ? "GET" : "POST", body, null, token(false));
  }
}
