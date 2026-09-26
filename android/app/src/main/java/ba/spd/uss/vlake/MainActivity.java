package ba.spd.uss.vlake;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private WebView webView;
    // Statički — preživljava uništenje OVE Activity instance. Kad korisnik potpuno
    // zatvori app (swipe iz recent apps) dok snimanje traje, Android zove Activity
    // onDestroy() (task je uklonjen), ali PROCES ostaje živ jer GpsService (foreground
    // servis) i dalje radi u istom procesu. Ako bismo tad uništili WebView, JS/GPS
    // watch bi umro zajedno s Activity-jem — notifikacija bi i dalje pisala "snima"
    // dok se stvarno ništa ne bilježi. Umjesto toga, WebView se NAMJERNO ne uništava
    // (vidi onDestroy) dok je isRecordingActive true — nastavlja da izvršava JS u
    // pozadini, "osiroćen" bez Activity-ja. Kad korisnik ponovo otvori app, onCreate
    // ga prepozna i PONOVO ISKORISTI (ne pravi novi WebView, ne zove loadUrl) — JS
    // stanje snimanja (vlake[]/_tragPts/watchPosition) ostaje netaknuto.
    private static WebView sWebView;
    // Isti razlog kao sWebView: dok je snimanje aktivno kad se Activity uništi,
    // onDestroy() NE smije unregistrovati ovaj receiver (inače Pauza/Stop dugmad
    // na notifikaciji tiho prestanu raditi dok je app zatvoren). Statički, da
    // sljedeći onCreate() (ponovno otvaranje app-a dok se i dalje snima) prepozna
    // već-registrovani receiver i PONOVO GA ISKORISTI umjesto da registruje drugi
    // (dupli receiver = svaka notifikacijska akcija bi se izvršila dvaput).
    private static BroadcastReceiver sRecActionReceiver;
    private boolean reusedWebView = false;
    private ValueCallback<Uri[]> fileCallback;
    private WebViewAssetLoader assetLoader;
    private BroadcastReceiver recActionReceiver;

    private static final int REQ_FILE = 1;
    private static final int REQ_PERMS = 2;
    private static final int REQ_BG_LOC = 3;
    private static final int REQ_CAMERA = 4;
    private static final int REQ_CAPTURE = 5;
    private static final int REQ_CAPTURE_PERM = 6;
    private android.webkit.PermissionRequest pendingCameraRequest;
    private Uri pendingCaptureUri;
    private File pendingCaptureFile;
    private Intent pendingFallbackIntent;
    // Postavlja se preko GpsBridge dok GPS snimanje (vlaka/trag/pojas) traje.
    // WebView.onPause() je dokumentovano da "best-effort pauzira geolocation" —
    // ako se pozove dok se snima, navigator.geolocation.watchPosition() prestaje
    // primati nove tačke čim korisnik izađe iz app-a (ekran ugašen ili prebačen
    // na drugu app), pa snimanje vlake/traga/pojasa izgleda "prekinuto" iako je
    // foreground servis i dalje aktivan. Zato onPause() u Activity-ju MORA
    // preskočiti webView.onPause() dok je snimanje u toku.
    // STATIC (ne instance polje) — mora preživjeti uništenje ove Activity instance
    // dok je sWebView "osiroćen" u pozadini (vidi napomenu gore); nova Activity
    // instanca poslije ponovnog otvaranja app-a čita ISTU vrijednost.
    private static volatile boolean isRecordingActive = false;
    private static final String APP_URL =
            "https://appassets.androidplatform.net/assets/index.html";

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }

        if (sWebView != null) {
            // Ponovno otvaranje app-a dok je snimanje preživjelo u pozadini (vidi
            // napomenu kod sWebView) — iskoristi ISTI WebView, ne pravi novi i ne
            // zovi loadUrl (to bi resetovalo JS stanje i prekinulo snimanje).
            webView = sWebView;
            reusedWebView = true;
            ViewGroup oldParent = (ViewGroup) webView.getParent();
            if (oldParent != null) oldParent.removeView(webView);
        } else {
            webView = new WebView(this);
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            sWebView = webView;
        }
        // WebView ide u omotač kojem se donji padding podešava na visinu
        // tastature (vidi primijeniTastaturu). Direktno setContentView(webView)
        // + edge-to-edge/immersive = Android IGNORIŠE adjustResize, pa WebView
        // ostaje pune visine i sve što je prikačeno za dno (donji listovi,
        // dijalozi) završi ISPOD tastature.
        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        primijeniTastaturu(root);

        hideSystemUI();
        requestPermissions();
        // Uvijek rebinduj listenere/JS mostove na OVU (trenutnu) Activity instancu —
        // i kod ponovnog korištenja WebView-a, jer DownloadBridge/GpsBridge/ShareBridge/
        // WebViewClient/WebChromeClient su non-static inner klase koje interno drže
        // referencu na staru (uništenu) Activity instancu ako se ne obnove.
        setupWebView();
        registerRecActionReceiver();

        if (!reusedWebView) {
            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState);
            } else {
                webView.loadUrl(APP_URL);
            }
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AllowAllHostsInWebView"})
    private void setupWebView() {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(false);
        ws.setAllowUniversalAccessFromFileURLs(false);
        ws.setGeolocationEnabled(true);
        // LOAD_DEFAULT (ne LOAD_CACHE_ELSE_NETWORK!): LOAD_CACHE_ELSE_NETWORK koristi
        // keširan odgovor BEZ OBZIRA na starost — ignoriše Cache-Control/no-cache
        // zaglavlja čak i dok je internet dostupan. Za CDN biblioteke (Leaflet, turf...)
        // to je bezopasno, ali za Supabase API pozive (npr. "da li me je admin odobrio?")
        // znači da WebView zauvijek servira PRVI keširani odgovor umjesto svježeg —
        // korisnik registrovan na APK-u ostaje zaglavljen na "čeka se odobrenje" i
        // nakon što ga admin odobri na webu, jer APK nikad stvarno ne pita server
        // ponovo. LOAD_DEFAULT poštuje stvarna cache zaglavlja sa servera: CDN fajlovi
        // se i dalje keširaju (imaju long max-age), a Supabase odgovori (bez cache
        // zaglavlja ili no-cache) se uvijek dohvataju svježe kad ima interneta.
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setTextZoom(100);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.addJavascriptInterface(new DownloadBridge(), "AndroidDownload");
        webView.addJavascriptInterface(new GpsBridge(), "AndroidGps");
        webView.addJavascriptInterface(new ShareBridge(), "AndroidShare");
        webView.addJavascriptInterface(new UpdateBridge(), "AndroidUpdate");
        webView.addJavascriptInterface(new PrintBridge(), "AndroidPrint");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                    WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://appassets.androidplatform.net/")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // Reload/navigacija resetuje JS stanje (recOn/_tragOn/_dozGpsOn = false),
                // ali native isRecordingActive bi bez ovoga ostao zaglavljen na true —
                // onPause() bi ZAUVIJEK preskakao webView.onPause() (GPS + JS rade u
                // pozadini trajno = prazna baterija). Nova stranica = snimanje ne postoji.
                isRecordingActive = false;
                super.onPageStarted(view, url, favicon);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, true);
            }

            // getUserMedia({video:true}) za QR skener (dijeljenje pojaseva) — bez ovog
            // override-a WebView tiho odbija svaki kamera zahtjev, čak i ako app ima
            // CAMERA dozvolu u manifestu. Ako runtime dozvola još nije data, zatraži je
            // pa odgovori tek u onRequestPermissionsResult.
            @Override
            public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                boolean wantsCamera = false;
                for (String res : request.getResources()) {
                    if (android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) wantsCamera = true;
                }
                if (!wantsCamera) { request.deny(); return; }
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    pendingCameraRequest = request;
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                }
            }

            // Bez ovih override-a WebView za JS alert()/confirm() prikazuje SVOJ
            // default dijalog sa naslovom "The page at 'https://appassets...' says:"
            // (URL porijekla umjesto imena aplikacije) — zbunjujuće za korisnika jer
            // app nikad ne izgleda kao da je učitana sa "web stranice". Ovdje pravimo
            // identičan dijalog ali sa nazivom aplikacije kao naslovom.
            @Override
            public boolean onJsAlert(WebView view, String url, String message,
                    final android.webkit.JsResult result) {
                // WebView (i JS u njemu) namjerno ostaje živ dok se Activity gasi
                // (snimanje u pozadini) — alert() u tom prozoru bi bacio
                // BadTokenException pri show(). Otkaži i preskoči dijalog.
                if (isFinishing() || isDestroyed()) { result.cancel(); return true; }
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setTitle(getString(R.string.app_name))
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok,
                                (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message,
                    final android.webkit.JsResult result) {
                if (isFinishing() || isDestroyed()) { result.cancel(); return true; }
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setTitle(getString(R.string.app_name))
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok,
                                (dialog, which) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel,
                                (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView wv,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                // createIntent() je uvijek ACTION_GET_CONTENT (galerija/fajlovi) i
                // ignoriše <input capture> — bez ovoga "Kamera" otvara galeriju.
                if (fileChooserParams.isCaptureEnabled() && acceptsImages(fileChooserParams)) {
                    pendingFallbackIntent = intent;
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                        launchCameraCapture();
                    } else {
                        ActivityCompat.requestPermissions(MainActivity.this,
                                new String[]{Manifest.permission.CAMERA}, REQ_CAPTURE_PERM);
                    }
                    return true;
                }
                return launchFilePicker(intent);
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent,
                    String contentDisposition, String mimetype, long contentLength) {
                if (url.startsWith("blob:")) {
                    webView.evaluateJavascript(
                        "(function(){" +
                        "var x=new XMLHttpRequest();" +
                        "x.open('GET','" + url.replace("'", "\\'") + "',true);" +
                        "x.responseType='blob';" +
                        "x.onload=function(){" +
                        "  var r=new FileReader();" +
                        "  r.onload=function(){" +
                        "    var fn=document.querySelector('a[download]');" +
                        "    var name=fn?fn.download:'download';" +
                        "    AndroidDownload.save(name,r.result);" +
                        "  };" +
                        "  r.readAsDataURL(x.response);" +
                        "};" +
                        "x.send();" +
                        "})()", null);
                }
            }
        });

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    }

    class DownloadBridge {
        @JavascriptInterface
        public void save(String filename, String dataUrl) {
            try {
                String base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
                byte[] data = Base64.decode(base64, Base64.DEFAULT);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE,
                            guessMime(filename));
                    values.put(MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(data);
                            os.close();
                        }
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS);
                    File file = new File(dir, filename);
                    FileOutputStream fos = new FileOutputStream(file);
                    fos.write(data);
                    fos.close();
                }

                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "Sačuvano u Downloads: " + filename,
                        Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "Greška pri čuvanju: " + e.getMessage(),
                        Toast.LENGTH_SHORT).show());
            }
        }

        private String guessMime(String filename) {
            if (filename.endsWith(".kml")) return "application/vnd.google-earth.kml+xml";
            if (filename.endsWith(".gpx")) return "application/gpx+xml";
            if (filename.endsWith(".geojson")) return "application/geo+json";
            if (filename.endsWith(".json")) return "application/json";
            if (filename.endsWith(".csv")) return "text/csv";
            if (filename.endsWith(".txt")) return "text/plain";
            return "application/octet-stream";
        }
    }

    // ── Auto-update: preuzmi i instaliraj najnoviji APK direktno iz app-a ──
    // Zašto postoji: "Ažuriraj aplikaciju" u Meniju je ranije za APK korisnike
    // samo otvarala GitHub Actions listu radnji — korisnik je morao ručno naći
    // zadnji uspješan build, prijaviti se na GitHub, skinuti .zip artefakt
    // (Actions artefakti traže login i ističu za 90 dana), raspakovati ga i
    // instalirati. GitHub Release je JAVNO dostupan preko stabilnog URL-a bez
    // prijave (codex-webview.yml ga objavljuje/ažurira poslije svakog uspješnog
    // builda) — ovaj most ga nalazi preko API-ja i instalira jednim tapom.
    //
    // /releases/latest NIJE korišten namjerno — taj GitHub endpoint EKSPLICITNO
    // isključuje prerelease objave, a CI ovdje objavljuje baš prerelease (debug
    // build, ne zvaničan release). Zato se čita obična lista (/releases,
    // sortirana najnovije-prvo) i uzima prvi element.
    // Prekid koji je tražio KORISNIK (dugme Otkaži) — odvojen od mrežnog kvara da
    // se ne bi ponovo pokušavao i da se ne javlja kao greška veze.
    private static class OtkazanoException extends IOException {
        OtkazanoException() { super("otkazano"); }
    }

    class UpdateBridge {
        private static final String RELEASES_URL =
                "https://api.github.com/repos/pogonboskrupa/US-SUME/releases?per_page=1";
        // Terenska veza zna pući usred preuzimanja (slab signal, prelaz Wi-Fi <->
        // mobilni, promjena ćelije) — to je bio uzrok "SocketException". Svaki
        // sljedeći pokušaj NASTAVLJA od već preuzetog bajta (HTTP Range), ne od nule.
        private static final int MAX_POKUSAJA = 6;
        private static final long NAPREDAK_MS = 300;
        private final java.util.concurrent.atomic.AtomicBoolean radi =
                new java.util.concurrent.atomic.AtomicBoolean(false);
        private volatile boolean otkazano = false;
        private volatile boolean preuzimanjePocelo = false;
        private long zadnjiNapredak = 0;

        @JavascriptInterface
        public void checkAndInstall() {
            if (!radi.compareAndSet(false, true)) return;
            otkazano = false;
            preuzimanjePocelo = false;
            new Thread(() -> {
                PowerManager.WakeLock wl = null;
                try {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DendroMap:update");
                        wl.acquire(15 * 60 * 1000L);
                    }
                    tok();
                } catch (OtkazanoException e) {
                    napredak("otkazano", 0, 0, null, "Preuzimanje otkazano");
                } catch (Exception e) {
                    napredak("greska", 0, 0, null, opisGreske(e));
                } finally {
                    if (wl != null && wl.isHeld()) { try { wl.release(); } catch (Exception ignored) {} }
                    radi.set(false);
                }
            }, "DendroMap-update").start();
        }

        @JavascriptInterface
        public void cancel() { otkazano = true; }

        private void tok() throws IOException, org.json.JSONException {
            napredak("provjera", 0, 0, null, "Provjeravam novu verziju…");
            org.json.JSONObject rel = dohvatiJson(RELEASES_URL);
            if (rel == null) {
                napredak("greska", 0, 0, null, "Ne mogu provjeriti novu verziju — nema interneta ili GitHub ne odgovara.");
                return;
            }
            String tag = rel.optString("tag_name", "");
            String verNova = tag.startsWith("v") ? tag.substring(1) : tag;
            // NE BuildConfig.VERSION_NAME — od AGP 8.0 se BuildConfig ne generiše
            // podrazumijevano. PackageManager vraća verziju STVARNO instaliranog APK-a;
            // "-debug" sufiks čisti parseSegment().
            String verTrenutna = "0";
            try {
                verTrenutna = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception ignored) {}
            if (verNova.isEmpty() || !jeNovija(verNova, verTrenutna)) {
                napredak("najnovija", 0, 0, verTrenutna, "Već imaš najnoviju verziju (v" + verTrenutna + ")");
                return;
            }

            String apkUrl = null;
            long apkVelicina = -1;
            org.json.JSONArray assets = rel.optJSONArray("assets");
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    org.json.JSONObject a = assets.getJSONObject(i);
                    if (a.optString("name", "").endsWith(".apk")) {
                        apkUrl = a.optString("browser_download_url", null);
                        apkVelicina = a.optLong("size", -1);
                        break;
                    }
                }
            }
            if (apkUrl == null) {
                napredak("greska", 0, 0, verNova, "Nova verzija v" + verNova + " postoji, ali APK nije pronađen u objavi.");
                return;
            }

            File dir = new File(getCacheDir(), "update");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("ne mogu napraviti folder za preuzimanje");
            File apk = new File(dir, "US-SUME-v" + verNova + ".apk");
            File dio = new File(dir, apk.getName() + ".part");
            ocistiStare(dir, apk.getName(), dio.getName());

            // Već preuzet i potpun (npr. korisnik je otkazao Android instalaciju pa
            // tapnuo "Instaliraj ponovo") — ne skida se ponovo.
            boolean gotov = apk.exists() && (apkVelicina <= 0 || apk.length() == apkVelicina);
            if (!gotov) {
                if (apk.exists()) //noinspection ResultOfMethodCallIgnored
                    apk.delete();
                preuzmiSaNastavkom(apkUrl, dio, apkVelicina, verNova);
                // Veza koja se tiho zatvori prije kraja daje NEPOTPUN APK, a Android na
                // njemu javi samo "greška pri parsiranju paketa" — zato provjera veličine.
                if (apkVelicina > 0 && dio.length() != apkVelicina) {
                    throw new IOException("preuzet fajl nije potpun (" + dio.length() + " od " + apkVelicina + " B)");
                }
                if (!dio.renameTo(apk)) throw new IOException("ne mogu spremiti preuzeti fajl");
            }
            long v = apk.length();
            napredak("instalacija", v, v, verNova, "Otvaram Android instalaciju…");
            final String ver = verNova;
            runOnUiThread(() -> instalirajApk(apk, ver));
        }

        private void preuzmiSaNastavkom(String url, File dio, long ukupno, String ver) throws IOException {
            preuzimanjePocelo = true;
            IOException zadnja = null;
            for (int pokusaj = 1; pokusaj <= MAX_POKUSAJA; pokusaj++) {
                if (otkazano) throw new OtkazanoException();
                try {
                    preuzmiDio(url, dio, ukupno, ver, pokusaj);
                    return;
                } catch (OtkazanoException e) {
                    throw e;
                } catch (IOException e) {
                    zadnja = e;
                }
                if (pokusaj == MAX_POKUSAJA) break;
                long cekaj = Math.min(2000L << (pokusaj - 1), 16000L);
                napredak("ponovo", dio.length(), ukupno, ver,
                        "Veza prekinuta — nastavljam za " + (cekaj / 1000) + " s (pokušaj "
                                + (pokusaj + 1) + "/" + MAX_POKUSAJA + ")");
                for (long t = 0; t < cekaj; t += 250) {
                    if (otkazano) throw new OtkazanoException();
                    try { Thread.sleep(250); } catch (InterruptedException ie) { throw new OtkazanoException(); }
                }
            }
            throw zadnja != null ? zadnja : new IOException("preuzimanje nije uspjelo");
        }

        private void preuzmiDio(String urlStr, File dio, long ukupno, String ver, int pokusaj) throws IOException {
            long vec = dio.exists() ? dio.length() : 0;
            if (ukupno > 0 && vec > ukupno) {
                //noinspection ResultOfMethodCallIgnored
                dio.delete();
                vec = 0;
            }
            if (ukupno > 0 && vec == ukupno) return;

            HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
            try {
                // Asset preusmjerava na CDN (objects.githubusercontent.com) — GET
                // redirect prati sam HttpURLConnection, Range zaglavlje ostaje.
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "DendroMap-Android");
                if (vec > 0) c.setRequestProperty("Range", "bytes=" + vec + "-");
                int status = c.getResponseCode();
                boolean nastavak;
                if (status == 206) {
                    nastavak = true;
                } else if (status == 200) {
                    // Server nije poslušao Range — kreće se ispočetka, bez miješanja
                    // starog i novog sadržaja u istom fajlu.
                    nastavak = false;
                    vec = 0;
                } else if (status == 416) {
                    //noinspection ResultOfMethodCallIgnored
                    dio.delete();
                    throw new IOException("HTTP 416");
                } else {
                    throw new IOException("HTTP " + status);
                }
                long ocekivano = ukupno > 0 ? ukupno
                        : (c.getContentLengthLong() > 0 ? vec + c.getContentLengthLong() : -1);
                long primljeno = vec;
                napredak("preuzimanje", primljeno, ocekivano, ver,
                        pokusaj > 1 ? "Nastavljam preuzimanje…" : "Preuzimam…");
                try (InputStream is = c.getInputStream();
                     FileOutputStream fos = new FileOutputStream(dio, nastavak)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = is.read(buf)) > 0) {
                        if (otkazano) throw new OtkazanoException();
                        fos.write(buf, 0, n);
                        primljeno += n;
                        long sad = System.currentTimeMillis();
                        if (sad - zadnjiNapredak >= NAPREDAK_MS) {
                            zadnjiNapredak = sad;
                            napredak("preuzimanje", primljeno, ocekivano, ver, "Preuzimam…");
                        }
                    }
                }
                if (ocekivano > 0 && primljeno < ocekivano) {
                    throw new IOException("veza zatvorena prije kraja");
                }
                napredak("preuzimanje", primljeno, ocekivano > 0 ? ocekivano : primljeno, ver, "Preuzeto");
            } finally {
                c.disconnect();
            }
        }

        private void ocistiStare(File dir, String zadrzi1, String zadrzi2) {
            File[] svi = dir.listFiles();
            if (svi == null) return;
            for (File f : svi) {
                String ime = f.getName();
                if (!ime.equals(zadrzi1) && !ime.equals(zadrzi2)) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
        }

        // throws org.json.JSONException: provjeren izuzetak u Androidovom org.json-u,
        // javac ga ne pušta neprijavljenog (vidi CLAUDE.md "Java strana").
        private org.json.JSONObject dohvatiJson(String urlStr) throws IOException, org.json.JSONException {
            URL u = new URL(urlStr);
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            try {
                c.setConnectTimeout(15000);
                c.setReadTimeout(15000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                c.setRequestProperty("User-Agent", "DendroMap-Android");
                int status = c.getResponseCode();
                if (status != 200) return null;
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                try (InputStream is = c.getInputStream()) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                }
                // /releases (lista) vraća JSON NIZ — uzmi prvi (najnoviji) element.
                org.json.JSONArray arr = new org.json.JSONArray(bos.toString("UTF-8"));
                return arr.length() > 0 ? arr.getJSONObject(0) : null;
            } finally {
                c.disconnect();
            }
        }

        private void instalirajApk(File apk, String ver) {
            long v = apk.length();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getPackageManager().canRequestPackageInstalls()) {
                napredak("dozvola", v, v, ver,
                        "Dozvoli instalaciju iz ove aplikacije, vrati se i tapni Nastavi.");
                try {
                    startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())));
                } catch (Exception ignored) {}
                return;
            }
            try {
                Uri uri = FileProvider.getUriForFile(MainActivity.this,
                        getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                napredak("instalacija", v, v, ver,
                        "Potvrdi \"Instaliraj\" u Android prozoru. Aplikacija se zatim sama zatvori i otvori novu verziju.");
            } catch (Exception e) {
                napredak("greska", v, v, ver, "Ne mogu otvoriti Android instalaciju: " + e.getClass().getSimpleName());
            }
        }

        private String opisGreske(Exception e) {
            String ime = e.getClass().getSimpleName();
            if (e instanceof java.net.UnknownHostException)
                return "Nema interneta — server nije dostupan. Provjeri vezu pa pokušaj ponovo.";
            if (e instanceof java.net.SocketTimeoutException)
                return "Veza je prespora — server ne odgovara na vrijeme. Pokušaj ponovo na boljem signalu.";
            if (e instanceof java.net.SocketException || e instanceof javax.net.ssl.SSLException)
                return preuzimanjePocelo
                        ? "Veza je pukla tokom preuzimanja (" + ime + "). Preuzeti dio je sačuvan — Pokušaj ponovo nastavlja odakle je stalo."
                        : "Veza je pukla (" + ime + ") — provjeri signal pa pokušaj ponovo.";
            if (e instanceof org.json.JSONException)
                return "GitHub je vratio neočekivan odgovor. Pokušaj ponovo za par minuta.";
            String m = e.getMessage();
            return "Ažuriranje nije uspjelo: " + (m != null && !m.isEmpty() ? m : ime);
        }

        // Poredi "X.Y.Z" segment po segment (numerički, ne leksikografski).
        private boolean jeNovija(String a, String b) {
            String[] pa = a.split("\\.");
            String[] pb = b.split("\\.");
            for (int i = 0; i < Math.max(pa.length, pb.length); i++) {
                int va = i < pa.length ? parseSegment(pa[i]) : 0;
                int vb = i < pb.length ? parseSegment(pb[i]) : 0;
                if (va != vb) return va > vb;
            }
            return false;
        }

        private int parseSegment(String s) {
            try { return Integer.parseInt(s.replaceAll("[^0-9]", "")); }
            catch (Exception e) { return 0; }
        }

        private void napredak(String faza, long primljeno, long ukupno, String ver, String poruka) {
            String json;
            try {
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("faza", faza);
                o.put("primljeno", primljeno);
                o.put("ukupno", ukupno);
                o.put("verzija", ver == null ? "" : ver);
                o.put("poruka", poruka == null ? "" : poruka);
                json = o.toString();
            } catch (org.json.JSONException e) {
                json = "{\"faza\":\"greska\",\"poruka\":\"\"}";
            }
            final String js = "if(typeof _azurirajNapredak==='function')_azurirajNapredak(" + jsStr(json)
                    + ");else if(typeof _azurirajStatus==='function')_azurirajStatus(" + jsStr(poruka) + ")";
            runOnUiThread(() -> {
                if (webView == null) return;
                webView.evaluateJavascript(js, null);
            });
        }

        // Navodnik/backslash/ne-ASCII iz poruke bi razbio ubačeni JS bez escape-ovanja.
        private String jsStr(String s) {
            if (s == null) return "null";
            StringBuilder b = new StringBuilder("\"");
            for (int i = 0; i < s.length(); i++) {
                char ch = s.charAt(i);
                if (ch == '"' || ch == '\\') b.append('\\').append(ch);
                else if (ch == '\n') b.append("\\n");
                else if (ch < 0x20 || ch > 0x7e) b.append(String.format("\\u%04x", (int) ch));
                else b.append(ch);
            }
            return b.append('"').toString();
        }
    }

    // navigator.share() u Android WebView-u (za razliku od Chrome-a) ne otvara
    // sistemski share-sheet za fajlove — canShare({files:[...]}) tiho vraća
    // false, pa JS strana bez ovog mosta nema kako da ponudi Viber/Messenger/
    // Bluetooth. Ovdje se koristi VEĆ postojeći FileProvider (isti kao za
    // kameru) da se privremeni fajl u cache-u podijeli preko pravog
    // Intent.ACTION_SEND chooser-a.
    class ShareBridge {
        @JavascriptInterface
        public void shareFile(String filename, String dataUrl, String title, String text) {
            try {
                String base64 = dataUrl.substring(dataUrl.indexOf(",") + 1);
                byte[] data = Base64.decode(base64, Base64.DEFAULT);

                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(data);
                fos.close();

                Uri uri = FileProvider.getUriForFile(MainActivity.this,
                        getPackageName() + ".fileprovider", file);
                String mime = guessMime(filename);

                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType(mime);
                sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
                if (text != null) sendIntent.putExtra(Intent.EXTRA_TEXT, text);
                if (title != null) sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(sendIntent,
                        title != null ? title : "Pošalji");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> startActivity(chooser));
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "Greška pri dijeljenju: " + e.getMessage(),
                        Toast.LENGTH_SHORT).show());
            }
        }

        private String guessMime(String filename) {
            if (filename.endsWith(".kml")) return "application/vnd.google-earth.kml+xml";
            if (filename.endsWith(".gpx")) return "application/gpx+xml";
            if (filename.endsWith(".geojson")) return "application/geo+json";
            if (filename.endsWith(".json")) return "application/json";
            return "application/octet-stream";
        }
    }

    // Android WebView NE implementira window.print() — poziv je tiha no-op
    // operacija, pa "Print / štampanje" u APK-u nije radilo baš ništa. Štampa
    // ide kroz sistemski PrintManager nad samim WebView sadržajem (poštuje
    // @media print CSS), a korisnik u dijalogu bira štampač ili "Sačuvaj kao
    // PDF". Format i orijentacija se predlažu iz JS-a; dijalog ih i dalje
    // dozvoljava promijeniti.
    class PrintBridge {
        @JavascriptInterface
        public void print(String jobName, String format) {
            runOnUiThread(() -> {
                try {
                    String ime = (jobName == null || jobName.trim().isEmpty()) ? "Dendro Map" : jobName.trim();
                    String f = format == null ? "A4L" : format;
                    PrintAttributes.MediaSize ms = f.startsWith("A3")
                            ? PrintAttributes.MediaSize.ISO_A3 : PrintAttributes.MediaSize.ISO_A4;
                    ms = f.endsWith("P") ? ms.asPortrait() : ms.asLandscape();
                    PrintAttributes attrs = new PrintAttributes.Builder()
                            .setMediaSize(ms)
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(ime);
                    pm.print(ime, adapter, attrs);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this,
                            "Štampanje nije uspjelo: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    class GpsBridge {
        @JavascriptInterface
        public void startRecording(String title) {
            isRecordingActive = true;
            requestBackgroundLocationIfNeeded();
            Intent intent = new Intent(MainActivity.this, GpsService.class);
            intent.putExtra("title", title != null ? title : "GPS Snimanje");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        }

        @JavascriptInterface
        public void stopRecording() {
            isRecordingActive = false;
            Intent intent = new Intent(MainActivity.this, GpsService.class);
            intent.setAction("stop");
            startService(intent);
            // Ako je OVA Activity već uništena (korisnik je zatvorio/swipe-ovao app
            // dok je snimanje trajalo — WebView je bio namjerno pošteđen u onDestroy,
            // vidi napomenu kod sWebView), niko drugi neće pozvati webView.destroy()
            // jer je taj poziv baš tad bio preskočen. Sad kad je snimanje stvarno
            // gotovo, oslobodi ga — inače ostaje "osiroćen" u memoriji zauvijek.
            if (isFinishing() || isDestroyed()) {
                runOnUiThread(() -> {
                    if (webView != null) { webView.destroy(); }
                    if (sWebView == webView) sWebView = null;
                    if (recActionReceiver != null) {
                        try { unregisterReceiver(recActionReceiver); } catch (Exception ignored) {}
                    }
                    sRecActionReceiver = null;
                });
            }
        }

        @JavascriptInterface
        public void updateNotification(String title, String body) {
            Intent intent = new Intent(MainActivity.this, GpsService.class);
            intent.setAction("update");
            intent.putExtra("title", title);
            intent.putExtra("body", body);
            startService(intent);
        }

        @JavascriptInterface
        public boolean hasBackgroundLocation() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
            return ContextCompat.checkSelfPermission(MainActivity.this,
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
        }

        // Doze/App Standby (stock Android) i OEM "battery manager"-i (Xiaomi/Samsung/
        // Huawei i sl.) znaju ubiti CIJELI proces — foreground servis i sve — kad
        // procijene da je app "u pozadini", npr. baš kad stigne telefonski poziv i
        // sistemu zatreba RAM/prioritet za njega. WebView-preživljavanje i native GPS
        // bafer (GpsService) štite od Activity-only uništenja, ali ne od ovoga — ako
        // proces umre, umre i native bafer. Izuzeće od Doze/App Standby (stock Android
        // API) je jedina prenosiva odbrana; OEM-specifične "autostart/protected apps"
        // postavke se ne mogu tražiti programski, samo standardnim Android putem.
        @JavascriptInterface
        public boolean hasBatteryOptExemption() {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return true;
            return pm.isIgnoringBatteryOptimizations(getPackageName());
        }

        @JavascriptInterface
        public void requestBatteryOptExemption() {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception e) {
                // Neki OEM-i blokiraju direktni zahtjev — otvori opću listu izuzeća
                // umjesto da korisnik ostane bez ijedne opcije.
                try {
                    startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignored) {}
            }
        }

        // Poziva se sinhrono iz JS-a (visibilitychange, app opet vidljiv) — vraća
        // sve tačke koje je GpsService prikupio preko native LocationManager-a dok
        // je WebView bio "osiroćen"/bez prozora (vidi napomenu kod sWebView i kod
        // GpsService.BUFFER_LOCK). Čitanje rotira fajl u pending; briše ga tek
        // zaseban ack nakon trajnog JS journala. Metoda ima povratnu vrijednost
        // pa je WebView poziva sinhrono i odmah dobija JSON paket.
        @JavascriptInterface
        public String readNativeBuffer() {
            try {
                String[] batch = new NativeGpsBuffer(getFilesDir()).read();
                return new org.json.JSONObject().put("token", batch[0]).put("raw", batch[1]).toString();
            } catch (Exception e) { return ""; } // no ack, file remains intact
        }

        @JavascriptInterface
        public boolean ackNativeBuffer(String token) {
            try { return new NativeGpsBuffer(getFilesDir()).ack(token); }
            catch (IOException e) { return false; }
        }

    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private void registerRecActionReceiver() {
        if (sRecActionReceiver != null) {
            // Već registrovan (preživio iz prethodne Activity instance dok je
            // snimanje trajalo) — reuse, ne registruj drugi. onReceive ionako
            // uvijek čita TRENUTNI webView field, pa ostaje ispravan.
            recActionReceiver = sRecActionReceiver;
            return;
        }
        recActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("action");
                if (action != null && webView != null) {
                    runOnUiThread(() -> webView.evaluateJavascript(
                        "if(typeof _nativeRecAction==='function')_nativeRecAction('" + action + "')",
                        null));
                }
            }
        };
        sRecActionReceiver = recActionReceiver;
        IntentFilter filter = new IntentFilter("ba.spd.uss.vlake.REC_ACTION");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(recActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(recActionReceiver, filter);
        }
    }

    private void requestBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        if (ContextCompat.checkSelfPermission(this,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED) return;
        if (ContextCompat.checkSelfPermission(this,
                Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                REQ_BG_LOC);
    }

    private void requestPermissions() {
        String[] perms;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms = new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.POST_NOTIFICATIONS
            };
        } else {
            perms = new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            };
        }

        boolean needRequest = false;
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p)
                    != PackageManager.PERMISSION_GRANTED) {
                needRequest = true;
                break;
            }
        }
        if (needRequest) {
            ActivityCompat.requestPermissions(this, perms, REQ_PERMS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
            @NonNull String[] permissions, @NonNull int[] grantResults) {
        if (requestCode == REQ_PERMS) {
            for (int i = 0; i < permissions.length; i++) {
                if (permissions[i].equals(Manifest.permission.ACCESS_FINE_LOCATION)
                        && grantResults[i] != PackageManager.PERMISSION_GRANTED) {
                    Toast.makeText(this,
                            "GPS dozvola je potrebna za snimanje vlaka",
                            Toast.LENGTH_LONG).show();
                }
            }
        } else if (requestCode == REQ_CAMERA) {
            if (pendingCameraRequest != null) {
                boolean granted = grantResults.length > 0
                        && grantResults[0] == PackageManager.PERMISSION_GRANTED;
                if (granted) {
                    pendingCameraRequest.grant(pendingCameraRequest.getResources());
                } else {
                    pendingCameraRequest.deny();
                    Toast.makeText(this,
                            "Dozvola za kameru je potrebna za skeniranje QR koda",
                            Toast.LENGTH_LONG).show();
                }
                pendingCameraRequest = null;
            }
        } else if (requestCode == REQ_CAPTURE_PERM) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                launchCameraCapture();
            } else {
                Toast.makeText(this,
                        "Bez dozvole za kameru — otvaram galeriju",
                        Toast.LENGTH_LONG).show();
                launchFallbackPicker();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_CAPTURE) {
            Uri uri = pendingCaptureUri;
            File file = pendingCaptureFile;
            pendingCaptureUri = null;
            pendingCaptureFile = null;
            pendingFallbackIntent = null;
            boolean ok = resultCode == RESULT_OK && uri != null && file != null && file.length() > 0;
            deliverFileResult(ok ? new Uri[]{uri} : null);
            return;
        }
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    results = new Uri[n];
                    for (int i = 0; i < n; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getDataString() != null) {
                    results = new Uri[]{Uri.parse(data.getDataString())};
                }
            }
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }

    private static boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String t : types) {
            if (t == null || t.isEmpty() || t.startsWith("image/") || t.equals("*/*")) return true;
        }
        return false;
    }

    private boolean launchFilePicker(Intent intent) {
        try {
            startActivityForResult(intent, REQ_FILE);
            return true;
        } catch (Exception e) {
            deliverFileResult(null);
            Toast.makeText(this, "Ne mogu otvoriti birač fajlova", Toast.LENGTH_SHORT).show();
            return false;
        }
    }

    // Puna rezolucija ide u fajl preko FileProvider-a (EXTRA_OUTPUT); bez toga
    // kamera vraća samo thumbnail u data extra, a WebView-u treba content:// URI.
    private void launchCameraCapture() {
        try {
            File dir = new File(getCacheDir(), "captures");
            if (!dir.exists() && !dir.mkdirs()) throw new java.io.IOException("mkdirs");
            File[] old = dir.listFiles();
            if (old != null) {
                for (File f : old) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
            pendingCaptureFile = new File(dir, "foto_" + System.currentTimeMillis() + ".jpg");
            pendingCaptureUri = FileProvider.getUriForFile(
                    this, getPackageName() + ".fileprovider", pendingCaptureFile);
            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, pendingCaptureUri);
            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(cam, REQ_CAPTURE);
        } catch (Exception e) {
            pendingCaptureUri = null;
            pendingCaptureFile = null;
            Toast.makeText(this, "Kamera nije dostupna — otvaram galeriju", Toast.LENGTH_SHORT).show();
            launchFallbackPicker();
        }
    }

    private void launchFallbackPicker() {
        Intent fb = pendingFallbackIntent;
        pendingFallbackIntent = null;
        if (fb != null) launchFilePicker(fb);
        else deliverFileResult(null);
    }

    private void deliverFileResult(Uri[] results) {
        if (fileCallback != null) {
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }

    /**
     * adjustResize u manifestu NE radi uz setDecorFitsSystemWindows(false)
     * (API 30+) ni uz immersive SYSTEM_UI_FLAG_FULLSCREEN (starije verzije) —
     * prozor se tada ne smanjuje kad se pojavi tastatura. Umjesto toga se čita
     * IME inset i za njegovu visinu podigne dno omotača: WebView postane niži,
     * CSS viewport se skupi i position:fixed/bottom:0 elementi prirodno stanu
     * IZNAD tastature — bez ijedne izmjene u web kodu po elementu.
     */
    private void primijeniTastaturu(View root) {
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            int dno = Math.max(0, ime.bottom);
            if (v.getPaddingBottom() != dno) v.setPadding(0, 0, 0, dno);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void hideSystemUI() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        hideSystemUI();
    }

    @Override
    protected void onPause() {
        // Dok traje GPS snimanje NE smijemo pauzirati WebView — Android
        // dokumentacija za WebView.onPause() eksplicitno navodi da pauzira i
        // geolocation, što bi prekinulo watchPosition() čim korisnik izađe iz
        // app-a. Foreground servis (GpsService) + partial wake lock drže CPU
        // budnim, a nepauzirani WebView drži JS/GPS watch živim u pozadini.
        if (!isRecordingActive) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        // Isto kao WebView ispod — dok snimanje traje, receiver MORA ostati
        // registrovan da Pauza/Stop dugmad na notifikaciji i dalje rade dok je
        // app zatvoren (vidi napomenu kod sRecActionReceiver).
        if (recActionReceiver != null && !isRecordingActive) {
            try { unregisterReceiver(recActionReceiver); } catch (Exception ignored) {}
            sRecActionReceiver = null;
        }
        // Dok snimanje traje NAMJERNO ne uništavamo WebView (vidi napomenu kod
        // sWebView) — Activity se gasi (npr. swipe iz recent apps), ali proces
        // ostaje živ zbog GpsService foreground servisa, i JS/GPS watch treba
        // nastaviti raditi u pozadini dok korisnik ne zaustavi snimanje ili
        // ponovo otvori app. webView.destroy() se tad odgađa do stvarnog kraja
        // snimanja (vidi GpsBridge.stopRecording) ili do sljedećeg onCreate-a
        // koji ponovo iskoristi isti WebView.
        if (webView != null && !isRecordingActive) {
            webView.destroy();
            sWebView = null;
        }
        super.onDestroy();
    }
}
