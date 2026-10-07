package app.pauseponder;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.widget.RemoteViews;
import java.time.*;
import org.json.*;

final class Widgets {
  static void updateAll(Context c) {
    AppWidgetManager m = AppWidgetManager.getInstance(c);
    for (Class<?> type : new Class<?>[] {MemoWidget.class, RoutineWidget.class})
      for (int id : m.getAppWidgetIds(new ComponentName(c, type)))
        update(c, m, id, type == MemoWidget.class);
  }

  static void update(Context c, AppWidgetManager m, int widgetId, boolean memo) {
    Vault v = Vault.get(c);
    RemoteViews view =
        new RemoteViews(c.getPackageName(), memo ? R.layout.memo_widget : R.layout.routine_widget);
    Intent open =
        new Intent(c, memo && !v.uid().isEmpty() ? CaptureActivity.class : MainActivity.class);
    open.setData(Uri.parse("pp://widget/" + widgetId));
    PendingIntent pi =
        PendingIntent.getActivity(
            c, widgetId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    view.setOnClickPendingIntent(R.id.open, pi);
    view.setOnClickPendingIntent(R.id.root, pi);
    if (memo) {
      view.setTextViewText(
          R.id.detail,
          v.uid().isEmpty()
              ? "앱에서 로그인해 주세요"
              : v.array("outbox").length() > 0
                  ? "저장 · 전송 대기 " + v.array("outbox").length() + "개"
                  : v.read("memoStatus", "떠오른 것을 적어두세요"));
    } else {
      String date = RoutineTime.today(Instant.now()).toString();
      JSONObject data = NativeRoutines.data(c), next = null;
      int done = 0;
      java.util.List<JSONObject> today = NativeRoutines.today(c);
      for (JSONObject r : today) {
        String status = NativeRoutines.log(data, r.optString("id"), date).optString("status");
        if (status.equals("completed")) done++;
        else if (!status.equals("skipped") && next == null) next = r;
      }
      view.setTextViewText(
          R.id.detail,
          v.uid().isEmpty()
              ? "앱에서 로그인해 주세요"
              : next == null
                  ? "오늘 완료 " + done + " / " + today.size()
                  : next.optString("local_time").substring(0, 5) + " · " + next.optString("title"));
      view.setViewVisibility(
          R.id.done, next == null ? android.view.View.GONE : android.view.View.VISIBLE);
      if (next != null) {
        JSONObject log = NativeRoutines.log(data, next.optString("id"), date);
        view.setOnClickPendingIntent(
            R.id.done,
            NotificationCenter.action(
                c, next.optString("id"), date, "completed", log.optString("updated_at", "absent")));
      }
    }
    m.updateAppWidget(widgetId, view);
  }
}
