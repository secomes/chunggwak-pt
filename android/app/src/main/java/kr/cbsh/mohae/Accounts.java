package kr.cbsh.mohae;

import android.accounts.Account;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.util.Base64;
import com.google.android.gms.auth.api.identity.*;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.json.*;

public final class Accounts {
  public static final int GOOGLE_AUTH = 701;
  public static final String MS_SCOPE =
      "openid email offline_access User.Read EduAssignments.ReadBasic";
  private static final String MS_TOKEN =
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
  public static final String MS_REDIRECT = "kr.cbsh.mohae://oauth/teams";

  public static List<Scope> googleScopes() {
    List<Scope> list = new ArrayList<>();
    for (String s :
        new String[] {
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/classroom.courses.readonly",
          "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
          "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly"
        }) list.add(new Scope(s));
    return list;
  }

  public static void connectGoogle(
      Activity a,
      String hint,
      java.util.function.Consumer<String> error,
      java.util.function.Consumer<AuthorizationResult> done) {
    AuthorizationRequest.Builder builder =
        AuthorizationRequest.builder().setRequestedScopes(googleScopes());
    if (hint != null && !hint.isBlank()) builder.setAccount(new Account(hint, "com.google"));
    Identity.getAuthorizationClient(a)
        .authorize(builder.build())
        .addOnSuccessListener(
            r -> {
              if (r.hasResolution()) {
                try {
                  a.startIntentSenderForResult(
                      r.getPendingIntent().getIntentSender(), GOOGLE_AUTH, null, 0, 0, 0);
                } catch (Exception e) {
                  error.accept("Google 로그인 화면을 열지 못했습니다.");
                }
              } else done.accept(r);
            })
        .addOnFailureListener(
            e -> error.accept("Google 연결을 완료하지 못했습니다. 학교 계정과 앱 연결 허용 상태를 확인해 주세요."));
  }

  public static String acceptGoogle(Context c, AuthorizationResult result, String expected)
      throws Exception {
    if (result.hasResolution() || result.getAccessToken() == null)
      throw new Exception("Google 로그인이 완료되지 않았습니다.");
    JSONObject me =
        Http.get("https://www.googleapis.com/oauth2/v3/userinfo", result.getAccessToken());
    String email = me.getString("email");
    if (expected != null && !expected.isBlank() && !email.equalsIgnoreCase(expected))
      throw new Exception("입력한 학교 계정과 선택한 Google 계정이 다릅니다.");
    saveAccount(c, "classroom", email, new JSONObject().put("email", email));
    return email;
  }

  public static String googleToken(Context c) throws Exception {
    String saved = new Vault(c).get("classroom");
    if (saved.isEmpty()) throw new Exception("Google Classroom 계정을 연결해 주세요.");
    String email = new JSONObject(saved).getString("email");
    AuthorizationResult r =
        Tasks.await(
            Identity.getAuthorizationClient(c)
                .authorize(
                    AuthorizationRequest.builder()
                        .setAccount(new Account(email, "com.google"))
                        .setRequestedScopes(googleScopes())
                        .build()),
            45,
            TimeUnit.SECONDS);
    if (r.hasResolution() || r.getAccessToken() == null)
      throw new Exception("Google Classroom 계정에 다시 로그인해 주세요.");
    return r.getAccessToken();
  }

  private static String random() {
    byte[] b = new byte[32];
    new SecureRandom().nextBytes(b);
    return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
  }

  public static void connectTeams(Activity activity, String hint) throws Exception {
    if (BuildConfig.MICROSOFT_CLIENT_ID.isBlank())
      throw new Exception("Teams 연결 서비스가 아직 배포 준비 중입니다. 계정 정보를 입력해도 연결된 것으로 처리하지 않습니다.");
    String state = random(),
        verifier = random(),
        challenge =
            Base64.encodeToString(
                MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.US_ASCII)),
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    new Vault(activity)
        .put(
            "teams-pending",
            new JSONObject()
                .put("state", state)
                .put("verifier", verifier)
                .put("hint", hint)
                .put("expires", System.currentTimeMillis() + 10 * 60000)
                .toString());
    Uri.Builder u =
        Uri.parse("https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize")
            .buildUpon()
            .appendQueryParameter("client_id", BuildConfig.MICROSOFT_CLIENT_ID)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("redirect_uri", MS_REDIRECT)
            .appendQueryParameter("scope", MS_SCOPE)
            .appendQueryParameter("state", state)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("prompt", "select_account");
    if (hint != null && !hint.isBlank()) u.appendQueryParameter("login_hint", hint);
    activity.startActivity(
        new Intent(Intent.ACTION_VIEW, u.build()).addCategory(Intent.CATEGORY_BROWSABLE));
  }

  public static String acceptTeams(Context c, Uri uri) throws Exception {
    if (!MS_REDIRECT.equals(uri.getScheme() + "://" + uri.getHost() + uri.getPath()))
      throw new Exception("로그인 반환 주소가 일치하지 않습니다.");
    Vault vault = new Vault(c);
    String raw = vault.get("teams-pending");
    if (raw.isEmpty()) throw new Exception("진행 중인 로그인 요청이 없습니다.");
    JSONObject request = new JSONObject(raw);
    vault.remove("teams-pending");
    if (request.getLong("expires") < System.currentTimeMillis()
        || !MessageDigest.isEqual(
            request.getString("state").getBytes(StandardCharsets.UTF_8),
            String.valueOf(uri.getQueryParameter("state")).getBytes(StandardCharsets.UTF_8)))
      throw new Exception("로그인 요청이 만료되었거나 다른 계정의 요청입니다.");
    if (uri.getQueryParameter("error") != null)
      throw new Exception("Teams 연결 동의가 완료되지 않았습니다. 학교에서 과제 읽기 승인을 요구할 수 있습니다.");
    String code = uri.getQueryParameter("code");
    if (code == null) throw new Exception("로그인 인증 코드가 없습니다.");
    Map<String, String> params = new LinkedHashMap<>();
    params.put("client_id", BuildConfig.MICROSOFT_CLIENT_ID);
    params.put("grant_type", "authorization_code");
    params.put("code", code);
    params.put("code_verifier", request.getString("verifier"));
    params.put("redirect_uri", MS_REDIRECT);
    JSONObject token = Http.form(MS_TOKEN, params),
        me =
            Http.get(
                "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
                token.getString("access_token"));
    String email = me.optString("userPrincipalName", me.optString("mail")),
        hint = request.optString("hint", "");
    if (!hint.isBlank()
        && !hint.equalsIgnoreCase(email)
        && !hint.equalsIgnoreCase(me.optString("mail")))
      throw new Exception("입력한 학교 계정과 로그인한 Teams 계정이 다릅니다.");
    token
        .put("email", email)
        .put("expires", System.currentTimeMillis() + token.optLong("expires_in", 3600) * 1000);
    saveAccount(c, "teams", email, token);
    return email;
  }

  public static synchronized String teamsToken(Context c) throws Exception {
    Vault vault = new Vault(c);
    String raw = vault.get("teams");
    if (raw.isEmpty()) throw new Exception("Microsoft Teams 계정을 연결해 주세요.");
    JSONObject token = new JSONObject(raw);
    if (token.optLong("expires", 0) > System.currentTimeMillis() + 60000)
      return token.getString("access_token");
    Map<String, String> p = new LinkedHashMap<>();
    p.put("client_id", BuildConfig.MICROSOFT_CLIENT_ID);
    p.put("grant_type", "refresh_token");
    p.put("refresh_token", token.getString("refresh_token"));
    p.put("scope", MS_SCOPE);
    JSONObject fresh = Http.form(MS_TOKEN, p);
    fresh
        .put("email", token.getString("email"))
        .put("expires", System.currentTimeMillis() + fresh.optLong("expires_in", 3600) * 1000);
    if (!fresh.has("refresh_token")) fresh.put("refresh_token", token.getString("refresh_token"));
    vault.put("teams", fresh.toString());
    return fresh.getString("access_token");
  }

  public static String email(Context c, String source) throws Exception {
    String raw = new Vault(c).get(source);
    return raw.isEmpty() ? "" : new JSONObject(raw).getString("email");
  }

  private static void saveAccount(Context c, String source, String address, JSONObject token)
      throws Exception {
    synchronized (SyncWorker.LOCK) {
      String previous = email(c, source);
      if (!previous.isEmpty() && !previous.equalsIgnoreCase(address)) {
        try (TaskStore db = new TaskStore(c)) {
          db.removeAccount(source, previous);
        }
      }
      new Vault(c).put(source, token.toString());
      c.getSharedPreferences("sync", 0)
          .edit()
          .remove(source + "-verified")
          .remove(source + "-error")
          .commit();
      Reminders.reschedule(c);
    }
  }

  public static void disconnect(Context c, String source) throws Exception {
    synchronized (SyncWorker.LOCK) {
      if (!source.equals("teams") && !source.equals("classroom"))
        throw new Exception("알 수 없는 계정입니다.");
      String email = email(c, source);
      if (source.equals("classroom") && !email.isEmpty()) {
        Tasks.await(
            Identity.getAuthorizationClient(c)
                .revokeAccess(
                    RevokeAccessRequest.builder()
                        .setAccount(new Account(email, "com.google"))
                        .setScopes(googleScopes())
                        .build()),
            30,
            TimeUnit.SECONDS);
      }
      new Vault(c).remove(source);
      try (TaskStore db = new TaskStore(c)) {
        db.removeAccount(source, email);
      }
      c.getSharedPreferences("sync", 0)
          .edit()
          .remove(source + "-verified")
          .remove(source + "-error")
          .commit();
      Reminders.reschedule(c);
    }
  }
}
