package kr.cbsh.mohae;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.*;
import org.json.*;

public class SyncWorker extends Worker {
  static final Object LOCK = new Object();

  public SyncWorker(Context c, WorkerParameters p) {
    super(c, p);
  }

  public Result doWork() {
    try {
      JSONObject r = sync(getApplicationContext(), null);
      return r.optBoolean("hasError") && getRunAttemptCount() < 3
          ? Result.retry()
          : Result.success();
    } catch (Exception e) {
      return getRunAttemptCount() < 3 ? Result.retry() : Result.failure();
    }
  }

  public static void configure(Context c) {
    int minutes = c.getSharedPreferences("prefs", 0).getInt("syncMinutes", 60);
    Constraints constraints =
        new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    PeriodicWorkRequest work =
        new PeriodicWorkRequest.Builder(SyncWorker.class, minutes, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build();
    WorkManager.getInstance(c)
        .enqueueUniquePeriodicWork("school-sync", ExistingPeriodicWorkPolicy.UPDATE, work);
  }

  public static void request(Context c) {
    WorkManager.getInstance(c)
        .enqueueUniqueWork(
            "school-sync-now",
            ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(SyncWorker.class)
                .setConstraints(
                    new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build());
  }

  public static JSONObject sync(Context c, String only) throws Exception {
    synchronized (LOCK) {
      JSONObject result = new JSONObject();
      boolean failure = false;
      int changed = 0;
      for (String source : new String[] {"classroom", "teams"}) {
        if (only != null && !only.equals(source)) continue;
        String email = Accounts.email(c, source);
        if (email.isEmpty()) continue;
        try {
          String token =
              source.equals("classroom") ? Accounts.googleToken(c) : Accounts.teamsToken(c);
          JSONArray items =
              source.equals("classroom") ? Providers.classroom(token) : Providers.teams(token);
          try (TaskStore db = new TaskStore(c)) {
            changed += db.merge(source, email, items);
          }
          c.getSharedPreferences("sync", 0)
              .edit()
              .putLong(source + "-verified", System.currentTimeMillis())
              .remove(source + "-error")
              .apply();
          result.put(source, true);
        } catch (Exception e) {
          failure = true;
          String message = e.getMessage();
          if (message == null || message.contains("token") || message.contains("java."))
            message = "계정을 다시 연결해 주세요. 기존 일정은 유지됩니다.";
          c.getSharedPreferences("sync", 0).edit().putString(source + "-error", message).apply();
          result.put(source, false);
        }
      }
      Reminders.reschedule(c);
      result.put("changed", changed).put("hasError", failure);
      return result;
    }
  }
}
