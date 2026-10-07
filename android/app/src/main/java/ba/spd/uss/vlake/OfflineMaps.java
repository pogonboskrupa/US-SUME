package ba.spd.uss.vlake;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.system.Os;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Read-only SAF SQLite maps. The selected document stays in place; no WebView Blob copy. */
final class OfflineMaps implements WebViewAssetLoader.PathHandler {
    private final Context context;
    private final SharedPreferences refs;
    private final ExecutorService commands = Executors.newSingleThreadExecutor();
    private final Map<String, Entry> open = new HashMap<>();
    private int generation;
    private static final class Entry {
        SQLiteDatabase db; ParcelFileDescriptor fd;
        boolean pages; long size;
        String fmt, query; int offset = 17; JSONObject meta;
        synchronized void close() { if(db!=null)db.close(); db=null; if(fd!=null)try{fd.close();}catch(Exception ignored){} fd=null; }
        synchronized byte[] tile(int z,int x,int y) {
            if(db==null)return null;
            int[] zs=fmt.equals("rmaps")&&offset!=0?new int[]{offset-z,z}:new int[]{z};
            int[] ys=fmt.equals("mbtiles")?new int[]{(1<<z)-1-y,y}:new int[]{y};
            for(int zv:zs)for(int ty:ys)try(Cursor c=db.rawQuery(query,new String[]{""+zv,""+x,""+ty})){
                if(c.moveToFirst()&&!c.isNull(0))return c.getBlob(0);
            }
            return null;
        }
        synchronized byte[] read(long offset,int length) throws Exception {
            if(fd==null||offset<0||length<1||length>65536||offset>size)throw new java.io.IOException("Nevažeće čitanje karte");
            byte[] bytes=new byte[(int)Math.min(length,size-offset)];int at=0,n;
            while(at<bytes.length&&(n=Os.pread(fd.getFileDescriptor(),bytes,at,bytes.length-at,offset+at))>0)at+=n;
            if(at!=bytes.length)throw new java.io.IOException("Fajl karte je promijenjen ili nije dostupan");return bytes;
        }
    }
    OfflineMaps(Context context) { this.context=context.getApplicationContext();refs=this.context.getSharedPreferences("offline-map-documents-v1",Context.MODE_PRIVATE); }
    JSONObject select(Uri uri, boolean persistent) throws Exception {
        String name="karta.sqlitedb";long size=0;
        try(Cursor c=context.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){
            if(c!=null&&c.moveToFirst()){name=c.getString(0);if(!c.isNull(1))size=c.getLong(1);}
        }
        String id=UUID.randomUUID().toString();
        JSONObject doc=new JSONObject().put("uri",uri.toString()).put("name",name).put("size",size).put("persistent",persistent);
        if(!refs.edit().putString(id,doc.toString()).commit())throw new java.io.IOException("Ne mogu sačuvati pristup karti");
        return new JSONObject().put("name",name).put("size",size).put("nativeId",id);
    }
    boolean hasDocument(String id){return refs.contains(id);}
    JSONObject registerDownload(File file,String name) throws Exception {
        File root=new File(context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS),"offline-maps");
        if(!file.getCanonicalFile().getParentFile().equals(root.getCanonicalFile())||!file.isFile())throw new java.io.IOException("Karta nije dostupna");
        String id=UUID.randomUUID().toString();
        JSONObject doc=new JSONObject().put("uri",Uri.fromFile(file).toString()).put("name",name).put("size",file.length()).put("download",true);
        if(!refs.edit().putString(id,doc.toString()).commit())throw new java.io.IOException("Ne mogu sačuvati kartu");
        return new JSONObject().put("name",name).put("size",file.length()).put("nativeId",id);
    }
    void discardDownload(String id) throws Exception {remove(id);}
    private File downloaded(JSONObject doc) throws Exception {
        File file=new File(Uri.parse(doc.getString("uri")).getPath());
        File root=new File(context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS),"offline-maps");
        if(!file.getCanonicalFile().getParentFile().equals(root.getCanonicalFile()))throw new java.io.IOException("Nepoznata lokacija karte");return file;
    }
    private static String quote(String s){return "\""+s.replace("\"","\"\"")+"\"";}
    private static boolean table(SQLiteDatabase db,String name){try(Cursor c=db.rawQuery("SELECT 1 FROM sqlite_master WHERE name=? AND type IN ('table','view') LIMIT 1",new String[]{name})){return c.moveToFirst();}}
    private static Map<String,String> columns(SQLiteDatabase db,String table){Map<String,String> out=new HashMap<>();try(Cursor c=db.rawQuery("PRAGMA table_info("+quote(table)+")",null)){while(c.moveToNext())out.put(c.getString(1).toLowerCase(java.util.Locale.ROOT),c.getString(1));}return out;}
    private JSONObject document(String id) throws Exception {String s=refs.getString(id,null);if(s==null)throw new java.io.IOException("Ponovo odaberi fajl karte");return new JSONObject(s);}
    private void progress(WebView view,long request,long bytes,long total){JSONObject p=new JSONObject();try{p.put("progress",bytes).put("total",total);}catch(Exception ignored){}reply(view,request,p);}
    private Entry load(String id,WebView view,long request) throws Exception {
        final int openingGeneration;
        synchronized(open){if(open.containsKey(id))return open.get(id);openingGeneration=generation;}
        JSONObject doc=document(id);Uri uri=Uri.parse(doc.getString("uri"));Entry entry=new Entry();
        File owned=new File(context.getFilesDir(),"offline-maps/"+id+".sqlite");
        try {
            if(doc.optBoolean("download")) entry.db=SQLiteDatabase.openDatabase(downloaded(doc).getPath(),null,SQLiteDatabase.OPEN_READONLY|SQLiteDatabase.NO_LOCALIZED_COLLATORS);
            else if(owned.isFile()) entry.db=SQLiteDatabase.openDatabase(owned.getPath(),null,SQLiteDatabase.OPEN_READONLY|SQLiteDatabase.NO_LOCALIZED_COLLATORS);
            else {
                boolean direct=false;
                // Cloud/pipe providers do not provide random access. They alone need a local copy.
                if(doc.optBoolean("persistent"))try {
                    entry.fd=context.getContentResolver().openFileDescriptor(uri,"r");
                    if(entry.fd==null)throw new java.io.IOException("Fajl nije dostupan");
                    byte[] header=new byte[16];int read=Os.pread(entry.fd.getFileDescriptor(),header,0,16,0);
                    if(read!=16||!new String(header,StandardCharsets.US_ASCII).equals("SQLite format 3\u0000"))throw new java.io.IOException("Fajl nije SQLite karta");
                    entry.size=Os.fstat(entry.fd.getFileDescriptor()).st_size;
                    if(entry.size<16)throw new java.io.IOException("Izvor ne podržava direktno čitanje");
                    try{entry.db=SQLiteDatabase.openDatabase("/proc/self/fd/"+entry.fd.getFd(),null,SQLiteDatabase.OPEN_READONLY|SQLiteDatabase.NO_LOCALIZED_COLLATORS);}
                    catch(android.database.sqlite.SQLiteCantOpenDatabaseException inaccessiblePath){entry.pages=true;}
                    direct=true;
                }catch(Exception directError){entry.close();}
                if(!direct){
                    File dir=owned.getParentFile();if(!dir.isDirectory()&&!dir.mkdirs())throw new java.io.IOException("Nema prostora za kartu");
                    File part=new File(dir,id+".part");long copied=0,last=0;
                    try(InputStream in=context.getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(part)){
                        if(in==null)throw new java.io.IOException("Fajl nije dostupan — ponovo ga odaberi");
                        byte[] header=new byte[16];int p=0,n;while(p<16&&(n=in.read(header,p,16-p))>0)p+=n;
                        if(p!=16||!new String(header,StandardCharsets.US_ASCII).equals("SQLite format 3\u0000"))throw new java.io.IOException("Fajl nije SQLite karta");
                        out.write(header);copied=16;byte[] buffer=new byte[1024*1024];
                        while((n=in.read(buffer))!=-1){out.write(buffer,0,n);copied+=n;long now=android.os.SystemClock.elapsedRealtime();if(now-last>250){progress(view,request,copied,doc.optLong("size"));last=now;}}
                        out.getFD().sync();if(doc.optLong("size")>0&&copied!=doc.getLong("size"))throw new java.io.IOException("Nepotpuna kopija karte");
                    }catch(Exception ex){part.delete();throw ex;}
                    if(!part.renameTo(owned)){part.delete();throw new java.io.IOException("Čuvanje karte nije uspjelo");}
                    entry.db=SQLiteDatabase.openDatabase(owned.getPath(),null,SQLiteDatabase.OPEN_READONLY|SQLiteDatabase.NO_LOCALIZED_COLLATORS);
                }
            }
            if(entry.pages){entry.fmt="native-pages";entry.meta=new JSONObject().put("_nativePages",true).put("_nativeSize",entry.size);}
            else inspect(entry);
            entry.meta.put("_nativeId",id).put("_nativeCopy",owned.isFile());
            synchronized(open){if(generation!=openingGeneration)throw new java.io.IOException("Učitavanje je prekinuto");open.put(id,entry);}return entry;
        }catch(Exception e){entry.close();throw e;}
    }
    private void inspect(Entry e) throws Exception {
        SQLiteDatabase db=e.db;String t="tiles";e.fmt="mbtiles";
        if(table(db,"gpkg_contents"))try(Cursor c=db.rawQuery("SELECT table_name FROM gpkg_contents WHERE data_type='tiles' LIMIT 1",null)){if(c.moveToFirst()){t=c.getString(0);e.fmt="gpkg";}}
        if(!table(db,t))throw new java.io.IOException("Nije podržana raster SQLite karta");
        Map<String,String> cols=columns(db,t);String z="zoom_level",x="tile_column",y="tile_row",data="tile_data";
        if(cols.containsKey("z")&&cols.containsKey("x")&&cols.containsKey("y")){
            z="z";x="x";y="y";
            if(cols.containsKey("image")){data="image";e.fmt="rmaps";}else if(cols.containsKey("tile")){data="tile";e.fmt="alpinequest";}
        }
        if(!cols.containsKey(z)||!cols.containsKey(x)||!cols.containsKey(y)||!cols.containsKey(data))throw new java.io.IOException("Nedostaju kolone raster karte");
        String qz=quote(cols.get(z)),qx=quote(cols.get(x)),qy=quote(cols.get(y)),qt=quote(t);
        e.query="SELECT "+quote(cols.get(data))+" FROM "+qt+" WHERE "+qz+"=? AND "+qx+"=? AND "+qy+"=? LIMIT 1";
        e.meta=new JSONObject();
        if(table(db,"metadata"))try(Cursor c=db.rawQuery("SELECT name,value FROM metadata LIMIT 256",null)){while(c.moveToNext()){String k=c.getString(0);if(k!=null&&!k.startsWith("_"))e.meta.put(k,c.getString(1));}}
        if(e.meta.optString("format").equals("pbf"))throw new java.io.IOException("Ova MBTiles karta je vektorska (PBF), odaberi raster kartu");
        // LIMIT 1 reads coordinates only, never all images or a full MIN/MAX table scan.
        int sampleZ=13,sampleX=0,sampleY=0;boolean sample=false;
        try(Cursor c=db.rawQuery("SELECT "+qz+","+qx+","+qy+" FROM "+qt+" LIMIT 1",null)){
            if(c.moveToFirst()){sampleZ=c.getInt(0);sampleX=c.getInt(1);sampleY=c.getInt(2);sample=true;}
        }
        if(e.fmt.equals("rmaps")&&sample){
            // RMaps stores z=17-webZoom. Some exporters use ordinary XYZ instead.
            e.offset=17;
            int inverted=17-sampleZ;
            if(inverted<0||inverted>22||sampleX>=(1L<<inverted)||sampleY>=(1L<<inverted))e.offset=0;
        }
        int lo=0,hi=22;
        if(e.fmt.equals("rmaps")){hi=e.offset==0?22:e.offset;
            if(table(db,"info"))try(Cursor c=db.rawQuery("SELECT minzoom,maxzoom FROM info LIMIT 1",null)){if(c.moveToFirst()){
                lo=c.getInt(0);hi=c.getInt(1);if(lo>hi){int a=lo;lo=hi;hi=a;}
                int web=e.offset==0?sampleZ:e.offset-sampleZ;
                if(e.offset!=0&&sampleZ>=lo&&sampleZ<=hi&&(web<lo||web>hi)){int a=lo;lo=e.offset-hi;hi=e.offset-a;}
            }}catch(Exception ignored){}
        }
        if(!e.fmt.equals("rmaps")&&!e.meta.has("minzoom")&&!e.meta.has("maxzoom")){
            // ORDER BY/LIMIT is cheap only when an ordered index supplies it. Never sort a huge table on startup.
            boolean sorted=true;String sql="SELECT "+qz+" FROM "+qt+" ORDER BY "+qz;
            try(Cursor plan=db.rawQuery("EXPLAIN QUERY PLAN "+sql+" LIMIT 1",null)){while(plan.moveToNext())if(plan.getString(3).contains("TEMP B-TREE"))sorted=false;}
            if(sorted){
                try(Cursor c=db.rawQuery(sql+" ASC LIMIT 1",null)){if(c.moveToFirst())lo=c.getInt(0);}
                try(Cursor c=db.rawQuery(sql+" DESC LIMIT 1",null)){if(c.moveToFirst())hi=c.getInt(0);}
            }
        }
        if(e.fmt.equals("gpkg")&&table(db,"gpkg_tile_matrix"))try(Cursor c=db.rawQuery("SELECT MIN(zoom_level),MAX(zoom_level) FROM gpkg_tile_matrix WHERE table_name=?",new String[]{t})){if(c.moveToFirst()&&!c.isNull(0)){lo=c.getInt(0);hi=c.getInt(1);}}
        if(!e.meta.has("minzoom"))e.meta.put("minzoom",lo);if(!e.meta.has("maxzoom"))e.meta.put("maxzoom",hi);
        if(sample&&!e.meta.has("center")&&!e.meta.has("bounds")){
            int webZ=e.fmt.equals("rmaps")&&e.offset!=0?e.offset-sampleZ:sampleZ;
            if(webZ>=0&&webZ<=22){double n=(double)(1L<<webZ);int yy=e.fmt.equals("mbtiles")?(int)n-1-sampleY:sampleY;
                double lon=(sampleX+.5)/n*360-180,lat=Math.toDegrees(Math.atan(Math.sinh(Math.PI*(1-2*(yy+.5)/n))));
                e.meta.put("center",lon+","+lat+","+webZ);
            }
        }
    }
    void closeAll(){synchronized(open){generation++;for(Entry e:open.values())e.close();open.clear();}}
    private void remove(String id) throws Exception {
        JSONObject old=document(id);
        synchronized(open){Entry e=open.remove(id);if(e!=null)e.close();}
        if(!refs.edit().remove(id).commit())throw new java.io.IOException("Uklanjanje karte nije uspjelo");
        new File(context.getFilesDir(),"offline-maps/"+id+".sqlite").delete();
        boolean used=false;for(Object raw:refs.getAll().values())if(new JSONObject(String.valueOf(raw)).optString("uri").equals(old.optString("uri")))used=true;
        if(!used&&old.optBoolean("download"))downloaded(old).delete();
        if(!used&&old.optBoolean("persistent"))try{context.getContentResolver().releasePersistableUriPermission(Uri.parse(old.getString("uri")),android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}
    }
    private void reply(WebView view,long request,JSONObject result){view.post(()->view.evaluateJavascript("window.NativeOfflineMaps&&NativeOfflineMaps.reply("+request+","+result.toString()+")",null));}
    final class Bridge {
        private final WebView view;private final Runnable preparePicker;
        Bridge(WebView view,Runnable preparePicker){this.view=view;this.preparePicker=preparePicker;}
        @JavascriptInterface public void preparePicker(){preparePicker.run();}
        @JavascriptInterface public void request(long request,String text){commands.execute(()->{
            JSONObject result=new JSONObject();try{
                JSONObject msg=new JSONObject(text);String type=msg.getString("type"),id=msg.optString("nativeId");
                if(type.equals("probe")){
                    JSONObject doc=document(id);
                    try(InputStream in=doc.optBoolean("download")?new java.io.FileInputStream(downloaded(doc)):context.getContentResolver().openInputStream(Uri.parse(doc.getString("uri")))){
                        byte[] h=new byte[16];int p=0,n;if(in==null)throw new java.io.IOException("Fajl nije dostupan");
                        while(p<16&&(n=in.read(h,p,16-p))>0)p+=n;
                        if(p!=16||!new String(h,StandardCharsets.US_ASCII).equals("SQLite format 3\u0000"))throw new java.io.IOException("Fajl nije SQLite karta");
                    }
                }
                else if(type.equals("open")){Entry e=load(id,view,request);result.put("fmt",e.fmt).put("meta",e.meta);}
                else if(type.equals("close")){synchronized(open){Entry e=open.remove(id);if(e!=null)e.close();}}
                else if(type.equals("remove")){if(refs.contains(id))remove(id);}
                else if(type.equals("clear")){for(String key:refs.getAll().keySet())remove(key);}
                else throw new java.io.IOException("Nepoznata radnja karte");
                result.put("ok",true);
            }catch(Exception e){try{result.put("ok",false).put("error",e.getMessage()==null?"Fajl nije dostupan — ponovo ga odaberi":e.getMessage());}catch(Exception ignored){}}
            reply(view,request,result);
        });}
    }
    @Override public WebResourceResponse handle(String path){
        try{
            String[] p=path.split("/");if(p.length!=4||!p[0].matches("[a-f0-9-]{36}"))throw new IllegalArgumentException();
            if(p[1].equals("read")){
                Entry entry;synchronized(open){entry=open.get(p[0]);}if(entry==null)throw new java.io.IOException("Karta je zatvorena");
                byte[] bytes=entry.read(Long.parseLong(p[2]),Integer.parseInt(p[3]));
                return new WebResourceResponse("application/octet-stream",null,200,"OK",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(bytes));
            }
            int z=Integer.parseInt(p[1]),x=Integer.parseInt(p[2]),y=Integer.parseInt(p[3]);
            if(z<0||z>22||x<0||y<0||x>=(1<<z)||y>=(1<<z))throw new IllegalArgumentException();
            Entry entry;synchronized(open){entry=open.get(p[0]);}byte[] bytes=entry==null?null:entry.tile(z,x,y);
            if(bytes==null)return new WebResourceResponse("application/octet-stream",null,404,"Not Found",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(new byte[0]));
            String mime=bytes.length>3&&bytes[0]==(byte)137?"image/png":bytes.length>2&&bytes[0]==(byte)255?"image/jpeg":"image/webp";
            return new WebResourceResponse(mime,null,200,"OK",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(bytes));
        }catch(Exception e){return new WebResourceResponse("application/octet-stream",null,500,"Read Error",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(new byte[0]));}
    }
}
