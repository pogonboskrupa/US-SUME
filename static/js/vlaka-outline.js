/* Sitni kontrastni obrub: ukupno proširenje 14%, ista geometrija i ritam linije. */
(function(root){
'use strict';
function colorFor(color){let c=String(color||'').match(/^#([\da-f]{6}|[\da-f]{3})$/i)?.[1];if(!c)return '#ffffff';if(c.length===3)c=[...c].map(x=>x+x).join('');const rgb=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];return l>.179?'#000000':'#ffffff';}
function widthFor(weight){return Number.isFinite(weight)&&weight>0?weight*1.14:0;}
function install(){const L=root.L;if(!L?.Canvas||L.Canvas.prototype._vlakaOutlineInstalled)return;
 const canvas=L.Canvas.prototype._fillStroke;
 L.Canvas.include({_vlakaOutlineInstalled:true,_fillStroke:function(ctx,layer){const o=layer.options;if(o.vlakaOutline&&o.stroke&&o.weight>0){ctx.save();ctx.globalAlpha=o.opacity;ctx.lineWidth=widthFor(o.weight);ctx.strokeStyle=colorFor(o.color);ctx.lineCap=o.lineCap;ctx.lineJoin=o.lineJoin;if(ctx.setLineDash)ctx.setLineDash(o._dashArray||[]);ctx.stroke();ctx.restore();}canvas.call(this,ctx,layer);}});
 // SVG fallback koristi jedan dodatni neinteraktivni path, bez dodatnog GIS sloja.
 if(L.SVG){const style=L.SVG.prototype._updateStyle,setPath=L.SVG.prototype._setPath,remove=L.SVG.prototype._removePath,add=L.SVG.prototype._addPath;
 L.SVG.include({_addPath:function(layer){add.call(this,layer);if(layer.options.vlakaOutline)this._updateStyle(layer);},_updateStyle:function(layer){style.call(this,layer);const path=layer._path,o=layer.options;if(o.vlakaOutline&&o.stroke&&o.weight>0&&path.parentNode){let outline=layer._vlakaOutlinePath;if(!outline){outline=layer._vlakaOutlinePath=document.createElementNS('http://www.w3.org/2000/svg','path');outline.setAttribute('pointer-events','none');outline.setAttribute('aria-hidden','true');path.parentNode.insertBefore(outline,path);}for(const attr of ['d','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','stroke-opacity']){const v=path.getAttribute(attr);v===null?outline.removeAttribute(attr):outline.setAttribute(attr,v);}outline.setAttribute('fill','none');outline.setAttribute('stroke',colorFor(o.color));outline.setAttribute('stroke-width',widthFor(o.weight));}else if(layer._vlakaOutlinePath){layer._vlakaOutlinePath.remove();layer._vlakaOutlinePath=null;}},_setPath:function(layer,path){setPath.call(this,layer,path);if(layer._vlakaOutlinePath)layer._vlakaOutlinePath.setAttribute('d',path);},_removePath:function(layer){if(layer._vlakaOutlinePath){layer._vlakaOutlinePath.remove();layer._vlakaOutlinePath=null;}remove.call(this,layer);}});
 }
}
root.VlakaOutline={colorFor,widthFor,install};if(typeof module!=='undefined'&&module.exports)module.exports=root.VlakaOutline;install();
})(typeof window!=='undefined'?window:globalThis);
