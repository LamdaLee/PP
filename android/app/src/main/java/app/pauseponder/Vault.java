package app.pauseponder;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** All session tokens, cached routine data and unsent notes stay encrypted on device. */
final class Vault {
  private static final String ALIAS = "pause-ponder-v1";
  private static Vault instance;
  private final SharedPreferences prefs;

  static synchronized Vault get(Context c) {
    if (instance == null) instance = new Vault(c.getApplicationContext());
    return instance;
  }

  private Vault(Context c) {
    prefs = c.getSharedPreferences("vault", Context.MODE_PRIVATE);
  }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator gen =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      gen.init(
          new KeyGenParameterSpec.Builder(
                  ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      gen.generateKey();
    }
    return (SecretKey) store.getKey(ALIAS, null);
  }

  synchronized String read(String name, String fallback) {
    try {
      String s = prefs.getString(name, null);
      if (s == null) return fallback;
      String[] bits = s.split("\\.");
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(
          Cipher.DECRYPT_MODE,
          key(),
          new GCMParameterSpec(128, Base64.decode(bits[0], Base64.NO_WRAP)));
      return new String(c.doFinal(Base64.decode(bits[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    } catch (Exception e) {
      return fallback;
    }
  }

  synchronized void write(String name, String value) {
    try {
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.ENCRYPT_MODE, key());
      String encoded =
          Base64.encodeToString(c.getIV(), Base64.NO_WRAP)
              + "."
              + Base64.encodeToString(
                  c.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
      if (!prefs.edit().putString(name, encoded).commit())
        throw new IllegalStateException("기기에 저장하지 못했습니다.");
    } catch (Exception e) {
      throw new IllegalStateException("기기의 안전한 저장소를 확인해 주세요.", e);
    }
  }

  synchronized JSONObject object(String name) {
    try {
      return new JSONObject(read(name, "{}"));
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  synchronized JSONArray array(String name) {
    try {
      return new JSONArray(read(name, "[]"));
    } catch (Exception e) {
      return new JSONArray();
    }
  }

  synchronized String uid() {
    return object("session").optJSONObject("user") == null
        ? ""
        : object("session").optJSONObject("user").optString("id");
  }

  synchronized void writeForUser(String uid, String name, String value) {
    if (!uid.isEmpty() && uid.equals(uid())) write(name, value);
  }

  synchronized void enqueue(JSONObject body, String endpoint) {
    try {
      if (uid().isEmpty()) throw new IllegalStateException("먼저 로그인해 주세요.");
      JSONArray q = array("outbox");
      JSONObject item =
          new JSONObject()
              .put("id", java.util.UUID.randomUUID().toString())
              .put("uid", uid())
              .put("endpoint", endpoint)
              .put("body", body)
              .put("error", "");
      q.put(item);
      write("outbox", q.toString());
    } catch (org.json.JSONException e) {
      throw new IllegalStateException(e);
    }
  }

  synchronized void finish(String id) {
    JSONArray q = array("outbox"), next = new JSONArray();
    for (int i = 0; i < q.length(); i++) {
      JSONObject o = q.optJSONObject(i);
      if (o != null && !o.optString("id").equals(id)) next.put(o);
    }
    write("outbox", next.toString());
  }

  synchronized void failure(String id, String error) {
    JSONArray q = array("outbox");
    for (int i = 0; i < q.length(); i++) {
      JSONObject o = q.optJSONObject(i);
      if (o != null && o.optString("id").equals(id))
        try {
          o.put("error", error);
        } catch (Exception ignored) {
        }
    }
    write("outbox", q.toString());
  }

  synchronized void clear() {
    prefs.edit().clear().commit();
  }
}
