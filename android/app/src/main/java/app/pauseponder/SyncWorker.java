package app.pauseponder;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;
import org.json.*;

public final class SyncWorker extends Worker {
  private static final Object SYNC_LOCK = new Object();

  public SyncWorker(Context context, WorkerParameters params) {
    super(context, params);
  }

  static void enqueue(Context c) {
    Constraints constraints =
        new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    OneTimeWorkRequest work =
        new OneTimeWorkRequest.Builder(SyncWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag("pp")
            .build();
    WorkManager.getInstance(c)
        .enqueueUniqueWork("pp-now", ExistingWorkPolicy.APPEND_OR_REPLACE, work);
  }

  static void periodic(Context c) {
    PeriodicWorkRequest work =
        new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(
                new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .addTag("pp")
            .build();
    WorkManager.getInstance(c)
        .enqueueUniquePeriodicWork("pp-periodic", ExistingPeriodicWorkPolicy.KEEP, work);
  }

  @Override
  public Result doWork() {
    synchronized (SYNC_LOCK) {
      return sync();
    }
  }

  private Result sync() {
    Context c = getApplicationContext();
    Vault v = Vault.get(c);
    String uid = v.uid();
    if (uid.isEmpty()) return Result.success();
    boolean pending = false, retry = false;
    try {
      Api api = new Api(c);
      JSONArray q = v.array("outbox");
      for (int i = 0; i < q.length(); i++) {
        if (isStopped() || !uid.equals(v.uid())) return Result.success();
        JSONObject item = q.optJSONObject(i);
        if (item == null || !uid.equals(item.optString("uid"))) continue;
        // A rejected/conflicting action stays visible for user review; never silently overwrite
        // another device.
        if (!item.optString("error").isEmpty()) {
          pending = true;
          continue;
        }
        try {
          JSONObject response = api.call(item.getString("endpoint"), item.getJSONObject("body"));
          if (!uid.equals(v.uid())) return Result.success();
          if (item.optString("endpoint").equals("/api/data")) {
            String message = summary(response);
            v.writeForUser(uid, "memoStatus", message);
          }
          v.finish(item.getString("id"));
        } catch (Exception e) {
          pending = true;
          String error = e.getMessage() == null ? "연결 후 다시 시도해 주세요." : e.getMessage();
          if (error.contains("다른 기기")
              || error.contains("날짜")
              || error.contains("요청 ID")
              || error.contains("루틴이 없습니다")
              || error.contains("시간을 확인")
              || error.contains("오늘 알림")
              || error.contains("상태를 확인")) v.failure(item.getString("id"), error);
          else {
            retry = true;
            v.writeForUser(uid, "syncStatus", "연결 대기 · 자동 재시도합니다.");
          }
        }
      }
      JSONObject routines = api.call("/api/routines", null);
      v.writeForUser(uid, "routines", routines.toString());
      v.writeForUser(uid, "syncStatus", pending ? "대기 항목을 확인해 주세요." : "동기화 완료");
      AlarmScheduler.reschedule(c);
      Widgets.updateAll(c);
      Signals.changed(c);
      return retry ? Result.retry() : Result.success();
    } catch (Exception e) {
      v.writeForUser(uid, "syncStatus", "연결을 확인해 주세요. 저장된 입력은 보관됩니다.");
      Widgets.updateAll(c);
      Signals.changed(c);
      return Result.retry();
    }
  }

  static String summary(JSONObject result) {
    JSONArray fragments = result.optJSONArray("fragments");
    java.util.Set<String> groups = new java.util.LinkedHashSet<>();
    boolean pending = false, posted = false;
    if (fragments != null)
      for (int i = 0; i < fragments.length(); i++) {
        JSONObject f = fragments.optJSONObject(i);
        if (f == null) continue;
        pending |= f.optString("status").equals("pending");
        posted |= f.optString("status").equals("posted");
        JSONArray a = f.optJSONArray("categories");
        if (a != null)
          for (int j = 0; j < a.length(); j++)
            groups.add(
                switch (a.optString(j)) {
                  case "money" -> "돈";
                  case "emotion" -> "감정";
                  case "work" -> "일";
                  case "breathe" -> "숨고르기";
                  default -> "생각";
                });
      }
    return (result.optString("aiMode").equals("applied") ? "AI 정리 완료" : "저장 완료")
        + " · "
        + String.join(" · ", groups)
        + (pending ? " · 금액 확인 대기" : posted ? " · 가계부 반영" : "");
  }
}
