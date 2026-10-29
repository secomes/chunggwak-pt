package kr.cbsh.mohae;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

public final class TaskStore extends SQLiteOpenHelper {
  public TaskStore(Context c) {
    super(c.getApplicationContext(), "mohae.db", null, 1);
  }

  public void onCreate(SQLiteDatabase db) {
    db.execSQL(
        "CREATE TABLE tasks(id TEXT PRIMARY KEY,source TEXT NOT NULL,account TEXT NOT NULL,data"
            + " TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',done INTEGER NOT NULL DEFAULT"
            + " 0,verified INTEGER NOT NULL)");
  }

  public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

  public static String identity(String source, String account, String course, String id)
      throws Exception {
    byte[] digest =
        MessageDigest.getInstance("SHA-256")
            .digest(
                (source
                        + "\n"
                        + account.toLowerCase(java.util.Locale.ROOT)
                        + "\n"
                        + course
                        + "\n"
                        + id)
                    .getBytes(StandardCharsets.UTF_8));
    StringBuilder out = new StringBuilder();
    for (byte b : digest) out.append(String.format("%02x", b));
    return out.toString();
  }

  public synchronized int merge(String source, String account, JSONArray rows) throws Exception {
    SQLiteDatabase db = getWritableDatabase();
    int changed = 0;
    db.beginTransaction();
    try {
      for (int i = 0; i < rows.length(); i++) {
        JSONObject item = rows.getJSONObject(i);
        String id =
            identity(source, account, item.getString("courseId"), item.getString("externalId"));
        item.put("id", id).put("source", source).put("account", account);
        String data = item.toString();
        try (Cursor c =
            db.query("tasks", new String[] {"data"}, "id=?", new String[] {id}, null, null, null)) {
          boolean exists = c.moveToFirst();
          if (!exists || !data.equals(c.getString(0))) changed++;
          ContentValues values = new ContentValues();
          values.put("source", source);
          values.put("account", account);
          values.put("data", data);
          values.put("verified", System.currentTimeMillis());
          if (exists) db.update("tasks", values, "id=?", new String[] {id});
          else {
            values.put("id", id);
            db.insertOrThrow("tasks", null, values);
          }
        }
      }
      db.setTransactionSuccessful();
      return changed;
    } finally {
      db.endTransaction();
    }
  }

  public synchronized JSONArray all() throws Exception {
    JSONArray rows = new JSONArray();
    try (Cursor c =
        getReadableDatabase().query("tasks", null, null, null, null, null, "verified DESC")) {
      while (c.moveToNext()) {
        JSONObject data = new JSONObject(c.getString(c.getColumnIndexOrThrow("data")));
        data.put("note", c.getString(c.getColumnIndexOrThrow("note")))
            .put("done", c.getInt(c.getColumnIndexOrThrow("done")) != 0)
            .put("verified", c.getLong(c.getColumnIndexOrThrow("verified")));
        rows.put(data);
      }
    }
    return rows;
  }

  public synchronized JSONObject get(String id) throws Exception {
    try (Cursor c =
        getReadableDatabase().query("tasks", null, "id=?", new String[] {id}, null, null, null)) {
      if (!c.moveToFirst()) return null;
      return new JSONObject(c.getString(c.getColumnIndexOrThrow("data")))
          .put("done", c.getInt(c.getColumnIndexOrThrow("done")) != 0);
    }
  }

  public synchronized void personal(String id, boolean done, String note) {
    ContentValues v = new ContentValues();
    v.put("done", done ? 1 : 0);
    v.put("note", note);
    getWritableDatabase().update("tasks", v, "id=?", new String[] {id});
  }

  public synchronized void removeAccount(String source, String account) {
    getWritableDatabase().delete("tasks", "source=? AND account=?", new String[] {source, account});
  }
}
