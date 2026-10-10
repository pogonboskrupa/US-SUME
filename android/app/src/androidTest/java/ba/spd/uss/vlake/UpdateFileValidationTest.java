package ba.spd.uss.vlake;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class UpdateFileValidationTest {
    @Test public void wrongRangeCannotMixTwoApkParts() {
        assertTrue(UpdateFileValidation.validRange("bytes 10-19/20",10,20));
        assertFalse(UpdateFileValidation.validRange("bytes 0-9/20",10,20));
        assertFalse(UpdateFileValidation.validRange("bytes 10-29/30",10,20));
        assertFalse(UpdateFileValidation.validRange("bytes 10-20/20",10,20));
        assertFalse(UpdateFileValidation.validRange(null,10,20));
        assertFalse(UpdateFileValidation.validRange("bytes 10-19/*",10,20));
    }
    @Test public void sameLengthCorruptionIsRejectedOnDownloadAndCachedRetry() throws Exception {
        File f=File.createTempFile("apk-proof",".part",InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
        try {
            try (FileOutputStream out=new FileOutputStream(f)) {out.write("abc".getBytes(StandardCharsets.UTF_8));}
            String digest="sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
            assertTrue(UpdateFileValidation.matchesDigest(f,digest));
            try (FileOutputStream out=new FileOutputStream(f)) {out.write("abd".getBytes(StandardCharsets.UTF_8));}
            assertEquals(3,f.length());assertFalse(UpdateFileValidation.matchesDigest(f,digest));
            assertFalse(UpdateFileValidation.matchesDigest(f,"sha256:broken"));
            assertTrue(UpdateFileValidation.matchesDigest(f,""));
        } finally {f.delete();}
    }
}
