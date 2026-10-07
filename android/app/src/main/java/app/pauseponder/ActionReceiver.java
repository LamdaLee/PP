package app.pauseponder;

import android.content.*;

public final class ActionReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context c, Intent i) {
    String id = i.getStringExtra("id"), date = i.getStringExtra("date"), status = i.getAction();
    if (id == null || date == null || status == null) return;
    try {
      NativeRoutines.mark(c, id, date, status, i.getStringExtra("expected"));
      NotificationCenter.cancel(c, id, date);
    } catch (Exception e) {
      Vault.get(c).write("syncStatus", "기록을 확인해 주세요.");
      Signals.changed(c);
    }
  }
}
