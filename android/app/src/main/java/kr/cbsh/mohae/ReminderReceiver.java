package kr.cbsh.mohae;

import android.content.*;
import androidx.work.*;

public class ReminderReceiver extends BroadcastReceiver {
  public void onReceive(Context c, Intent intent) {
    String id = intent.getStringExtra("id"), stage = intent.getStringExtra("stage");
    if (id == null || stage == null) return;
    OneTimeWorkRequest.Builder request =
        new OneTimeWorkRequest.Builder(ReminderWorker.class)
            .setInputData(
                new Data.Builder()
                    .putString("id", id)
                    .putString("stage", stage)
                    .putLong("due", intent.getLongExtra("due", 0))
                    .build());
    if (android.os.Build.VERSION.SDK_INT >= 31)
      request.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
    WorkManager.getInstance(c)
        .enqueueUniqueWork("remind-" + id + "-" + stage, ExistingWorkPolicy.KEEP, request.build());
  }
}
