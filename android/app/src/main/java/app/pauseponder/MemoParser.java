package app.pauseponder;

import java.util.regex.*;

public final class MemoParser {
  private static final Pattern MONEY_PATTERN = Pattern.compile("(\\d[\\d,]*(?:억|만|천)?)\\s*원");
  private static final Pattern EXPENSE_PATTERN = Pattern.compile("구매|샀|구입|결제|썼|지출|사용");
  private static final Pattern REPAYMENT_PATTERN = Pattern.compile("카드\\s*(?:값|대금)|대출\\s*(?:상환|원금)");
  private static final Pattern INCOME_PATTERN = Pattern.compile("월급|급여|입금|수입");
  private static final Pattern AMBIGUOUS_PATTERN = Pattern.compile("같아|쯤|기억|아마|싶|예정|할까|\\?");

  public static String quickSummarize(String text) {
    Matcher m = MONEY_PATTERN.matcher(text);
    if (!m.find()) {
      if (text.contains("불안") || text.contains("지쳐") || text.contains("기분")) return "감정 메모";
      if (text.contains("보고서") || text.contains("회의") || text.contains("업무")) return "업무 메모";
      if (text.contains("숨") || text.contains("호흡") || text.contains("휴식")) return "숨고르기";
      return "생각함 메모";
    }

    String moneyStr = m.group(0);
    boolean ambiguous = AMBIGUOUS_PATTERN.matcher(text).find();

    if (ambiguous) return moneyStr + " (확인 대기 후보)";
    if (REPAYMENT_PATTERN.matcher(text).find()) return moneyStr + " (상환 · 소비제외)";
    if (INCOME_PATTERN.matcher(text).find()) return "+" + moneyStr + " (수입)";
    if (EXPENSE_PATTERN.matcher(text).find()) return "-" + moneyStr + " (지출)";

    return moneyStr + " (금액 확인)";
  }
}
