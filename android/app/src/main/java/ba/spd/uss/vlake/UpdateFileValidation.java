package ba.spd.uss.vlake;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Provjera nastavka i sadržaja APK-a prije Android instalacije. */
final class UpdateFileValidation {
    private UpdateFileValidation() {}
    static boolean validRange(String header, long offset, long expectedTotal) {
        if (header == null) return false;
        Matcher m = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)").matcher(header.trim());
        if (!m.matches()) return false;
        try {
            long start=Long.parseLong(m.group(1)), end=Long.parseLong(m.group(2)), total=Long.parseLong(m.group(3));
            return start==offset && end>=start && end<total && (expectedTotal<=0 || total==expectedTotal);
        } catch (NumberFormatException e) { return false; }
    }
    static boolean matchesDigest(File file, String digest) throws IOException {
        if (digest == null || digest.isEmpty()) return true; // starije GitHub objave nemaju digest
        if (!digest.matches("sha256:[0-9a-fA-F]{64}")) return false;
        try {
            MessageDigest hash=MessageDigest.getInstance("SHA-256");
            try (FileInputStream in=new FileInputStream(file)) {
                byte[] bytes=new byte[65536];int n;
                while ((n=in.read(bytes))!=-1) hash.update(bytes,0,n);
            }
            StringBuilder hex=new StringBuilder();
            for (byte b:hash.digest()) hex.append(String.format(java.util.Locale.ROOT,"%02x",b & 255));
            return hex.toString().equalsIgnoreCase(digest.substring(7));
        } catch (NoSuchAlgorithmException e) { throw new IOException("SHA-256 nije dostupan",e); }
    }
}
