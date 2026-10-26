package kr.cbsh.mohae;

import java.time.*;
import java.util.*;

/** Platform-independent rules: each reminder uses the phone's chosen local hour. */
public final class ReminderRules {
  public static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Seoul");

  public static boolean submitted(String state) {
    return Arrays.asList("TURNED_IN", "RETURNED", "submitted", "returned", "excused")
        .contains(state);
  }

  public static boolean active(
      long due, String kind, boolean submitted, boolean personalDone, long now) {
    return due > now && "task".equals(kind) && !submitted && !personalDone;
  }

  public static Map<String, Long> times(
      long deadline, int hour, boolean week, boolean day, boolean today, long now) {
    Map<String, Long> result = new LinkedHashMap<>();
    if (deadline <= now) return result;
    LocalDate date = Instant.ofEpochMilli(deadline).atZone(SCHOOL_ZONE).toLocalDate();
    if (week) add(result, "week", date.minusDays(7), hour, deadline, now);
    if (day) add(result, "day", date.minusDays(1), hour, deadline, now);
    if (today) add(result, "today", date, hour, deadline, now);
    return result;
  }

  private static void add(
      Map<String, Long> result, String key, LocalDate date, int hour, long deadline, long now) {
    long t = date.atTime(hour, 0).atZone(SCHOOL_ZONE).toInstant().toEpochMilli();
    if (t >= deadline) t = deadline - 30 * 60000L;
    if (t > now && t < deadline) result.put(key, t);
  }

  public static long googleDue(int year, int month, int day, int hour, int minute, int second) {
    return LocalDateTime.of(year, month, day, hour, minute, second)
        .toInstant(ZoneOffset.UTC)
        .toEpochMilli();
  }
}
