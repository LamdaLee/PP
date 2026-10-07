package app.pauseponder;

import android.app.*;
import android.content.*;
import android.os.*;
import android.widget.*;
import java.util.UUID;
import org.json.*;

public final class CaptureActivity extends Activity {
  EditText input;
  TextView message;

  public void onCreate(Bundle b) {
    super.onCreate(b);
    if (Vault.get(this).uid().isEmpty()) {
      startActivity(new Intent(this, MainActivity.class));
      finish();
      return;
    }

    LinearLayout l = Ui.column(this);
    l.addView(Ui.text(this, "생각함", 26));
    l.addView(Ui.text(this, "정리하지 않아도 괜찮아요. 떠오른 대로 적어두세요.", 14));

    input = new EditText(this);
    input.setHint("21000원 우산 구매\n떠오른 생각도 함께 적어요.");
    input.setMinLines(4);
    input.setGravity(android.view.Gravity.TOP);
    input.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    input.setText(Vault.get(this).read("draft", ""));
    l.addView(input);
    message = Ui.text(this, "완료를 누르면 정리해요. 쓰는 동안에는 나누지 않아요.", 14);
    l.addView(message);
    l.addView(
        Ui.button(
            this,
            "완료",
            () -> {
              String text = input.getText().toString().trim();
              if (text.isEmpty() || text.length() > 10000) {
                message.setText("1~10000자로 입력해 주세요.");
                return;
              }
              try {
                Vault v = Vault.get(this);
                String requestId = UUID.randomUUID().toString();
                v.enqueue(
                    new JSONObject()
                        .put("action", "memo")
                        .put("text", text)
                        .put("requestId", requestId),
                    "/api/data");
                v.write("draft", "");
                input.setText("");

                // 위젯에 최근 정리 결과 즉시 반영
                String summary = MemoParser.quickSummarize(text);
                v.write("memoStatus", "최근: " + summary);

                SyncWorker.enqueue(this);
                Widgets.updateAll(this);
                Toast.makeText(this, "저장했어요: " + summary, Toast.LENGTH_SHORT).show();
                finish();
              } catch (Exception e) {
                message.setText(e.getMessage());
              }
            }));

    l.addView(Ui.button(this, "닫기", () -> finish()));
    setContentView(l);
    getWindow()
        .setLayout(
            Math.min(
                Ui.dp(this, 560), (int) (getResources().getDisplayMetrics().widthPixels * .94)),
            -2);
  }

  protected void onPause() {
    super.onPause();
    if (input != null && !Vault.get(this).uid().isEmpty())
      Vault.get(this).write("draft", input.getText().toString());
  }
}
