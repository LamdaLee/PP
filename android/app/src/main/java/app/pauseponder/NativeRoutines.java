package app.pauseponder;

import android.content.Context;
import java.time.*;
import java.util.*;
import org.json.*;

final class NativeRoutines {
  static JSONObject data(Context c) {
    Vault v = Vault.get(c);
    JSONObject source = v.object("routines");
    try {
      JSONObject copy = new JSONObject(source.toString());
      JSONArray logs = copy.optJSONArray("logs");
      if (logs == null) logs = new JSONArray();
      JSONArray q = v.array("outbox");
      for (int i = 0; i < q.length(); i++) {
        JSONObject item = q.optJSONObject(i);
        if (item != null && !item.optString("error").isEmpty()) continue;
        if (item == null
            || !item.optString("uid").equals(v.uid())
            || !item.optString("endpoint").equals("/api/routines")) continue;
        JSONObject b = item.optJSONObject("body");
        if (b == null || !b.optString("action").equals("status")) continue;
        JSONArray next = new JSONArray();
        for (int j = 0; j < logs.length(); j++) {
          JSONObject l = logs.optJSONObject(j);
          if (l != null
              && !(l.optString("routine_id").equals(b.optString("id"))
                  && l.optString("due_on").equals(b.optString("date")))) next.put(l);
        }
        JSONObject optimistic =
            new JSONObject()
                .put("routine_id", b.optString("id"))
                .put("due_on", b.optString("date"))
                .put("status", b.optString("status"))
                .put("updated_at", b.optString("expected"))
                .put("completed_at", b.opt("completedAt"));
        if (b.optString("status").equals("snoozed"))
          optimistic.put("snoozed_until", b.optString("localSnooze"));
        next.put(optimistic);
        logs = next;
      }
      copy.put("logs", logs);
      return copy;
    } catch (Exception e) {
      return source;
    }
  }

  static JSONObject log(JSONObject data, String id, String date) {
    JSONArray logs = data.optJSONArray("logs");
    if (logs != null)
      for (int i = 0; i < logs.length(); i++) {
        JSONObject l = logs.optJSONObject(i);
        if (l != null && l.optString("routine_id").equals(id) && l.optString("due_on").equals(date))
          return l;
      }
    return new JSONObject();
  }

  static boolean occurs(JSONObject r, LocalDate date) {
    try {
      Set<Integer> days = new HashSet<>();
      JSONArray a = r.getJSONArray("weekdays");
      for (int i = 0; i < a.length(); i++) days.add(a.getInt(i));
      String end = r.optString("end_date", "");
      return r.optBoolean("active")
          && RoutineTime.occurs(
              date,
              LocalDate.parse(r.getString("start_date")),
              end.isEmpty() || end.equals("null") ? null : LocalDate.parse(end),
              days);
    } catch (Exception e) {
      return false;
    }
  }

  static List<JSONObject> today(Context c) {
    JSONObject d = data(c);
    JSONArray list = d.optJSONArray("routines");
    List<JSONObject> result = new ArrayList<>();
    LocalDate date = RoutineTime.today(Instant.now());
    if (list != null)
      for (int i = 0; i < list.length(); i++) {
        JSONObject r = list.optJSONObject(i);
        if (r != null && occurs(r, date)) result.add(r);
      }
    result.sort(Comparator.comparing(r -> r.optString("local_time")));
    return result;
  }

  static String status(JSONObject l) {
    return switch (l.optString("status", "pending")) {
      case "completed" -> "완료";
      case "skipped" -> "건너뜀";
      case "snoozed" -> "미룸";
      default -> "미확인";
    };
  }

  static void mark(Context c, String id, String date, String status) throws Exception {
    mark(c, id, date, status, null);
  }

  static void mark(Context c, String id, String date, String status, String suppliedExpected)
      throws Exception {
    JSONArray queue = Vault.get(c).array("outbox");
    for (int i = 0; i < queue.length(); i++) {
      JSONObject item = queue.optJSONObject(i);
      JSONObject b = item == null ? null : item.optJSONObject("body");
      if (b != null && b.optString("id").equals(id) && b.optString("date").equals(date))
        throw new Exception("이 루틴의 이전 기록을 전송 중이에요. 동기화 후 다시 선택해 주세요.");
    }
    JSONObject data = data(c), log = log(data, id, date);
    String expected = log.optString("updated_at", "absent");
    if (expected.isEmpty() || expected.equals("null")) expected = "absent";
    if (suppliedExpected != null) expected = suppliedExpected;
    JSONObject body =
        new JSONObject()
            .put("action", "status")
            .put("id", id)
            .put("date", date)
            .put("status", status)
            .put("requestId", UUID.randomUUID().toString())
            .put("expected", expected)
            .put(
                "completedAt",
                status.equals("completed") ? Instant.now().toString() : JSONObject.NULL);
    if (status.equals("snoozed"))
      body.put("localSnooze", Instant.now().plusSeconds(600).toString());
    Vault.get(c).enqueue(body, "/api/routines");
    AlarmScheduler.reschedule(c);
    Widgets.updateAll(c);
    SyncWorker.enqueue(c);
    Signals.changed(c);
  }
}
