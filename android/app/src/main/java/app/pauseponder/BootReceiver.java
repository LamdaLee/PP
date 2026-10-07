package app.pauseponder;

import android.content.*;

public final class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context c, Intent i) {
    AlarmScheduler.reschedule(c);
    Widgets.updateAll(c);
    SyncWorker.periodic(c);
    SyncWorker.enqueue(c);
  }
}
