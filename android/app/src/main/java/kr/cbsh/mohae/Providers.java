package kr.cbsh.mohae;

import java.net.URLEncoder;
import java.time.Instant;
import java.util.*;
import org.json.*;

public final class Providers {
  private static final String GOOGLE = "https://classroom.googleapis.com/v1/",
      GRAPH = "https://graph.microsoft.com/v1.0/";

  public static String summary(String s, String kind) {
    return TaskSummary.extract(s, kind);
  }

  private static String enc(String s) throws Exception {
    return URLEncoder.encode(s, "UTF-8");
  }

  private static JSONObject base(JSONObject item, String courseId, String course) throws Exception {
    return new JSONObject()
        .put("externalId", item.getString("id"))
        .put("courseId", courseId)
        .put("course", course);
  }

  public static JSONArray classroom(String token) throws Exception {
    JSONArray
        courses =
            Http.pages(
                GOOGLE + "courses?studentId=me&courseStates=ACTIVE&pageSize=100",
                "courses",
                token,
                true),
        out = new JSONArray();
    for (int c = 0; c < courses.length(); c++) {
      JSONObject course = courses.getJSONObject(c);
      String cid = course.getString("id"), root = GOOGLE + "courses/" + enc(cid) + "/";
      JSONArray work = Http.pages(root + "courseWork?pageSize=100", "courseWork", token, true),
          materials =
              Http.pages(
                  root + "courseWorkMaterials?pageSize=100", "courseWorkMaterial", token, true);
      JSONArray submissions =
          Http.pages(
              root
                  + "courseWork/-/studentSubmissions?userId=me&pageSize=100&fields=nextPageToken,studentSubmissions(courseWorkId,state,updateTime)",
              "studentSubmissions",
              token,
              true);
      Map<String, String> states = new HashMap<>();
      for (int i = 0; i < submissions.length(); i++) {
        JSONObject s = submissions.getJSONObject(i);
        states.put(s.getString("courseWorkId"), s.optString("state", "UNKNOWN"));
      }
      for (int group = 0; group < 2; group++) {
        JSONArray list = group == 0 ? work : materials;
        for (int i = 0; i < list.length(); i++) {
          JSONObject item = list.getJSONObject(i);
          String state = states.getOrDefault(item.getString("id"), "UNKNOWN"),
              kind = item.has("dueDate") ? "task" : "material";
          long due = 0;
          if (item.has("dueDate")) {
            JSONObject d = item.getJSONObject("dueDate"), t = item.optJSONObject("dueTime");
            due =
                ReminderRules.googleDue(
                    d.getInt("year"),
                    d.getInt("month"),
                    d.getInt("day"),
                    t == null ? 23 : t.optInt("hours", 0),
                    t == null ? 59 : t.optInt("minutes", 0),
                    t == null ? 59 : t.optInt("seconds", 0));
          }
          out.put(
              base(item, cid, course.optString("name"))
                  .put("title", item.optString("title"))
                  .put("description", item.optString("description"))
                  .put("summary", summary(item.optString("description"), kind))
                  .put("kind", kind)
                  .put("due", due)
                  .put("submission", state)
                  .put("submitted", ReminderRules.submitted(state))
                  .put("url", item.optString("alternateLink"))
                  .put("files", googleFiles(item.optJSONArray("materials"))));
        }
      }
    }
    return out;
  }

  private static JSONArray googleFiles(JSONArray materials) throws Exception {
    JSONArray files = new JSONArray();
    if (materials == null) return files;
    for (int i = 0; i < materials.length(); i++) {
      JSONObject m = materials.getJSONObject(i), f = null;
      if (m.has("driveFile")) f = m.getJSONObject("driveFile").optJSONObject("driveFile");
      else
        for (String type : new String[] {"link", "youtubeVideo", "form"})
          if (m.has(type)) {
            f = m.getJSONObject(type);
            break;
          }
      if (f != null)
        files.put(
            new JSONObject()
                .put("name", f.optString("title", f.optString("url", "첨부자료")))
                .put(
                    "url",
                    f.optString("alternateLink", f.optString("formUrl", f.optString("url", "")))));
    }
    return files;
  }

  public static JSONArray teams(String token) throws Exception {
    JSONObject me = Http.get(GRAPH + "me?$select=id,mail,userPrincipalName", token);
    String uid = me.getString("id");
    JSONArray list = Http.pages(GRAPH + "education/me/assignments?$top=100", "value", token, false),
        out = new JSONArray();
    Map<String, String> names = new HashMap<>();
    for (int i = 0; i < list.length(); i++) {
      JSONObject brief = list.getJSONObject(i);
      String cid = brief.getString("classId"),
          id = brief.getString("id"),
          base = GRAPH + "education/classes/" + enc(cid) + "/assignments/" + enc(id);
      JSONObject item = Http.get(base, token);
      if (!names.containsKey(cid)) {
        try {
          JSONObject course =
              Http.get(GRAPH + "education/classes/" + enc(cid) + "?$select=displayName", token);
          names.put(cid, course.optString("displayName", "Teams 수업"));
        } catch (java.io.IOException e) {
          names.put(cid, "Teams 수업");
        }
      }
      JSONArray
          submissions =
              Http.pages(
                  base + "/submissions?$select=id,status,recipient,submittedBy",
                  "value",
                  token,
                  false),
          resources = Http.pages(base + "/resources", "value", token, false),
          files = new JSONArray();
      String state = "unknown";
      boolean submitted = false;
      for (int n = 0; n < submissions.length(); n++) {
        JSONObject s = submissions.getJSONObject(n),
            r = s.optJSONObject("recipient"),
            by = s.optJSONObject("submittedBy"),
            user = by == null ? null : by.optJSONObject("user");
        if ((r != null && uid.equals(r.optString("userId")))
            || (user != null && uid.equals(user.optString("id")))) {
          state = s.optString("status", "unknown");
          submitted |= ReminderRules.submitted(state);
        }
      }
      for (int n = 0; n < resources.length(); n++) {
        JSONObject f = resources.getJSONObject(n).optJSONObject("resource");
        if (f != null)
          files.put(
              new JSONObject()
                  .put("name", f.optString("displayName", "첨부자료"))
                  .put("url", f.optString("fileUrl", f.optString("link", ""))));
      }
      JSONObject instructions = item.optJSONObject("instructions");
      String desc = instructions == null ? "" : instructions.optString("content");
      String dueText = item.optString("dueDateTime", "");
      long due = dueText.isEmpty() ? 0 : Instant.parse(dueText).toEpochMilli();
      out.put(
          new JSONObject()
              .put("externalId", id)
              .put("courseId", cid)
              .put("course", names.get(cid))
              .put("title", item.optString("displayName"))
              .put("description", desc.replaceAll("<[^>]*>", " "))
              .put("summary", summary(desc, "task"))
              .put("kind", "task")
              .put("due", due)
              .put("submission", state)
              .put("submitted", submitted)
              .put("files", files)
              .put("url", item.optString("webUrl")));
    }
    return out;
  }
}
