package app.pauseponder;

import android.content.*;
import org.json.*;

public final class AlarmReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context c, Intent intent) {
    String id = intent.getStringExtra("id"), date = intent.getStringExtra("date");
    if (id == null || date == null || Vault.get(c).uid().isEmpty()) return;
    JSONObject d = NativeRoutines.data(c);
    JSONObject log = NativeRoutines.log(d, id, date);
    if (log.optString("status").equals("completed") || log.optString("status").equals("skipped"))
      return;
    JSONArray routines = d.optJSONArray("routines");
    if (routines != null)
      for (int i = 0; i < routines.length(); i++) {
        JSONObject r = routines.optJSONObject(i);
        if (r != null
            && r.optString("id").equals(id)
            && r.optBoolean("active")
            && r.optBoolean("reminder_enabled")) {
          if (NotificationCenter.show(c, r, date, log))
            Vault.get(c)
                .write("fired:" + id + ":" + date + ":" + intent.getLongExtra("at", 0), "1");
          break;
        }
      }
    AlarmScheduler.reschedule(c);
    Widgets.updateAll(c);
    SyncWorker.enqueue(c);
  }
}
