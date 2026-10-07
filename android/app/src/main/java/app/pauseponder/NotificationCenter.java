package app.pauseponder;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.*;

final class NotificationCenter {
  static final String CHANNEL = "routines";

  static int key(String id, String date) {
    return (id + date).hashCode();
  }

  static void cancel(Context c, String id, String date) {
    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(key(id, date));
  }

  static PendingIntent action(Context c, String id, String date, String status, String expected) {
    Intent i =
        new Intent(c, ActionReceiver.class)
            .setAction(status)
            .setData(Uri.parse("pauseponder://action/" + id + "/" + date + "/" + status))
            .putExtra("id", id)
            .putExtra("date", date)
            .putExtra("expected", expected);
    return PendingIntent.getBroadcast(
        c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  static boolean show(Context c, JSONObject routine, String date, JSONObject log) {
    if (Build.VERSION.SDK_INT >= 33
        && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return false;
    NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    nm.createNotificationChannel(
        new NotificationChannel(CHANNEL, "루틴 알림", NotificationManager.IMPORTANCE_DEFAULT));
    String id = routine.optString("id"), expected = log.optString("updated_at", "absent");
    Intent open = new Intent(c, MainActivity.class);
    Notification publicVersion =
        new Notification.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Pause&Ponder")
            .setContentText("루틴 시간이에요.")
            .build();
    Notification n =
        new Notification.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("루틴 시간이에요")
            .setContentText(routine.optString("title"))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setAutoCancel(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .addAction(
                new Notification.Action.Builder(
                        null, "완료", action(c, id, date, "completed", expected))
                    .build())
            .addAction(
                new Notification.Action.Builder(
                        null, "10분 뒤", action(c, id, date, "snoozed", expected))
                    .build())
            .addAction(
                new Notification.Action.Builder(
                        null, "건너뛰기", action(c, id, date, "skipped", expected))
                    .build())
            .build();
    if (!nm.areNotificationsEnabled()) return false;
    nm.notify(key(id, date), n);
    return true;
  }
}
