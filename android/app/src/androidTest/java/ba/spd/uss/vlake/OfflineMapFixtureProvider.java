package ba.spd.uss.vlake;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;

/** Instrumentation APK only. Local content:// documents and a streaming provider. */
public class OfflineMapFixtureProvider extends ContentProvider {
    @Override public boolean onCreate(){return true;}
    private synchronized File fixture(String kind) throws Exception {
        File file=new File(getContext().getCacheDir(),kind.equals("rmaps")?"native-large.sqlitedb":kind.equals("bad")?"native-large.sqlitedb.bad":"native-normalized.mbtiles");
        if(file.isFile())return file;
        if(kind.equals("bad")){try(FileOutputStream out=new FileOutputStream(file)){out.write(new byte[32]);}return file;}
        File seed=new File(getContext().getCacheDir(),"seed.sqlitedb");
        if(!seed.isFile())try(InputStream in=getContext().getAssets().open("rmaps-mini.sqlitedb");FileOutputStream out=new FileOutputStream(seed)){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
        if(kind.equals("rmaps")){
            try(InputStream in=new java.io.FileInputStream(seed);FileOutputStream out=new FileOutputStream(file)){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
            try(RandomAccessFile out=new RandomAccessFile(file,"rw")){out.setLength(1_500_000_000L);}return file;
        }
        byte[] png;
        try(SQLiteDatabase db=SQLiteDatabase.openDatabase(seed.getPath(),null,SQLiteDatabase.OPEN_READONLY);Cursor c=db.rawQuery("SELECT image FROM tiles LIMIT 1",null)){c.moveToFirst();png=c.getBlob(0);}
        try(SQLiteDatabase db=SQLiteDatabase.openOrCreateDatabase(file,null)){
            db.execSQL("CREATE TABLE metadata(name TEXT,value TEXT)");
            db.execSQL("INSERT INTO metadata VALUES('minzoom','13'),('maxzoom','13'),('format','png'),('center','16,44.9,13')");
            db.execSQL("CREATE TABLE images(tile_id TEXT PRIMARY KEY,tile_data BLOB) WITHOUT ROWID");
            db.execSQL("CREATE TABLE map(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_id TEXT,UNIQUE(zoom_level,tile_column,tile_row))");
            db.execSQL("CREATE VIEW tiles AS SELECT zoom_level,tile_column,tile_row,tile_data FROM map JOIN images USING(tile_id)");
            byte[] image=java.util.Arrays.copyOf(png,32768);db.beginTransaction();
            try{for(int i=0;i<1024;i++){
                db.execSQL("INSERT INTO images VALUES(?,?)",new Object[]{"tile-"+i,image});
                db.execSQL("INSERT INTO map VALUES(13,?,5251,?)",new Object[]{4462+i,"tile-"+i});
            }db.setTransactionSuccessful();}finally{db.endTransaction();}
        }return file;
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){
        try{String kind=uri.getLastPathSegment();File f=fixture(kind);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});
            c.addRow(new Object[]{kind.equals("bad")?"native-large.sqlitedb":f.getName(),f.length()});return c;
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws java.io.FileNotFoundException {
        try{File f=fixture(uri.getLastPathSegment());
            if(uri.getLastPathSegment().equals("pipe")){
                ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createReliablePipe();
                new Thread(()->{try(InputStream in=new java.io.FileInputStream(f);FileOutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}catch(Exception ignored){}}).start();return pipe[0];
            }
            return ParcelFileDescriptor.open(f,ParcelFileDescriptor.MODE_READ_ONLY);
        }catch(Exception e){throw new java.io.FileNotFoundException(e.getMessage());}
    }
    @Override public String getType(Uri uri){return "application/vnd.sqlite3";}
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String where,String[] args){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String where,String[] args){throw new UnsupportedOperationException();}
}
