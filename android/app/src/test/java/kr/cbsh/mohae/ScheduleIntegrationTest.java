package kr.cbsh.mohae;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** Synthetic records exercise real SQLite merges and Android alarm/notification calls. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class ScheduleIntegrationTest {
  private Context context;
  private TaskStore db;
  private AlarmManager alarms;

  @Before
  public void setup() {
    context = RuntimeEnvironment.getApplication();
    context.deleteDatabase("mohae.db");
    context.getSharedPreferences("prefs", 0).edit().clear().commit();
    context.getSharedPreferences("alarms", 0).edit().clear().commit();
    db = new TaskStore(context);
    alarms = context.getSystemService(AlarmManager.class);
  }

  @After
  public void close() {
    db.close();
  }

  private JSONObject task(String id, boolean submitted) throws Exception {
    return new JSONObject()
        .put("externalId", id)
        .put("courseId", "course-1")
        .put("title", "합성 시험 과제")
        .put("course", "수학")
        .put("summary", "지정 문제를 풀이한다.")
        .put("kind", "task")
        .put("submission", submitted ? "TURNED_IN" : "CREATED")
        .put("submitted", submitted)
        .put("due", System.currentTimeMillis() + 14L * 86400000);
  }

  private String add(String source, String email, JSONObject item) throws Exception {
    db.merge(source, email, new JSONArray().put(item));
    return TaskStore.identity(
        source, email, item.getString("courseId"), item.getString("externalId"));
  }

  @Test
  public void refreshPreservesPersonalWorkAndDoesNotDuplicate() throws Exception {
    JSONObject item = task("same-id", false);
    String id = add("classroom", "one@example.edu", item);
    db.personal(id, true, "대면 제출 예정");
    item.put("title", "변경된 안내").put("due", item.getLong("due") + 86400000);
    add("classroom", "one@example.edu", item);
    JSONArray all = db.all();
    assertEquals(1, all.length());
    assertEquals("대면 제출 예정", all.getJSONObject(0).getString("note"));
    assertTrue(all.getJSONObject(0).getBoolean("done"));
    assertEquals("변경된 안내", all.getJSONObject(0).getString("title"));
  }

  @Test
  public void accountAndSourceIdentitiesStaySeparate() throws Exception {
    JSONObject a = task("same-id", false);
    add("classroom", "one@example.edu", a);
    add("classroom", "two@example.edu", task("same-id", false));
    add("teams", "one@example.edu", task("same-id", false));
    assertEquals(3, db.all().length());
    db.removeAccount("classroom", "one@example.edu");
    assertEquals(2, db.all().length());
    assertNull(db.get(TaskStore.identity("classroom", "one@example.edu", "course-1", "same-id")));
  }

  @Test
  public void submittedRefreshCancelsEveryReminderAndVisibleNotification() throws Exception {
    JSONObject item = task("a", false);
    String id = add("classroom", "one@example.edu", item);
    Reminders.reschedule(context);
    assertEquals(3, shadowOf(alarms).getScheduledAlarms().size());
    Reminders.show(context, db.get(id), "week", true);
    assertEquals(
        1, context.getSystemService(NotificationManager.class).getActiveNotifications().length);
    item.put("submitted", true).put("submission", "TURNED_IN");
    add("classroom", "one@example.edu", item);
    Reminders.reschedule(context);
    assertEquals(0, shadowOf(alarms).getScheduledAlarms().size());
    assertEquals(
        0, context.getSystemService(NotificationManager.class).getActiveNotifications().length);
  }

  @Test
  public void repeatedSyncDoesNotDuplicateAlarmsAndDoneCancelsThem() throws Exception {
    String id = add("teams", "one@example.edu", task("a", false));
    Reminders.reschedule(context);
    Reminders.reschedule(context);
    assertEquals(3, shadowOf(alarms).getScheduledAlarms().size());
    db.personal(id, true, "");
    Reminders.reschedule(context);
    assertTrue(shadowOf(alarms).getScheduledAlarms().isEmpty());
  }

  @Test
  public void materialBecomingAnAssignmentStartsReminders() throws Exception {
    JSONObject item = task("a", false).put("kind", "material").put("due", 0);
    add("classroom", "one@example.edu", item);
    Reminders.reschedule(context);
    assertEquals(0, shadowOf(alarms).getScheduledAlarms().size());
    item.put("kind", "task").put("due", System.currentTimeMillis() + 14L * 86400000);
    add("classroom", "one@example.edu", item);
    Reminders.reschedule(context);
    assertEquals(1, db.all().length());
    assertEquals(3, shadowOf(alarms).getScheduledAlarms().size());
  }

  @Test
  public void noLongerListedDoesNotMeanSubmittedOrDeleted() throws Exception {
    String id = add("teams", "one@example.edu", task("a", false));
    db.merge("teams", "one@example.edu", new JSONArray());
    assertNotNull(db.get(id));
    assertFalse(db.get(id).getBoolean("submitted"));
  }

  @Test
  public void alarmPreferencesApplyWithoutChangingOtherAccountRecords() throws Exception {
    add("teams", "one@example.edu", task("a", false));
    add("classroom", "two@example.edu", task("a", false));
    context
        .getSharedPreferences("prefs", 0)
        .edit()
        .putBoolean("week", false)
        .putBoolean("day", false)
        .commit();
    Reminders.reschedule(context);
    assertEquals(2, shadowOf(alarms).getScheduledAlarms().size());
    db.removeAccount("teams", "one@example.edu");
    Reminders.reschedule(context);
    assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
  }
}
