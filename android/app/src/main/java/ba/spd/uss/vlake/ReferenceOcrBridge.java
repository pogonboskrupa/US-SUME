package ba.spd.uss.vlake;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bundled Latin OCR: fotografija se obrađuje na uređaju, bez preuzimanja modela. */
public final class ReferenceOcrBridge {
    private final WebView view;
    private final AtomicBoolean busy = new AtomicBoolean(false);
    public ReferenceOcrBridge(WebView view) { this.view = view; }
    public interface Callback { void done(JSONArray words, String error); }

    @JavascriptInterface public void recognize(String id, String dataUrl) {
        if (id == null || !id.matches("ref_[0-9]+")) return;
        if (dataUrl == null || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length() > 10000000) {
            reply(id, new JSONArray(), "Slika nije prihvaćena."); return;
        }
        if (!busy.compareAndSet(false, true)) { reply(id, new JSONArray(), "Prepoznavanje je već u toku."); return; }
        new Thread(() -> {
            Bitmap bitmap = null;
            try {
                byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || (long) bounds.outWidth * bounds.outHeight > 4000000L)
                    throw new IllegalArgumentException("Slika je prevelika.");
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalArgumentException("Slika nije čitljiva.");
                final Bitmap image = bitmap;
                recognizeImage(image, (words, error) -> { image.recycle(); busy.set(false); reply(id, words, error); });
            } catch (Exception | OutOfMemoryError e) {
                if (bitmap != null) bitmap.recycle(); busy.set(false); reply(id, new JSONArray(), "Prepoznavanje slike nije uspjelo.");
            }
        }, "DendroMap-reference-OCR").start();
    }
    private void reply(String id, JSONArray words, String error) {
        JSONObject result = new JSONObject();
        try { result.put("id", id); result.put("words", words); if (error != null) result.put("error", error); }
        catch (Exception ignored) { return; }
        view.post(() -> { if ("https://appassets.androidplatform.net/assets/index.html".equals(view.getUrl()))
            view.evaluateJavascript("window.ReferenceVlake&&window.ReferenceVlake.ocrReply(" + result + ")", null); });
    }
    public static void recognizeImage(Bitmap image, Callback callback) {
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        scan(recognizer, image, 0, new JSONArray(), callback);
    }
    private static void scan(TextRecognizer recognizer, Bitmap source, int turn, JSONArray words, Callback callback) {
        Matrix matrix = new Matrix(); matrix.postRotate(turn * 90);
        final Bitmap image;
        try { image = turn == 0 ? source : Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, false); }
        catch (Exception | OutOfMemoryError e) { recognizer.close(); callback.done(words, "Nema dovoljno memorije za OCR."); return; }
        recognizer.process(InputImage.fromBitmap(image, 0)).addOnCompleteListener(task -> {
            String error = null;
            if (task.isSuccessful()) {
                int lineId = 0;
                for (Text.TextBlock block : task.getResult().getTextBlocks()) for (Text.Line line : block.getLines()) {
                    for (Text.Element element : line.getElements()) {
                        Rect box = element.getBoundingBox(); if (box == null) continue;
                        float[] points = {box.left, box.top, box.right, box.top, box.right, box.bottom, box.left, box.bottom};
                        double x0 = Double.POSITIVE_INFINITY, y0 = x0, x1 = Double.NEGATIVE_INFINITY, y1 = x1;
                        for (int i = 0; i < points.length; i += 2) {
                            double x = points[i], y = points[i + 1], X, Y;
                            if (turn == 1) { X = y; Y = source.getHeight() - x; }
                            else if (turn == 2) { X = source.getWidth() - x; Y = source.getHeight() - y; }
                            else if (turn == 3) { X = source.getWidth() - y; Y = x; }
                            else { X = x; Y = y; }
                            x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
                        }
                        try { JSONObject word = new JSONObject(); word.put("text", element.getText()); word.put("x0", x0); word.put("y0", y0); word.put("x1", x1); word.put("y1", y1); word.put("line", turn + ":" + lineId); words.put(word); }
                        catch (Exception ignored) { }
                    }
                    lineId++;
                }
            } else error = "OCR model nije uspio pročitati sliku.";
            if (image != source) image.recycle();
            if (error != null || turn == 3) { recognizer.close(); callback.done(words, error); }
            else scan(recognizer, source, turn + 1, words, callback);
        });
    }
}
