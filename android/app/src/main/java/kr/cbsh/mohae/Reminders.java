package kr.cbsh.mohae;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import java.util.*;
import org.json.*;

public final class Reminders {
  public static final String CHANNEL = "assignment-reminders";

  public static void channel(Context c) {
    NotificationChannel channel =
        new NotificationChannel(CHANNEL, "과제 마감 알림", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("일주일 전, 하루 전, 당일에 미제출 과제를 알려줘요.");
    channel.enableVibration(true);
    c.getSystemService(NotificationManager.class).createNotificationChannel(channel);
  }

  static PendingIntent pending(Context c, String key, String id, String stage, long due) {
    Intent i =
        new Intent(c, ReminderReceiver.class)
            .setAction("kr.cbsh.mohae.REMIND")
            .setData(Uri.parse("mohae-reminder://" + key))
            .putExtra("id", id)
            .putExtra("stage", stage)
            .putExtra("due", due);
    return PendingIntent.getBroadcast(
        c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  public static synchronized void reschedule(Context c) throws Exception {
    AlarmManager alarms = c.getSystemService(AlarmManager.class);
    SharedPreferences p = c.getSharedPreferences("prefs", 0),
        ledger = c.getSharedPreferences("alarms", 0);
    Set<String> old = new HashSet<>(ledger.getStringSet("scheduled", Collections.emptySet())),
        next = new HashSet<>();
    for (String key : old) alarms.cancel(pending(c, key, "", "", 0));
    try (TaskStore db = new TaskStore(c)) {
      JSONArray rows = db.all();
      for (int i = 0; i < rows.length(); i++) {
        JSONObject t = rows.getJSONObject(i);
        long due = t.optLong("due", 0);
        String id = t.getString("id");
        boolean active =
            ReminderRules.active(
                due,
                t.optString("kind"),
                t.optBoolean("submitted"),
                t.optBoolean("done"),
                System.currentTimeMillis());
        if (!active) {
          c.getSystemService(NotificationManager.class).cancel(id, 0);
          continue;
        }
        Map<String, Long> times =
            ReminderRules.times(
                due,
                p.getInt("reminderHour", 9),
                p.getBoolean("week", true),
                p.getBoolean("day", true),
                p.getBoolean("today", true),
                System.currentTimeMillis());
        for (Map.Entry<String, Long> time : times.entrySet()) {
          String key = id + "-" + time.getKey();
          PendingIntent intent = pending(c, key, id, time.getKey(), due);
          if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms())
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time.getValue(), intent);
          else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time.getValue(), intent);
          next.add(key);
        }
      }
    }
    ledger.edit().putStringSet("scheduled", next).commit();
  }

  public static void show(Context c, JSONObject item, String stage, boolean fresh)
      throws Exception {
    if (Build.VERSION.SDK_INT >= 33
        && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
    if (!ReminderRules.active(
        item.optLong("due"),
        item.optString("kind"),
        item.optBoolean("submitted"),
        item.optBoolean("done"),
        System.currentTimeMillis())) return;
    channel(c);
    String prefix =
        stage.equals("week") ? "일주일 뒤 마감이에요" : stage.equals("day") ? "내일 마감이에요" : "오늘 마감이에요";
    String title = prefix + " · " + item.optString("course"),
        body = item.optString("title") + "\n" + item.optString("summary");
    String state = item.optString("submission", "unknown");
    if (!fresh) body += "\n현재 제출 상태를 확인하지 못했어요. 최근 확인 이후 달라졌을 수 있어요.";
    else if (state.equals("UNKNOWN") || state.equals("unknown")) body += "\n제출 여부는 원문에서 확인해 주세요.";
    Intent open =
        new Intent(c, MainActivity.class)
            .setData(Uri.parse("mohae-task://" + item.getString("id")))
            .putExtra("taskId", item.getString("id"))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent content =
        PendingIntent.getActivity(
            c,
            item.getString("id").hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification notification =
        new Notification.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(Color.rgb(247, 115, 23))
            .setContentTitle(title)
            .setContentText(item.optString("title"))
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(content)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build();
    c.getSystemService(NotificationManager.class).notify(item.getString("id"), 0, notification);
  }
}
