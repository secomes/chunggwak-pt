package kr.cbsh.mohae;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;
import org.json.*;

public final class Http {
  public static JSONObject get(String url, String token) throws Exception {
    return request(url, token, null);
  }

  public static JSONObject form(String url, Map<String, String> values) throws Exception {
    StringBuilder body = new StringBuilder();
    for (Map.Entry<String, String> e : values.entrySet()) {
      if (body.length() > 0) body.append('&');
      body.append(URLEncoder.encode(e.getKey(), "UTF-8"))
          .append('=')
          .append(URLEncoder.encode(e.getValue(), "UTF-8"));
    }
    return request(url, null, body.toString());
  }

  private static JSONObject request(String address, String token, String form) throws Exception {
    URL url = new URL(address);
    if (!url.getProtocol().equals("https")
        || !Arrays.asList(
                "classroom.googleapis.com",
                "www.googleapis.com",
                "openidconnect.googleapis.com",
                "graph.microsoft.com",
                "login.microsoftonline.com")
            .contains(url.getHost())) throw new IOException("허용되지 않은 계정 서버입니다.");
    HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
    c.setConnectTimeout(20000);
    c.setReadTimeout(30000);
    c.setInstanceFollowRedirects(false);
    c.setRequestProperty("Accept", "application/json");
    if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
    if (form != null) {
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
      try (OutputStream out = c.getOutputStream()) {
        out.write(form.getBytes(StandardCharsets.UTF_8));
      }
    }
    try {
      int status = c.getResponseCode();
      if (status < 200 || status >= 300) {
        if (status == 401) throw new IOException("로그인이 만료되었습니다. 계정을 다시 연결해 주세요.");
        if (status == 403) throw new IOException("학교에서 과제 읽기 권한을 허용하지 않았습니다. 기존 일정은 유지됩니다.");
        throw new IOException("학교 서비스 응답 오류 (" + status + ")");
      }
      try (InputStream in = c.getInputStream();
          ByteArrayOutputStream out = new ByteArrayOutputStream()) {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) {
          if (out.size() + n > 8_000_000) throw new IOException("응답 크기가 너무 큽니다.");
          out.write(buf, 0, n);
        }
        return new JSONObject(out.toString("UTF-8"));
      }
    } finally {
      c.disconnect();
    }
  }

  public static JSONArray pages(String url, String field, String token, boolean google)
      throws Exception {
    JSONArray result = new JSONArray();
    Set<String> visited = new HashSet<>();
    String initial = url;
    for (int page = 0; page < 200; page++) {
      if (!visited.add(url)) throw new IOException("학교 서비스의 목록이 반복되었습니다.");
      JSONObject data = get(url, token);
      JSONArray items = data.optJSONArray(field);
      if (items != null) for (int i = 0; i < items.length(); i++) result.put(items.get(i));
      if (google) {
        String next = data.optString("nextPageToken", "");
        if (next.isEmpty()) return result;
        url =
            initial
                + (initial.contains("?") ? "&" : "?")
                + "pageToken="
                + URLEncoder.encode(next, "UTF-8");
      } else {
        String next = data.optString("@odata.nextLink", "");
        if (next.isEmpty()) return result;
        if (!new URL(next).getHost().equals("graph.microsoft.com"))
          throw new IOException("학교 목록 주소 오류");
        url = next;
      }
    }
    throw new IOException("전체 목록을 끝까지 확인하지 못했습니다. 이전 일정은 유지됩니다.");
  }
}
