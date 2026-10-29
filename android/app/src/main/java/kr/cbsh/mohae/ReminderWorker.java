package kr.cbsh.mohae;

import android.content.Context;
import androidx.work.*;
import org.json.JSONObject;

public class ReminderWorker extends Worker {
  public ReminderWorker(Context c, WorkerParameters p) {
    super(c, p);
  }

  public Result doWork() {
    Context c = getApplicationContext();
    String id = getInputData().getString("id"), stage = getInputData().getString("stage");
    if (id == null || stage == null) return Result.failure();
    try {
      JSONObject before;
      try (TaskStore db = new TaskStore(c)) {
        before = db.get(id);
      }
      if (before == null) return Result.success();
      boolean fresh = false;
      try {
        JSONObject sync = SyncWorker.sync(c, before.getString("source"));
        fresh = sync.optBoolean(before.getString("source"));
      } catch (Exception ignored) {
      }
      try (TaskStore db = new TaskStore(c)) {
        JSONObject item = db.get(id);
        if (item != null
            && item.optLong("due") == getInputData().getLong("due", 0)
            && c.getSharedPreferences("prefs", 0).getBoolean(stage, true))
          Reminders.show(c, item, stage, fresh);
      }
      return Result.success();
    } catch (Exception e) {
      return Result.retry();
    }
  }
}
