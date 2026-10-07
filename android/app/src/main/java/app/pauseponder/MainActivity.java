package app.pauseponder;

import android.app.*;
import android.content.*;
import android.os.*;
import android.widget.*;
import androidx.work.WorkManager;
import java.time.*;
import org.json.*;

public final class MainActivity extends Activity {
  private RealtimeBridge realtime;
  private final BroadcastReceiver updates =
      new BroadcastReceiver() {
        public void onReceive(Context c, Intent i) {
          render();
        }
      };

  public void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().setStatusBarColor(Ui.SAGE);
    render();
  }

  protected void onStart() {
    super.onStart();
    IntentFilter f = new IntentFilter(Signals.CHANGED);
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(updates, f, Context.RECEIVER_NOT_EXPORTED);
    else registerReceiver(updates, f);
    if (!Vault.get(this).uid().isEmpty()) {
      SyncWorker.periodic(this);
      SyncWorker.enqueue(this);
      realtime = new RealtimeBridge(this);
      realtime.start();
    }
  }

  protected void onStop() {
    super.onStop();
    unregisterReceiver(updates);
    if (realtime != null) realtime.stop();
  }

  private void render() {
    LinearLayout l = Ui.column(this);
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.addView(l);
    setContentView(scroll);
    l.addView(Ui.text(this, "Pause&Ponder", 30));
    l.addView(Ui.text(this, "잠시 멈추고, 한 가지씩", 16));
    Vault v = Vault.get(this);
    if (v.uid().isEmpty()) {
      l.addView(Ui.text(this, "웹에서 사용하던 계정으로 로그인하세요.", 16));
      EditText email = new EditText(this);
      email.setHint("이메일");
      email.setInputType(33);
      l.addView(email);
      EditText password = new EditText(this);
      password.setHint("비밀번호");
      password.setInputType(129);
      l.addView(password);
      TextView message = Ui.text(this, "", 14);
      l.addView(message);
      Button login = Ui.button(this, "로그인", () -> {});
      login.setOnClickListener(
          view -> {
            login.setEnabled(false);
            message.setText("연결 중…");
            String e = email.getText().toString().trim(), p = password.getText().toString();
            new Thread(
                    () -> {
                      try {
                        new Api(this).login(e, p);
                        runOnUiThread(
                            () -> {
                              password.setText("");
                              SyncWorker.periodic(this);
                              SyncWorker.enqueue(this);
                              realtime = new RealtimeBridge(this);
                              realtime.start();
                              render();
                            });
                      } catch (Exception x) {
                        runOnUiThread(
                            () -> {
                              message.setText(x.getMessage());
                              login.setEnabled(true);
                            });
                      }
                    })
                .start();
          });
      l.addView(login);
      l.addView(Ui.button(this, "웹에서 회원가입 · 비밀번호 확인", () -> Ui.web(this)));
      return;
    }
    l.addView(
        Ui.button(this, "생각함에 적기", () -> startActivity(new Intent(this, CaptureActivity.class))));
    l.addView(Ui.text(this, v.read("syncStatus", "동기화를 기다리고 있어요."), 14));
    l.addView(Ui.text(this, "오늘의 루틴", 23));
    JSONObject data = NativeRoutines.data(this);
    String date = RoutineTime.today(Instant.now()).toString();
    java.util.List<JSONObject> today = NativeRoutines.today(this);
    if (today.isEmpty()) l.addView(Ui.text(this, "오늘은 등록된 루틴이 없어요.", 16));
    for (JSONObject r : today) {
      JSONObject log = NativeRoutines.log(data, r.optString("id"), date);
      l.addView(
          Ui.text(
              this,
              r.optString("local_time").substring(0, 5)
                  + "  "
                  + r.optString("title")
                  + " · "
                  + NativeRoutines.status(log),
              18));
      if (!log.optString("status").equals("completed")) {
        l.addView(Ui.button(this, "완료", () -> mark(r, date, "completed")));
        l.addView(Ui.button(this, "10분 뒤 · 알림 미루기", () -> mark(r, date, "snoozed")));
        l.addView(Ui.button(this, "오늘 건너뛰기", () -> mark(r, date, "skipped")));
      }
    }
    l.addView(Ui.button(this, "루틴 등록 · 기록 · 가계부 열기", () -> Ui.web(this)));
    l.addView(Ui.button(this, "지금 동기화", () -> SyncWorker.enqueue(this)));
    l.addView(
        Ui.button(
            this,
            "로그인 다시 확인",
            () -> {
              LinearLayout fields = Ui.column(this);
              EditText email = new EditText(this);
              email.setHint("이메일");
              JSONObject user = Vault.get(this).object("session").optJSONObject("user");
              email.setText(user == null ? "" : user.optString("email"));
              fields.addView(email);
              EditText password = new EditText(this);
              password.setHint("비밀번호");
              password.setInputType(129);
              fields.addView(password);
              new AlertDialog.Builder(this)
                  .setTitle("같은 계정으로 다시 로그인")
                  .setView(fields)
                  .setPositiveButton(
                      "로그인",
                      (a, b) -> {
                        String e = email.getText().toString().trim(),
                            p = password.getText().toString();
                        new Thread(
                                () -> {
                                  try {
                                    new Api(this).login(e, p);
                                    runOnUiThread(
                                        () -> {
                                          SyncWorker.enqueue(this);
                                          Toast.makeText(this, "로그인을 갱신했어요.", Toast.LENGTH_LONG)
                                              .show();
                                        });
                                  } catch (Exception x) {
                                    runOnUiThread(
                                        () ->
                                            Toast.makeText(this, x.getMessage(), Toast.LENGTH_LONG)
                                                .show());
                                  }
                                })
                            .start();
                      })
                  .setNegativeButton("취소", null)
                  .show();
            }));
    l.addView(
        Ui.button(
            this,
            "알림 허용",
            () -> {
              if (Build.VERSION.SDK_INT >= 33
                  && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                      != android.content.pm.PackageManager.PERMISSION_GRANTED)
                requestPermissions(
                    new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 7);
              else
                startActivity(
                    new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
            }));
    if (Build.VERSION.SDK_INT >= 31)
      l.addView(
          Ui.button(
              this,
              "정확한 시각 알림 설정",
              () ->
                  startActivity(
                      new Intent(
                          android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                          android.net.Uri.parse("package:" + getPackageName())))));
    JSONArray q = v.array("outbox");
    if (q.length() > 0) {
      l.addView(Ui.text(this, "기기에 보관 중인 입력 " + q.length() + "개", 16));
      for (int i = 0; i < q.length(); i++) {
        JSONObject item = q.optJSONObject(i);
        if (item != null && !item.optString("error").isEmpty()) {
          l.addView(Ui.text(this, item.optString("error"), 14));
          String id = item.optString("id");
          l.addView(
              Ui.button(
                  this,
                  "충돌한 대기 요청 확인",
                  () ->
                      new AlertDialog.Builder(this)
                          .setTitle("서버 기록을 먼저 확인해 주세요")
                          .setMessage(
                              "다른 기기의 기록을 덮어쓰지 않고 이 요청을 보관했습니다. 웹에서 확인한 뒤 대기 요청만 삭제하고 다시 입력할 수"
                                  + " 있어요.")
                          .setPositiveButton("웹 확인", (a, b) -> Ui.web(this))
                          .setNeutralButton(
                              "대기 요청 삭제",
                              (a, b) -> {
                                v.finish(id);
                                AlarmScheduler.reschedule(this);
                                Widgets.updateAll(this);
                                render();
                              })
                          .setNegativeButton("보관", null)
                          .show()));
        }
      }
    }
    l.addView(
        Ui.text(
            this,
            "홈 화면을 길게 눌러 위젯에서 생각함과 루틴을 추가하세요. 서버 변경은 앱을 열면 실시간으로 반영되며, 백그라운드에서는 Android 정책에 따라"
                + " 주기적으로 확인합니다.",
            14));
    l.addView(
        Ui.button(
            this,
            "로그아웃",
            () ->
                new AlertDialog.Builder(this)
                    .setTitle("로그아웃")
                    .setMessage(
                        q.length() > 0
                            ? "아직 전송하지 않은 입력이 있습니다. 동기화 후 로그아웃하세요."
                            : "이 기기의 로그인과 캐시를 지웁니다.")
                    .setPositiveButton(
                        q.length() > 0 ? "동기화" : "로그아웃",
                        (a, b) -> {
                          if (q.length() > 0) {
                            SyncWorker.enqueue(this);
                            return;
                          }
                          if (realtime != null) realtime.stop();
                          WorkManager.getInstance(this).cancelAllWorkByTag("pp");
                          AlarmScheduler.cancelAll(this);
                          v.clear();
                          Widgets.updateAll(this);
                          render();
                        })
                    .setNegativeButton("취소", null)
                    .show()));
  }

  private void mark(JSONObject r, String date, String status) {
    try {
      NativeRoutines.mark(this, r.optString("id"), date, status);
      render();
    } catch (Exception e) {
      Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
    }
  }

  protected void onResume() {
    super.onResume();
    if (!Vault.get(this).uid().isEmpty()) {
      AlarmScheduler.reschedule(this);
      SyncWorker.enqueue(this);
    }
  }
}
