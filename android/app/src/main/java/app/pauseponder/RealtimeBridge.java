package app.pauseponder;

import android.content.Context;
import java.util.concurrent.*;
import okhttp3.*;
import org.json.*;

/** Foreground realtime only. Android background refresh uses WorkManager. */
final class RealtimeBridge {
  final Context c;
  final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
  final OkHttpClient client = new OkHttpClient.Builder().build();
  volatile boolean active;
  WebSocket socket;
  long ref;

  RealtimeBridge(Context c) {
    this.c = c.getApplicationContext();
  }

  void start() {
    active = true;
    timer.execute(this::connect);
    timer.scheduleAtFixedRate(
        () -> {
          if (active && socket != null) {
            try {
              send("phoenix", "heartbeat", new JSONObject());
              String token = new Api(c).token(false);
              send("realtime:pp", "access_token", new JSONObject().put("access_token", token));
            } catch (Exception e) {
              socket.cancel();
            }
          }
        },
        25,
        25,
        TimeUnit.SECONDS);
  }

  void send(String topic, String event, JSONObject payload) throws Exception {
    if (socket != null)
      socket.send(
          new JSONObject()
              .put("topic", topic)
              .put("event", event)
              .put("payload", payload)
              .put("ref", String.valueOf(++ref))
              .toString());
  }

  void connect() {
    if (!active || Vault.get(c).uid().isEmpty()) return;
    try {
      JSONObject config = Vault.get(c).object("config");
      String token = new Api(c).token(false), uid = Vault.get(c).uid();
      String url =
          config.getString("supabaseUrl").replaceFirst("https://", "wss://")
              + "/realtime/v1/websocket?apikey="
              + java.net.URLEncoder.encode(config.getString("publishableKey"), "UTF-8")
              + "&vsn=1.0.0";
      socket =
          client.newWebSocket(
              new Request.Builder().url(url).build(),
              new WebSocketListener() {
                public void onOpen(WebSocket ws, Response response) {
                  if (!active) {
                    ws.close(1000, "closed");
                    return;
                  }
                  try {
                    JSONArray changes = new JSONArray();
                    for (String table : new String[] {"routines", "routine_logs"})
                      changes.put(
                          new JSONObject()
                              .put("event", "*")
                              .put("schema", "public")
                              .put("table", table)
                              .put("filter", "user_id=eq." + uid));
                    send(
                        "realtime:pp",
                        "phx_join",
                        new JSONObject()
                            .put("access_token", token)
                            .put("config", new JSONObject().put("postgres_changes", changes)));
                    SyncWorker.enqueue(c);
                  } catch (Exception e) {
                    ws.cancel();
                  }
                }

                public void onMessage(WebSocket ws, String text) {
                  try {
                    String event = new JSONObject(text).optString("event");
                    if (event.equals("postgres_changes")) SyncWorker.enqueue(c);
                    else if (event.equals("phx_error")) ws.cancel();
                  } catch (Exception ignored) {
                  }
                }

                public void onFailure(WebSocket ws, Throwable t, Response r) {
                  retry();
                }

                public void onClosed(WebSocket ws, int code, String reason) {
                  retry();
                }
              });
    } catch (Exception e) {
      retry();
    }
  }

  void retry() {
    if (active && !timer.isShutdown()) timer.schedule(this::connect, 10, TimeUnit.SECONDS);
  }

  void stop() {
    active = false;
    if (socket != null) socket.close(1000, "closed");
    timer.shutdownNow();
    client.dispatcher().executorService().shutdown();
  }
}
