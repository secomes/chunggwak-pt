package kr.cbsh.mohae;

import static org.junit.Assert.*;

import java.time.*;
import java.util.*;
import org.junit.Test;

public class ReminderRulesTest {
  long kst(String s) {
    return LocalDateTime.parse(s).atZone(ReminderRules.SCHOOL_ZONE).toInstant().toEpochMilli();
  }

  @Test
  public void weekDayAndTodayUseSchoolDates() {
    long due = kst("2026-11-06T13:30:00"), now = kst("2026-10-26T10:00:00");
    Map<String, Long> times = ReminderRules.times(due, 9, true, true, true, now);
    assertEquals(Long.valueOf(kst("2026-10-30T09:00:00")), times.get("week"));
    assertEquals(Long.valueOf(kst("2026-11-05T09:00:00")), times.get("day"));
    assertEquals(Long.valueOf(kst("2026-11-06T09:00:00")), times.get("today"));
  }

  @Test
  public void submittedAndCompletedTasksNeverQualify() {
    long due = kst("2026-11-06T13:30:00"), now = kst("2026-10-26T10:00:00");
    assertFalse(ReminderRules.active(due, "task", true, false, now));
    assertFalse(ReminderRules.active(due, "task", false, true, now));
    assertFalse(ReminderRules.active(due, "material", false, false, now));
    assertFalse(ReminderRules.active(0, "task", false, false, now));
    assertFalse(ReminderRules.active(now - 1, "task", false, false, now));
    assertTrue(ReminderRules.active(due, "task", false, false, now));
  }

  @Test
  public void pastReminderTimesAreNotSentAsNewAlerts() {
    long due = kst("2026-11-06T13:30:00"), now = kst("2026-11-06T10:00:00");
    assertTrue(ReminderRules.times(due, 9, true, true, true, now).isEmpty());
  }

  @Test
  public void morningDeadlineRemindsBeforeItInsteadOfAfter() {
    long due = kst("2026-11-06T08:00:00"), now = kst("2026-11-05T10:00:00");
    assertEquals(
        Long.valueOf(kst("2026-11-06T07:30:00")),
        ReminderRules.times(due, 9, false, false, true, now).get("today"));
  }

  @Test
  public void switchesRemoveOnlyRequestedStages() {
    Map<String, Long> t =
        ReminderRules.times(
            kst("2026-11-06T13:30:00"), 9, false, true, false, kst("2026-10-26T10:00:00"));
    assertEquals(Collections.singleton("day"), t.keySet());
  }

  @Test
  public void resubmissionAndReassignmentDoNotCountAsSubmitted() {
    for (String s : new String[] {"TURNED_IN", "RETURNED", "submitted", "returned"})
      assertTrue(ReminderRules.submitted(s));
    for (String s :
        new String[] {
          "RECLAIMED_BY_STUDENT", "REASSIGNED", "reassigned", "assigned", "UNKNOWN", "unknown"
        }) assertFalse(ReminderRules.submitted(s));
  }

  @Test
  public void googleDeadlinesAreUtcThenDisplayedInKorea() {
    assertEquals(kst("2026-10-28T23:59:00"), ReminderRules.googleDue(2026, 10, 28, 14, 59, 0));
  }
}
