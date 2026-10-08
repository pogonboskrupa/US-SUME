package ba.spd.uss.vlake;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;
import android.util.Xml;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.*;
import java.util.concurrent.Executors;

/** Public KML only; transfer off the UI thread, then stream a verified local file to WebView. */
final class KmlDownloads implements WebViewAssetLoader.PathHandler {
    static final long MAX_BYTES=32L*1024*1024;
    interface Provider {JSONArray fetch() throws Exception;}
    private final Provider provider;
    private final MapDownloads.ConnectionFactory transport;
    private final SharedPreferences prefs;
    private final File dir;
    private final java.util.concurrent.ExecutorService commands=Executors.newSingleThreadExecutor();
    private JSONArray catalog;
    KmlDownloads(Context c){this(c,MapDownloadCatalog::fetchFolderRows,MapDownloads::connection,"drive-kml-v1");}
    KmlDownloads(Context c,Provider provider,MapDownloads.ConnectionFactory transport,String storage){
        this.provider=provider;this.transport=transport;this.prefs=c.getSharedPreferences(storage,Context.MODE_PRIVATE);
        dir=new File(c.getCacheDir(),storage);dir.mkdirs();
        try{catalog=new JSONArray(prefs.getString("catalog","[]"));}catch(Exception e){catalog=new JSONArray();}
    }
    static JSONArray parse(JSONArray rows) throws Exception {
        JSONArray files=new JSONArray();Set<String> ids=new HashSet<>();
        for(int i=0;i<rows.length();i++){
            JSONArray row=rows.getJSONArray(i);if(row.length()<14)throw new IOException("Nepotpun pregled foldera");
            JSONArray parents=row.optJSONArray(1);boolean own=false;
            if(parents!=null)for(int k=0;k<parents.length();k++)if(MapDownloadCatalog.FOLDER_ID.equals(parents.optString(k)))own=true;
            String id=row.optString(0),name=row.optString(2).trim(),mime=row.optString(3).toLowerCase(Locale.ROOT);long size=row.optLong(13,-1);
            if(!own||mime.startsWith("application/vnd.google-apps.")||!(name.toLowerCase(Locale.ROOT).endsWith(".kml")||mime.equals("application/vnd.google-earth.kml+xml")))continue;
            if(!id.matches("[\\w-]{10,100}")||name.isEmpty()||name.length()>240||name.matches("(?s).*[\\p{Cntrl}/\\\\].*")||size<=0)continue;
            if(ids.add(id))files.put(new JSONObject().put("id",id).put("name",name).put("size",size).put("tooLarge",size>MAX_BYTES));
        }
        List<JSONObject> sorted=new ArrayList<>();for(int i=0;i<files.length();i++)sorted.add(files.getJSONObject(i));
        sorted.sort(Comparator.comparing(o->o.optString("name").toLowerCase(Locale.ROOT)));return new JSONArray(sorted);
    }
    synchronized JSONObject action(JSONObject msg) throws Exception {
        String type=msg.getString("type");
        if(type.equals("list")){
            String error="";
            if(msg.optBoolean("refresh"))try{
                JSONArray fresh=parse(provider.fetch());
                if(!prefs.edit().putString("catalog",fresh.toString()).putLong("updated",System.currentTimeMillis()).commit())throw new IOException();catalog=fresh;
            }catch(Exception e){error="Ne mogu osvježiti KML fajlove. Provjeri internet i javni pristup folderu.";}
            return new JSONObject().put("ok",error.isEmpty()||catalog.length()>0).put("files",catalog).put("updated",prefs.getLong("updated",0)).put("stale",!error.isEmpty()).put("error",error);
        }
        String id=msg.getString("sourceId");if(!id.matches("[\\w-]{10,100}"))throw new IOException("Nevažeći fajl");
        File saved=new File(dir,id+".kml");
        if(type.equals("release")){saved.delete();return new JSONObject().put("ok",true);}
        if(!type.equals("download"))throw new IOException("Nepoznata radnja");
        JSONObject source=null;for(int i=0;i<catalog.length();i++)if(id.equals(catalog.getJSONObject(i).optString("id")))source=catalog.getJSONObject(i);
        if(source==null)throw new IOException("KML nije u folderu KARTA APP. Osvježi popis.");
        long size=source.getLong("size");if(size>MAX_BYTES)throw new IOException("KML je veći od 32 MB. Podijeli ga na manje slojeve.");
        if(saved.isFile())try{validate(saved,size);}catch(Exception e){saved.delete();}
        if(!saved.isFile()){
            File partial=new File(dir,id+".part");String url="https://drive.google.com/uc?export=download&id="+id;
            try{
                boolean complete=false;
                for(int attempt=0;attempt<3;attempt++){
                    HttpURLConnection c=transport.open(url,false);
                    try{
                        if(String.valueOf(c.getContentType()).toLowerCase(Locale.ROOT).contains("text/html")){
                            String html=MapDownloads.readHtml(c),lower=html.toLowerCase(Locale.ROOT);
                            if(lower.contains("quota exceeded")||lower.contains("too many users")||lower.contains("downloadquotaexceeded"))throw MapDownloads.driveError(html);
                            try{url=MapDownloads.confirmation(html,id);}catch(Exception e){throw MapDownloads.driveError(html);}continue;
                        }
                        if(c.getResponseCode()!=200||c.getHeaderField("Content-Range")!=null)throw new IOException("Drive je vratio nepotpun KML. Pokušaj ponovo.");
                        if(c.getContentLengthLong()>=0&&c.getContentLengthLong()!=size)throw new IOException("Fajl je promijenjen. Osvježi popis i pokušaj ponovo.");
                        try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(partial)){
                            byte[] buffer=new byte[65536];long bytes=0,deadline=android.os.SystemClock.elapsedRealtime()+240000;int n;
                            while((n=in.read(buffer))!=-1){if(android.os.SystemClock.elapsedRealtime()>deadline)throw new IOException("Preuzimanje traje predugo. Pokušaj na boljoj vezi.");bytes+=n;if(bytes>size||bytes>MAX_BYTES)throw new IOException("KML je prevelik ili promijenjen");out.write(buffer,0,n);}
                        }
                        validate(partial,size);if(!partial.renameTo(saved))throw new IOException("Ne mogu sačuvati KML na telefonu");complete=true;break;
                    }finally{c.disconnect();}
                }
                if(!complete)throw new IOException("Drive nije završio potvrdu preuzimanja");
            }finally{partial.delete();}
        }
        return new JSONObject().put("ok",true).put("url","https://appassets.androidplatform.net/drive-kml/"+id+".kml");
    }
    static void validate(File file,long expected) throws Exception {
        if(file.length()!=expected||expected<=0||expected>MAX_BYTES)throw new IOException("Preuzeti KML nije potpun");
        // Some Android pull parsers end a truncated document without throwing, or skip DTD tokens.
        // Check balanced structure ourselves and reject declarations while bytes are read (UTF-8/16/32).
        try(InputStream in=new FilterInputStream(new FileInputStream(file)){
            int match=0;final String declaration="<!DOCTYPE";
            void inspect(int value) throws IOException {
                if(value==0)return;
                char c=Character.toUpperCase((char)(value&255));
                match=c==declaration.charAt(match)?match+1:c=='<'?1:0;
                if(match==declaration.length())throw new IOException("KML sa DTD zapisom nije podržan");
            }
            @Override public int read() throws IOException {int n=super.in.read();if(n>=0)inspect(n);return n;}
            @Override public int read(byte[] b,int off,int len) throws IOException {int n=super.in.read(b,off,len);for(int i=0;i<n;i++)inspect(b[off+i]);return n;}
        }){
            XmlPullParser xml=Xml.newPullParser();xml.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES,true);xml.setInput(in,null);boolean root=false,closed=false;int depth=0;
            for(int event=xml.getEventType();event!=XmlPullParser.END_DOCUMENT;event=xml.nextToken()){
                if(event==XmlPullParser.DOCDECL)throw new IOException("KML sa DTD zapisom nije podržan");
                if(event==XmlPullParser.START_TAG){
                    if(depth==0){if(root||!"kml".equals(xml.getName()))throw new IOException("Drive nije vratio KML fajl");root=true;}
                    depth++;
                }else if(event==XmlPullParser.END_TAG){if(--depth<0)throw new IOException("KML fajl nije ispravan");if(depth==0)closed=true;}
                else if(event==XmlPullParser.TEXT&&depth==0&&!xml.getText().trim().isEmpty())throw new IOException("KML fajl nije ispravan");
            }
            if(!root||!closed||depth!=0)throw new IOException("KML fajl nije potpun");
        }catch(IOException e){throw e;}catch(Exception e){throw new IOException("KML fajl nije ispravan",e);}
    }
    @Override public WebResourceResponse handle(String path){
        try{
            if(!path.matches("[\\w-]{10,100}\\.kml"))throw new IOException();
            File f=new File(dir,path);if(!f.isFile())throw new IOException();
            return new WebResourceResponse("application/vnd.google-earth.kml+xml","UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-store"),new FileInputStream(f));
        }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    }
    void close(){commands.shutdown();}
    final class Bridge {
        private final WebView view;Bridge(WebView view){this.view=view;}
        @JavascriptInterface public void request(String id,String raw){commands.execute(()->{
            JSONObject result;try{result=action(new JSONObject(raw));}catch(Exception e){result=new JSONObject();try{result.put("ok",false).put("error",e.getMessage());}catch(Exception ignored){}}
            final String text=result.toString();view.post(()->view.evaluateJavascript("window.KmlDownloads&&KmlDownloads.reply("+JSONObject.quote(id)+","+text+")",null));
        });}
    }
}
