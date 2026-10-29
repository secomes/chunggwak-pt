package kr.cbsh.mohae;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import com.google.android.gms.auth.api.identity.*;
import java.util.concurrent.*;
import org.json.*;

public final class MainActivity extends Activity {
  private WebView web;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private String expectedGoogle = "";
  private boolean pageReady = false;

  public void onCreate(Bundle state) {
    super.onCreate(state);
    Reminders.channel(this);
    SyncWorker.configure(this);
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(255, 250, 246));
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(false);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setAllowFileAccessFromFileURLs(false);
    web.getSettings().setAllowUniversalAccessFromFileURLs(false);
    web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.addJavascriptInterface(new Bridge(), "Mohae");
    web.setWebViewClient(
        new WebViewClient() {
          public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri uri = req.getUrl();
            if ("file".equals(uri.getScheme())
                && uri.getPath() != null
                && uri.getPath().startsWith("/android_asset/")) return false;
            openExternal(uri.toString());
            return true;
          }

          public void onPageFinished(WebView v, String url) {
            pageReady = true;
            refresh();
          }

          public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            String scheme = r.getUrl().getScheme();
            if ("file".equals(scheme) || "data".equals(scheme)) return null;
            return new WebResourceResponse(
                "text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
          }
        });
    if (state != null) expectedGoogle = state.getString("expectedGoogle", "");
    web.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          }
          return insets;
        });
    setContentView(web);
    web.loadUrl("file:///android_asset/index.html");
    handleLogin(getIntent());
  }

  protected void onResume() {
    super.onResume();
    if (web != null) refresh();
  }

  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleLogin(intent);
    if (web != null) refresh();
  }

  private void handleLogin(Intent intent) {
    Uri uri = intent.getData();
    if (uri == null || !"kr.cbsh.mohae".equals(uri.getScheme())) return;
    io.execute(
        () -> {
          try {
            Accounts.acceptTeams(this, uri);
            afterConnection("teams", "Teams");
          } catch (Exception e) {
            notifyUI(safeMessage(e));
          } finally {
            runOnUiThread(() -> getIntent().setData(null));
            refresh();
          }
        });
  }

  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == Accounts.GOOGLE_AUTH) {
      if (result != RESULT_OK) {
        notifyUI("Google 계정 연결을 취소했어요.");
        return;
      }
      try {
        AuthorizationResult r =
            Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data);
        acceptGoogle(r);
      } catch (Exception e) {
        notifyUI("Google 계정 연결이 완료되지 않았어요.");
      }
    }
  }

  private void acceptGoogle(AuthorizationResult result) {
    io.execute(
        () -> {
          try {
            Accounts.acceptGoogle(this, result, expectedGoogle);
            afterConnection("classroom", "Classroom");
          } catch (Exception e) {
            notifyUI(safeMessage(e));
          }
          refresh();
        });
  }

  private void afterConnection(String source, String label) throws Exception {
    JSONObject result = SyncWorker.sync(this, source);
    notifyUI(
        result.optBoolean(source)
            ? label + "의 과제와 제출 상태를 가져왔어요."
            : label + " 로그인은 완료됐지만 과제를 읽지 못했어요. 연결 오류를 확인해 주세요.");
    runOnUiThread(
        () -> {
          if (Build.VERSION.SDK_INT >= 33
              && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                  != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 801);
        });
  }

  static String safeMessage(Exception e) {
    String s = e.getMessage();
    return s == null || s.length() > 300 || s.contains("token") || s.contains("Exception")
        ? "작업을 완료하지 못했어요. 계정 연결 상태를 확인해 주세요."
        : s;
  }

  protected void onSaveInstanceState(Bundle out) {
    out.putString("expectedGoogle", expectedGoogle);
    super.onSaveInstanceState(out);
  }

  void refresh() {
    runOnUiThread(
        () -> {
          if (web != null && pageReady) {
            web.evaluateJavascript("window.refresh&&window.refresh()", null);
            String taskId = getIntent().getStringExtra("taskId");
            if (taskId != null && taskId.matches("[a-f0-9]{64}")) {
              getIntent().removeExtra("taskId");
              web.evaluateJavascript(
                  "window.openTask&&window.openTask(" + JSONObject.quote(taskId) + ")", null);
            }
          }
        });
  }

  void notifyUI(String text) {
    runOnUiThread(
        () -> {
          if (web != null)
            web.evaluateJavascript(
                "window.showToast&&window.showToast(" + JSONObject.quote(text) + ")", null);
        });
  }

  private void openExternal(String address) {
    try {
      Uri uri = Uri.parse(address);
      String scheme = uri.getScheme();
      if (!"https".equals(scheme)) return;
      startActivity(new Intent(Intent.ACTION_VIEW, uri));
    } catch (Exception e) {
      notifyUI("원문을 열 수 없어요.");
    }
  }

  public void onRequestPermissionsResult(int r, String[] p, int[] results) {
    super.onRequestPermissionsResult(r, p, results);
    refresh();
  }

  protected void onDestroy() {
    if (web != null) {
      web.removeJavascriptInterface("Mohae");
      web.destroy();
      web = null;
    }
    io.shutdown();
    super.onDestroy();
  }

  public final class Bridge {
    @JavascriptInterface
    public String state() {
      try {
        JSONObject o = new JSONObject();
        try (TaskStore db = new TaskStore(MainActivity.this)) {
          o.put("tasks", db.all());
        }
        JSONObject accounts = new JSONObject();
        for (String source : new String[] {"teams", "classroom"}) {
          String email = Accounts.email(MainActivity.this, source);
          accounts.put(
              source,
              new JSONObject()
                  .put("email", email)
                  .put("verified", getSharedPreferences("sync", 0).getLong(source + "-verified", 0))
                  .put("error", getSharedPreferences("sync", 0).getString(source + "-error", "")));
        }
        o.put("accounts", accounts);
        SharedPreferences p = getSharedPreferences("prefs", 0);
        o.put(
            "settings",
            new JSONObject()
                .put("week", p.getBoolean("week", true))
                .put("day", p.getBoolean("day", true))
                .put("today", p.getBoolean("today", true))
                .put("hour", p.getInt("reminderHour", 9))
                .put("syncMinutes", p.getInt("syncMinutes", 60)));
        o.put(
            "permissions",
            new JSONObject()
                .put(
                    "notifications",
                    getSystemService(NotificationManager.class).areNotificationsEnabled())
                .put(
                    "exact",
                    Build.VERSION.SDK_INT < 31
                        || getSystemService(AlarmManager.class).canScheduleExactAlarms()));
        return o.toString();
      } catch (Exception e) {
        return "{\"error\":\"데이터를 읽지 못했어요.\"}";
      }
    }

    @JavascriptInterface
    public void connect(String provider, String email) {
      String hint = email == null ? "" : email.trim();
      if (hint.length() > 254
          || (!hint.isEmpty() && !android.util.Patterns.EMAIL_ADDRESS.matcher(hint).matches())) {
        notifyUI("학교 이메일을 확인해 주세요.");
        return;
      }
      runOnUiThread(
          () -> {
            if ("classroom".equals(provider)) {
              expectedGoogle = hint;
              Accounts.connectGoogle(
                  MainActivity.this,
                  hint,
                  MainActivity.this::notifyUI,
                  MainActivity.this::acceptGoogle);
            } else if ("teams".equals(provider)) {
              try {
                Accounts.connectTeams(MainActivity.this, hint);
              } catch (Exception e) {
                notifyUI(safeMessage(e));
              }
            }
          });
    }

    @JavascriptInterface
    public void sync() {
      io.execute(
          () -> {
            try {
              JSONObject r = SyncWorker.sync(MainActivity.this, null);
              notifyUI(
                  r.optBoolean("hasError")
                      ? "일부 계정 연결을 확인해 주세요. 기존 일정은 보관돼요."
                      : "최신 과제와 제출 상태를 확인했어요.");
            } catch (Exception e) {
              notifyUI(safeMessage(e));
            }
            refresh();
          });
    }

    @JavascriptInterface
    public void disconnect(String provider) {
      if (!provider.equals("teams") && !provider.equals("classroom")) return;
      runOnUiThread(
          () ->
              new AlertDialog.Builder(MainActivity.this)
                  .setTitle("계정 연결을 해제할까요?")
                  .setMessage("이 계정의 기기 내 과제와 예약 알림을 제거해요. 원본 과제는 그대로 유지돼요.")
                  .setNegativeButton("취소", null)
                  .setPositiveButton(
                      "연결 해제",
                      (d, w) ->
                          io.execute(
                              () -> {
                                try {
                                  Accounts.disconnect(MainActivity.this, provider);
                                  notifyUI("계정 연결을 해제했어요.");
                                } catch (Exception e) {
                                  notifyUI(safeMessage(e));
                                }
                                refresh();
                              }))
                  .show());
    }

    @JavascriptInterface
    public void settings(String json) {
      io.execute(
          () -> {
            try {
              JSONObject o = new JSONObject(json);
              int hour = o.getInt("hour"), minutes = o.getInt("syncMinutes");
              if (hour < 0
                  || hour > 23
                  || !java.util.Arrays.asList(30, 60, 120, 360).contains(minutes))
                throw new Exception("알림 설정을 확인해 주세요.");
              getSharedPreferences("prefs", 0)
                  .edit()
                  .putBoolean("week", o.getBoolean("week"))
                  .putBoolean("day", o.getBoolean("day"))
                  .putBoolean("today", o.getBoolean("today"))
                  .putInt("reminderHour", hour)
                  .putInt("syncMinutes", minutes)
                  .commit();
              Reminders.reschedule(MainActivity.this);
              SyncWorker.configure(MainActivity.this);
              notifyUI("알림 설정을 저장했어요.");
            } catch (Exception e) {
              notifyUI(safeMessage(e));
            }
            refresh();
          });
    }

    @JavascriptInterface
    public void personal(String id, boolean done, String note) {
      if (id == null || !id.matches("[a-f0-9]{64}") || note == null || note.length() > 5000) return;
      io.execute(
          () -> {
            try (TaskStore db = new TaskStore(MainActivity.this)) {
              db.personal(id, done, note);
              Reminders.reschedule(MainActivity.this);
            } catch (Exception e) {
              notifyUI(safeMessage(e));
            }
            refresh();
          });
    }

    @JavascriptInterface
    public void open(String url) {
      runOnUiThread(() -> openExternal(url));
    }

    @JavascriptInterface
    public void notificationPermission() {
      runOnUiThread(
          () -> {
            if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED)
              requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 801);
            else
              startActivity(
                  new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                      .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
          });
    }

    @JavascriptInterface
    public void exactPermission() {
      runOnUiThread(
          () -> {
            if (Build.VERSION.SDK_INT >= 31)
              startActivity(
                  new Intent(
                      Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                      Uri.parse("package:" + getPackageName())));
          });
    }

    @JavascriptInterface
    public void testNotification() {
      runOnUiThread(
          () -> {
            try {
              JSONObject item =
                  new JSONObject()
                      .put("id", "notification-test")
                      .put("title", "알림이 이렇게 도착해요")
                      .put("course", "충곽 뭐해")
                      .put("summary", "학교 과제의 마감일을 놓치지 않게 알려드릴게요.")
                      .put("kind", "task")
                      .put("due", System.currentTimeMillis() + 24 * 3600000L)
                      .put("submission", "assigned");
              Reminders.show(MainActivity.this, item, "day", true);
              notifyUI("폰의 알림창을 확인해 보세요.");
            } catch (Exception e) {
              notifyUI("알림 권한을 확인해 주세요.");
            }
          });
    }
  }
}
