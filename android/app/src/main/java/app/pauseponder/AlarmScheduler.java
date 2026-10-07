package app.pauseponder;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import java.time.*;
import org.json.*;

final class AlarmScheduler {
  static PendingIntent intent(Context c, String id, String date, long at) {
    Intent i =
        new Intent(c, AlarmReceiver.class)
            .setData(Uri.parse("pauseponder://alarm/" + id + "/" + date))
            .putExtra("id", id)
            .putExtra("date", date)
            .putExtra("at", at);
    return PendingIntent.getBroadcast(
        c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  static void cancelAll(Context c) {
    Vault v = Vault.get(c);
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    JSONArray old = v.array("alarms");
    for (int i = 0; i < old.length(); i++) {
      JSONObject a = old.optJSONObject(i);
      if (a != null) {
        PendingIntent pi = intent(c, a.optString("id"), a.optString("date"), a.optLong("at"));
        am.cancel(pi);
        pi.cancel();
      }
    }
    v.write("alarms", "[]");
  }

  static synchronized void reschedule(Context c) {
    cancelAll(c);
    Vault v = Vault.get(c);
    if (v.uid().isEmpty()) return;
    if (!((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE))
        .areNotificationsEnabled()) return;
    if (Build.VERSION.SDK_INT >= 33
        && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    JSONObject d = NativeRoutines.data(c);
    JSONArray routines = d.optJSONArray("routines");
    JSONArray scheduled = new JSONArray();
    if (routines == null) return;
    Instant now = Instant.now();
    LocalDate today = RoutineTime.today(now);
    for (int i = 0; i < routines.length(); i++) {
      JSONObject r = routines.optJSONObject(i);
      if (r == null) continue;
      for (int day = 0; day < 8; day++) {
        LocalDate date = today.plusDays(day);
        if (!r.optBoolean("reminder_enabled") || !NativeRoutines.occurs(r, date)) {
          NotificationCenter.cancel(c, r.optString("id"), date.toString());
          continue;
        }
        JSONObject log = NativeRoutines.log(d, r.optString("id"), date.toString());
        if (log.optString("status").equals("completed")
            || log.optString("status").equals("skipped")) {
          NotificationCenter.cancel(c, r.optString("id"), date.toString());
          continue;
        }
        try {
          Instant at =
              log.optString("status").equals("snoozed")
                  ? Instant.parse(log.getString("snoozed_until"))
                  : RoutineTime.at(date, r.getString("local_time"));
          String fired = "fired:" + r.getString("id") + ":" + date + ":" + at.toEpochMilli();
          if (v.read(fired, "").equals("1")) continue;
          if (at.isBefore(now.minusSeconds(900))) continue;
          long millis = Math.max(at.toEpochMilli(), System.currentTimeMillis() + 1000);
          PendingIntent pi = intent(c, r.getString("id"), date.toString(), at.toEpochMilli());
          if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi);
          else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi);
          scheduled.put(
              new JSONObject()
                  .put("id", r.getString("id"))
                  .put("date", date.toString())
                  .put("at", at.toEpochMilli()));
        } catch (Exception ignored) {
        }
      }
    }
    v.write("alarms", scheduled.toString());
  }
}
