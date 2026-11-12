// v4.3.4: prikaz zaključan uspravno (APK manifest + PWA manifest).
const fs=require('fs'),assert=require('assert');
assert(/android:screenOrientation="portrait"/.test(fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8')),'APK uspravno');
assert.equal(JSON.parse(fs.readFileSync('manifest.json','utf8')).orientation,'portrait','PWA uspravno');
console.log('ok orijentacija');
