/* Geometrija DEM maske izvan glavnog WebView threada. */
importScripts('print-slope.js');
onmessage=function(e){const {id,data,width,height}=e.data;try{postMessage({id,path:PrintSlope.maskPath(data,width,height)});}catch(error){postMessage({id,path:''});}};
