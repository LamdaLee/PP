package app.pauseponder;

import android.appwidget.*;
import android.content.Context;

public final class RoutineWidget extends AppWidgetProvider {
  public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
    for (int id : ids) Widgets.update(c, m, id, false);
    SyncWorker.enqueue(c);
  }
}
