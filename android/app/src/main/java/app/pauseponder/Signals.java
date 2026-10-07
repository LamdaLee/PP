package app.pauseponder;

import android.content.Context;
import android.content.Intent;

final class Signals {
  static final String CHANGED = "app.pauseponder.DATA_CHANGED";

  static void changed(Context c) {
    c.sendBroadcast(new Intent(CHANGED).setPackage(c.getPackageName()));
  }
}
