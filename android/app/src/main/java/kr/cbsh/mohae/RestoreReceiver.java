package kr.cbsh.mohae;

import android.content.*;

public class RestoreReceiver extends BroadcastReceiver {
  public void onReceive(Context c, Intent intent) {
    String action = intent.getAction();
    if (!java.util.Arrays.asList(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED")
        .contains(action)) return;
    try {
      Reminders.reschedule(c);
      SyncWorker.configure(c);
    } catch (Exception ignored) {
    }
  }
}
