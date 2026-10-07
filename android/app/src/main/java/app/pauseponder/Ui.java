package app.pauseponder;

import android.content.*;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;

final class Ui {
  static final int SAGE = Color.rgb(90, 120, 99);

  static int dp(Context c, int n) {
    return (int) (n * c.getResources().getDisplayMetrics().density);
  }

  static LinearLayout column(Context c) {
    LinearLayout l = new LinearLayout(c);
    l.setOrientation(1);
    l.setPadding(dp(c, 24), dp(c, 24), dp(c, 24), dp(c, 24));
    l.setBackgroundColor(Color.rgb(249, 248, 245));
    return l;
  }

  static TextView text(Context c, String s, int size) {
    TextView t = new TextView(c);
    t.setText(s);
    t.setTextSize(size);
    t.setTextColor(SAGE);
    t.setPadding(0, dp(c, 8), 0, dp(c, 8));
    return t;
  }

  static Button button(Context c, String s, Runnable action) {
    Button b = new Button(c);
    b.setText(s);
    b.setAllCaps(false);
    b.setTextColor(SAGE);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(Color.rgb(243, 234, 213));
    bg.setCornerRadius(dp(c, 24));
    b.setBackground(bg);
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(c, 52));
    p.setMargins(0, dp(c, 8), 0, dp(c, 8));
    b.setLayoutParams(p);
    b.setOnClickListener(v -> action.run());
    return b;
  }

  static void web(Context c) {
    c.startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(BuildConfig.API_BASE)));
  }
}
