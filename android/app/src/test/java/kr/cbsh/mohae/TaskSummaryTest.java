package kr.cbsh.mohae;

import static org.junit.Assert.*;

import org.junit.Test;

public class TaskSummaryTest {
  @Test
  public void skipsGreetingForActualInstruction() {
    assertEquals(
        "첨부된 문제를 풀이하고 보고서를 제출하세요.",
        TaskSummary.extract("안녕하세요. 첨부된 문제를 풀이하고 보고서를 제출하세요. 감사합니다.", "task"));
  }

  @Test
  public void retainsOriginalQuantities() {
    assertEquals("3번 문제를 풀이하세요.", TaskSummary.extract("3번 문제를 풀이하세요.", "task"));
  }

  @Test
  public void doesNotInventSubmissionForMaterials() {
    assertEquals("학습자료 확인: 함수 그래프 참고자료", TaskSummary.extract("함수 그래프 참고자료", "material"));
  }

  @Test
  public void emptyDescriptionNeedsSourceCheck() {
    assertEquals("구체적인 할 일은 원문에서 확인하세요.", TaskSummary.extract("", "task"));
  }

  @Test
  public void htmlBoundariesPreserveInstruction() {
    assertEquals("보고서를 작성하세요.", TaskSummary.extract("<p>안녕하세요</p><p>보고서를 작성하세요.</p>", "task"));
  }
}
