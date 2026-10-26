package kr.cbsh.mohae;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Secrets stay in app-private encrypted preferences, protected by Android Keystore. */
public final class Vault {
  private final Context context;

  public Vault(Context c) {
    context = c.getApplicationContext();
  }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias("mohae-account-v1")) {
      KeyGenerator gen =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      gen.init(
          new KeyGenParameterSpec.Builder(
                  "mohae-account-v1", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      gen.generateKey();
    }
    return (SecretKey) store.getKey("mohae-account-v1", null);
  }

  public synchronized void put(String name, String value) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    String record =
        Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
            + ":"
            + Base64.encodeToString(
                cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                Base64.NO_WRAP);
    if (!context.getSharedPreferences("vault", 0).edit().putString(name, record).commit())
      throw new Exception("계정 저장에 실패했습니다.");
  }

  public synchronized String get(String name) throws Exception {
    String record = context.getSharedPreferences("vault", 0).getString(name, null);
    if (record == null) return "";
    String[] parts = record.split(":", 2);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
        Cipher.DECRYPT_MODE,
        key(),
        new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
    return new String(
        cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
        java.nio.charset.StandardCharsets.UTF_8);
  }

  public synchronized void remove(String name) {
    context.getSharedPreferences("vault", 0).edit().remove(name).commit();
  }
}
