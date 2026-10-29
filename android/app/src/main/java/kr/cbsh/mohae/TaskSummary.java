package kr.cbsh.mohae;

/** Extracts instructions from the source; never invents work or sends text to an AI service. */
public final class TaskSummary {
  public static String extract(String source, String kind) {
    String text =
        source == null
            ? ""
            : source
                .replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
                .replaceAll("(?i)<(?:br\\s*/?|/p|/div|/li)>", "\n")
                .replaceAll("<[^>]*>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">");
    String best = "";
    int bestScore = -1;
    for (String line : text.split("(?:\\r?\\n)+|(?<=[.!?。])\\s+")) {
      String candidate = line.replaceAll("\\s+", " ").trim();
      if (candidate.isEmpty()) continue;
      int score = 0;
      for (String word :
          new String[] {"제출", "작성", "풀이", "풀어", "완성", "읽고", "정리", "준비", "보고서", "문제", "확인"})
        if (candidate.contains(word)) score += 2;
      if (candidate.matches(".*(안녕하세요|감사합니다|수고했).*")) score -= 5;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best.isEmpty())
      return "material".equals(kind) ? "원문 학습자료를 확인하세요." : "구체적인 할 일은 원문에서 확인하세요.";
    if ("material".equals(kind)) best = "학습자료 확인: " + best;
    return best.length() > 180 ? best.substring(0, 177) + "…" : best;
  }
}
