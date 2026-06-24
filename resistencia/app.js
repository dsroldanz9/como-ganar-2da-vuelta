(function(){
"use strict";
var D = window.RES_DATA; if(!D){ return; }
var R = D.resumen;
var byslug = {}; D.municipios.forEach(function(m){ byslug[m.slug]=m; });
var PUE = window.RES_PUESTOS || {};
var GEO = window.APP_GEO || {};
var GEOKEY = {"bogota d.c.":"bogota","medellin":"medellin","cali":"cali","barranquilla":"barranquilla","cartagena":"cartagena","cucuta":"cucuta","bucaramanga":"bucaramanga","ibague":"ibague","pereira":"pereira","santa marta":"santamarta","villavicencio":"villavicencio","manizales":"manizales","pasto":"pasto"};
function semaforo(p){ if(p==null) return "#cfc8dc"; if(p>=55) return "#1f9e4f"; if(p>=50) return "#F2C516"; if(p>=45) return "#E8702A"; return "#C0392B"; }
var fmt = function(n){ return (n==null?"—":Number(n).toLocaleString("es-CO")); };
var sgn = function(n){ return (n>=0?"+":"")+ (Math.round(n*10)/10).toString().replace(".",","); };
var pc  = function(n){ return (n==null?"—":(Math.round(n*10)/10).toString().replace(".",",")+"%"); };
var CITIES = {"medellin":1,"cali":1,"barranquilla":1,"cartagena":1,"cucuta":1,"bucaramanga":1,"ibague":1,"pasto":1,"pereira":1,"manizales":1,"santa marta":1,"villavicencio":1};
function nk(s){ s=(s||"").toLowerCase(); return s.replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i").replace(/ó/g,"o").replace(/ú/g,"u").replace(/ü/g,"u"); }
function cityLink(m){
  var k=nk(m.nm);
  if(m.slug==="16-001"||k.indexOf("bogot")===0) return "<a class='deeplink' href='../bogota-campana-v2/' target='_blank' rel='noopener'>Ver Bogotá puesto a puesto y por localidad (acceso del equipo) →</a>";
  if(CITIES[k]) return "<a class='deeplink' href='../ciudades-campana/' target='_blank' rel='noopener'>Ver "+m.nm+" puesto a puesto (acceso del equipo) →</a>";
  return "";
}

// ---- KPIs ----
document.getElementById("k-votos").textContent = fmt(R.cep2v_total);
document.getElementById("k-pct").textContent   = pc(R.cep2pct);
document.getElementById("k-mun").textContent   = fmt(R.munis_ganados);
document.getElementById("k-dep").textContent   = R.deptos_ganados+" / "+R.deptos;
document.getElementById("k-swing").textContent = sgn(R.swing_nac)+" pts";
document.getElementById("gen").textContent     = "Generado "+D.generado+".";

// ---- color helpers ----
function hx(c){ return [parseInt(c.substr(1,2),16),parseInt(c.substr(3,2),16),parseInt(c.substr(5,2),16)]; }
function mix(a,b,t){ a=hx(a); b=hx(b); var r=a.map(function(x,i){return Math.round(x+(b[i]-x)*t);});
  return "#"+r.map(function(x){return ("0"+x.toString(16)).slice(-2);}).join(""); }
function clamp(t){ return t<0?0:(t>1?1:t); }
function div(v,lo,mid,hi,vmin,vmid,vmax){
  if(v==null||isNaN(v)) return "#d9d4e2";
  if(v>=vmid) return mix(mid,hi,clamp((v-vmid)/(vmax-vmid)));
  return mix(mid,lo,clamp((vmid-v)/(vmid-vmin)));
}
var WIN=["#E0712F","#F4E9DA","#4a2f86"], SW=["#C0392B","#F1ECE3","#1f9e4f"];
function colorFor(m,mode){
  if(!m) return "#e3dfea";
  if(mode==="swing") return div(m.sw,SW[0],SW[1],SW[2],-12,0,12);
  if(mode==="v1")    return div(m.c1,WIN[0],WIN[1],WIN[2],25,45,70);
  return div(m.c2,WIN[0],WIN[1],WIN[2],25,50,75); // resistencia / v2
}
var MODE="resistencia";

// ---- map ----
var map = L.map("map",{scrollWheelZoom:false, attributionControl:false, zoomControl:true}).setView([4.6,-73.8],5.4);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",{maxZoom:12,subdomains:"abcd"}).addTo(map);
map.createPane("comunas"); map.getPane("comunas").style.zIndex=410;
map.createPane("puntos");  map.getPane("puntos").style.zIndex=460;
var layer=null, selected=null;
var puestoLayer = L.layerGroup().addTo(map);
var cityGeoLayer = L.layerGroup().addTo(map);
var muted=false;
var MUTE={fillColor:"#e7e4ee",fillOpacity:.28,weight:.3,color:"#fff"};
function muteMap(on){ muted=on; if(!layer) return; if(on){ layer.eachLayer(function(l){ l.setStyle(MUTE); }); } else { layer.setStyle(style); } }
function style(f){ var m=byslug[f.properties.slug];
  return { fillColor:colorFor(m,MODE), weight:.4, color:"#fff", fillOpacity:m?0.9:0.5 }; }
function onEach(f,lyr){
  var m=byslug[f.properties.slug];
  lyr.on("mouseover",function(){ lyr.setStyle({weight:1.6,color:"#241a3a"}); lyr.bringToFront(); tip(m,f); });
  lyr.on("mouseout",function(){ if(lyr!==selected){ if(muted) lyr.setStyle(MUTE); else layer.resetStyle(lyr); } hideTip(); });
  lyr.on("click",function(){ selectLayer(lyr); openDetail(m||{nm:f.properties.municipio,dnm:f.properties.depto}); });
}
function selectLayer(lyr){ if(selected) layer.resetStyle(selected); selected=lyr; lyr.setStyle({weight:2.2,color:"#241a3a"}); lyr.bringToFront(); }

// tooltip
var tipEl=null;
function tip(m,f){ if(!tipEl){ tipEl=L.DomUtil.create("div","map-tip"); tipEl.style.cssText="position:absolute;z-index:600;background:#241a3a;color:#fff;padding:6px 9px;border-radius:8px;font-size:.78rem;pointer-events:none;max-width:200px;box-shadow:0 2px 8px rgba(0,0,0,.3)"; document.querySelector(".map-wrap").appendChild(tipEl);}
  var name=m?m.nm:f.properties.municipio, dep=m?m.dnm:f.properties.depto;
  var line = m? ("2ª v.: <b>"+pc(m.c2)+"</b> · "+(m.won?"ganamos":"perdimos")+"<br>vs 2022: "+sgn(m.sw)) : "sin dato";
  tipEl.innerHTML="<b>"+name+"</b><br><span style='opacity:.7'>"+dep+"</span><br>"+line; tipEl.style.display="block";
}
function hideTip(){ if(tipEl) tipEl.style.display="none"; }
document.getElementById("map").addEventListener("mousemove",function(e){ if(tipEl&&tipEl.style.display!=="none"){ var r=this.getBoundingClientRect(); tipEl.style.left=(e.clientX-r.left+14)+"px"; tipEl.style.top=(e.clientY-r.top+14)+"px"; }});

fetch("mapa.geojson").then(function(r){return r.json();}).then(function(gj){
  layer=L.geoJSON(gj,{style:style,onEachFeature:onEach}).addTo(map);
  map.fitBounds(layer.getBounds(),{padding:[6,6]});
}).catch(function(){ document.getElementById("map").innerHTML="<p style='padding:20px;color:#6b647e'>El mapa carga mejor desde el sitio publicado (GitHub Pages).</p>"; });

// ---- legend + modes ----
function legend(){
  var el=document.getElementById("legend"), h;
  if(MODE==="swing"){ h="<h4>Cambio vs 2022 (a dos)</h4>"
    +"<div class='row'><i style='background:"+SW[2]+"'></i> Creció (+)</div>"
    +"<div class='row'><i style='background:"+SW[1]+"'></i> Igual</div>"
    +"<div class='row'><i style='background:"+SW[0]+"'></i> Cayó (−)</div>"; }
  else { var t=(MODE==="v1"?"% Cepeda 1ª vuelta":"% Cepeda 2ª vuelta");
    h="<h4>"+t+"</h4>"
    +"<div class='row'><i style='background:"+WIN[2]+"'></i> Ganamos (alto)</div>"
    +"<div class='row'><i style='background:"+WIN[1]+"'></i> Disputa (~50%)</div>"
    +"<div class='row'><i style='background:"+WIN[0]+"'></i> Adverso (bajo)</div>"; }
  el.innerHTML=h;
}
document.getElementById("modes").addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return;
  this.querySelectorAll("button").forEach(function(x){x.classList.remove("active");}); b.classList.add("active");
  MODE=b.dataset.mode; if(layer) layer.setStyle(style); legend();
});
legend();

// ---- detail ----
function rutaTxt(m){
  switch(m.ruta){
    case "Consolidar base": return "territorio nuestro: convertir la fuerza presidencial en estructura local —candidaturas a alcaldía, concejo y JAL— y cuidar la organización y la participación.";
    case "Cuidar y ampliar": return "lo ganamos: asegurar con operación electoral, testigos y participación, y sumar al centro para no perderlo.";
    case "Frente amplio por la vida": return "quedó competitivo y aquí decide el centro y el voto blando: construir un frente amplio por la vida, con empleo, costo de vida y seguridad. Hay "+pc(m.ce)+" de centro (1ª v.) y "+pc(m.bl)+" de blanco (2ª v.) por disputar.";
    default: return "territorio difícil: sembrar presencia de largo plazo, sin dispersar recursos.";
  }
}
function openDetail(m){
  var el=document.getElementById("detail");
  if(m.c2==null){ el.innerHTML="<div class='card'><div class='dh'><h3>"+m.nm+"</h3><span class='dep'>"+m.dnm+"</span></div><p class='txt'>Sin resultado enlazado para este municipio.</p></div>"; el.scrollIntoView({behavior:"smooth",block:"nearest"}); return; }
  var badge = m.won? "<span class='badge b-win'>Ganamos</span>" : "<span class='badge b-lose'>Perdimos</span>";
  var txt = m.nm+" ("+m.dnm+"). En segunda vuelta Cepeda obtuvo "+pc(m.c2)+" a dos candidatos y "
    +(m.won?"ganó":"no alcanzó")+" el municipio. En primera vuelta partía de "+pc(m.c1)
    +". Frente a 2022, "+(m.sw>=0?"creció ":"cayó ")+sgn(m.sw).replace("+","")+" puntos. <b>Estrategia — "+m.ruta+":</b> "+rutaTxt(m);
  var link = cityLink(m);
  el.innerHTML="<div class='card'><button class='backlink' type='button'>← Volver al mapa nacional</button><div class='dh'><h3>"+m.nm+"</h3><span class='dep'>"+m.dnm+"</span> "+badge+"<span class='ruta-tag'>"+m.ruta+"</span></div>"
    +"<div class='stats'>"
    +"<div class='stat'><b>"+pc(m.c2)+"</b><span>2ª vuelta (a dos)</span></div>"
    +"<div class='stat'><b>"+pc(m.c1)+"</b><span>1ª vuelta</span></div>"
    +"<div class='stat'><b>"+sgn(m.sw)+"</b><span>cambio vs 2022</span></div>"
    +"<div class='stat'><b>"+(m.mgv>=0?"+":"")+fmt(m.mgv)+"</b><span>margen en votos</span></div>"
    +"<div class='stat'><b>"+pc(m.ce)+"</b><span>centro 1ª v. (Fajardo+Claudia)</span></div>"
    +"<div class='stat'><b>"+pc(m.bl)+"</b><span>blanco 2ª v.</span></div>"
    +"<div class='stat'><b>"+sgn(m.mob)+"%</b><span>movilización 1v→2v</span></div>"
    +"<div class='stat'><b>"+fmt(m.v2)+"</b><span>votos válidos 2ª v.</span></div>"
    +"</div><p class='txt'>"+txt+"</p>"+link+puestosBlock(m)+"</div>";
  // mapa: atenuar el resto + seleccionar polígono + segmentación de ciudad + zoom
  muteMap(true);
  if(layer) layer.eachLayer(function(l){ if(l.feature.properties.slug===m.slug) selectLayer(l); });
  var b = showCityOnMap(m);
  if(b && b.isValid && b.isValid()){ map.fitBounds(b,{padding:[40,40],maxZoom:13}); }
  else if(layer){ layer.eachLayer(function(l){ if(l.feature.properties.slug===m.slug) map.fitBounds(l.getBounds(),{maxZoom:9,padding:[30,30]}); }); }
  document.getElementById("resetMap").hidden=false;
  el.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function puestosBlock(m){
  var ps = PUE[m.slug];
  if(!ps || !ps.length) return "<p class='hint' style='margin-top:10px'>Sin detalle por puesto disponible para este municipio.</p>";
  var ng = ps.filter(function(p){return p.la!=null;}).length;
  var rows = ps.slice(0,40).map(function(p){
    return "<tr><td>"+p.p+"</td><td class='r'>Z"+p.z+"</td><td class='r "+(p.c2>=50?'g':'rr')+"'>"+pc(p.c2)+"</td><td class='r'>"+fmt(p.v)+"</td></tr>"; }).join("");
  var more = ps.length>40? "<p class='hint'>… y "+(ps.length-40)+" puestos más (orden por votos). Descarga completa en datos abiertos.</p>":"";
  return "<div class='puestos'><h4>Puestos de votación · "+ps.length+" en el municipio · "+ng+" ubicados en el mapa</h4>"
    +"<div class='ptbl'><table class='lst'><tr><th>Puesto</th><th class='r'>Zona</th><th class='r'>% Cepeda 2ª v.</th><th class='r'>Votos</th></tr>"+rows+"</table></div>"+more+"</div>";
}
function showCityOnMap(m){
  puestoLayer.clearLayers(); cityGeoLayer.clearLayers();
  var bounds=null, gk=GEOKEY[nk(m.nm)];
  if(gk && GEO[gk]){
    var gl=L.geoJSON(GEO[gk],{ pane:"comunas", style:function(f){ return {fillColor:semaforo(f.properties.apoyo), weight:.8, color:"#fff", fillOpacity:.5}; },
      onEachFeature:function(f,ly){ var p=f.properties; ly.bindTooltip("<b>"+p.comuna+"</b><br>Apoyo 1ª v.: "+pc(p.apoyo)+" · cambio "+sgn(p.swing)+" · "+fmt(p.votos)+" votos",{sticky:true}); } });
    gl.addTo(cityGeoLayer); bounds=gl.getBounds();
  }
  var ps=(PUE[m.slug]||[]).filter(function(p){return p.la!=null;}), pts=[];
  ps.forEach(function(p){ var mk=L.circleMarker([p.la,p.lo],{pane:"puntos",radius:4+Math.min(9,Math.sqrt(p.v)/11),color:"#fff",weight:.8,fillColor:semaforo(p.c2),fillOpacity:.95});
    mk.bindTooltip("<b>"+p.p+"</b><br>Cepeda 2ª v. "+pc(p.c2)+" · "+fmt(p.v)+" votos",{direction:"top"});
    mk.bindPopup("<b>"+p.p+"</b><br>Zona "+p.z+"<br>Cepeda 2ª vuelta: <b>"+pc(p.c2)+"</b><br>"+fmt(p.v)+" votos válidos");
    mk.addTo(puestoLayer); pts.push([p.la,p.lo]); });
  if(pts.length){ if(bounds&&bounds.isValid()) pts.forEach(function(c){bounds.extend(c);}); else bounds=L.latLngBounds(pts); }
  if(gk || pts.length) semaLegend(!!(gk&&GEO[gk]), pts.length); else document.getElementById("plegend").hidden=true;
  return bounds;
}
function semaLegend(hasComuna, np){
  var el=document.getElementById("plegend"); el.hidden=false;
  el.innerHTML="<h4>"+(np?("Puestos 2ª vuelta · "+np):"Segmentación")+"</h4>"
    +"<div class='row'><i style='background:#1f9e4f'></i> Ganamos (≥55%)</div>"
    +"<div class='row'><i style='background:#F2C516'></i> Ajustado (50–55%)</div>"
    +"<div class='row'><i style='background:#E8702A'></i> Perdimos por poco (45–50%)</div>"
    +"<div class='row'><i style='background:#C0392B'></i> Perdimos por mucho (&lt;45%)</div>"
    +(hasComuna?"<div class='row' style='margin-top:5px;opacity:.85'>Áreas = comuna/localidad (apoyo 1ª v.)</div>":"");
}
function resetMap(){
  puestoLayer.clearLayers(); cityGeoLayer.clearLayers();
  document.getElementById("plegend").hidden=true;
  selected=null; muteMap(false);   // restaura colores del mapa nacional
  if(layer) map.fitBounds(layer.getBounds(),{padding:[6,6]});
  document.getElementById("resetMap").hidden=true;
  document.getElementById("detail").innerHTML="";
}

// ---- search ----
var q=document.getElementById("q"), hint=document.getElementById("qhint");
q.addEventListener("input",function(){
  var s=this.value.trim().toLowerCase(); if(s.length<3){ hint.textContent=""; return; }
  var hit=D.municipios.filter(function(m){ return m.nm.toLowerCase().indexOf(s)>=0; }).sort(function(a,b){return b.v2-a.v2;})[0];
  if(hit){ hint.textContent="→ "+hit.nm+", "+hit.dnm; }
  else hint.textContent="sin coincidencia";
});
q.addEventListener("keydown",function(e){ if(e.key!=="Enter") return;
  var s=this.value.trim().toLowerCase(); if(!s) return;
  var hit=D.municipios.filter(function(m){ return m.nm.toLowerCase().indexOf(s)>=0; }).sort(function(a,b){return b.v2-a.v2;})[0];
  if(hit){ openDetail(hit); }
});

// ---- evaluation bars (departamentos) ----
function depBars(elid, list, kind){
  var max=Math.max.apply(null,list.map(function(d){return Math.abs(d.mgv);}));
  document.getElementById(elid).innerHTML = list.map(function(d){
    var w=Math.round(100*Math.abs(d.mgv)/max);
    var cls = kind==="neg"?"neg":"pos";
    return "<div class='bar'><div class='bl'><b>"+d.depto+"</b><span>"+(d.mgv>=0?"+":"")+fmt(d.mgv)+" · "+pc(d.c2)+"</span></div>"
      +"<div class='track'><div class='fill "+cls+"' style='width:"+w+"%'></div></div></div>";
  }).join("");
}
depBars("rk-decidio", D.rankings.decidio, "neg");
depBars("rk-resistio", D.rankings.resistio, "pos");

function swBars(elid, list){
  var max=Math.max.apply(null,list.map(function(d){return Math.abs(d.sw);}));
  document.getElementById(elid).innerHTML = list.map(function(d){
    var w=Math.round(100*Math.abs(d.sw)/max);
    return "<div class='bar'><div class='bl'><b>"+d.depto+"</b><span>"+sgn(d.sw)+" pts · "+pc(d.c2)+"</span></div>"
      +"<div class='track'><div class='fill "+(d.sw<0?"swneg":"swpos")+"' style='width:"+w+"%'></div></div></div>";
  }).join("");
}
swBars("rk-desgaste", D.rankings.desgaste);

// ---- routes ----
function renderRoute(tab){
  var list=D.rankings[tab]||[];
  document.getElementById("routes").innerHTML = list.map(function(m){
    var extra = tab==="bastiones" ? ("Cepeda "+pc(m.c2)+" · "+fmt(m.vc)+" votos")
      : tab==="frente" ? ("Cepeda "+pc(m.c2)+" · centro "+pc(m.ce)+" · blanco "+pc(m.bl)+" · "+fmt(m.v2)+" votos")
      : ("Cepeda "+pc(m.c2)+" · vs 2022 "+sgn(m.sw)+" · "+fmt(m.v2)+" votos");
    return "<button class='muni' data-slug='"+m.slug+"'><div class='mn'>"+m.nm+"</div><div class='md'>"+m.dnm+"</div><div class='mv'>"+extra+"</div></button>";
  }).join("");
}
document.getElementById("tabs").addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return;
  this.querySelectorAll("button").forEach(function(x){x.classList.remove("active");}); b.classList.add("active");
  renderRoute(b.dataset.tab);
});
document.getElementById("routes").addEventListener("click",function(e){
  var b=e.target.closest(".muni"); if(!b) return; var m=byslug[b.dataset.slug]; if(m){ openDetail(m); }
});
renderRoute("bastiones");

// ---- explorar por departamento ----
var byDept={}; D.municipios.forEach(function(m){ (byDept[m.dnm]=byDept[m.dnm]||[]).push(m); });
var depByName={}; D.departamentos.forEach(function(d){ depByName[d.depto]=d; });
function renderDept(name){
  var d=depByName[name]; if(!d){ document.getElementById("deptPanel").innerHTML=""; return; }
  var muns=(byDept[name]||[]).slice().sort(function(a,b){return b.v2-a.v2;});
  var estr = d.won ? (d.c2>=58?"Consolidar la base y proyectar candidaturas locales":"Cuidar lo ganado y sumar el centro")
                   : (d.c2>=45?"Frente amplio por la vida: disputar el centro":"Sembrar y persistir");
  var html="<div class='dept-card'><div class='dh'><h3>"+name+"</h3>"
    +(d.won?"<span class='badge b-win'>Ganamos</span>":"<span class='badge b-lose'>Perdimos</span>")+"</div>"
    +"<div class='stats'>"
    +"<div class='stat'><b>"+pc(d.c2)+"</b><span>2ª vuelta (a dos)</span></div>"
    +"<div class='stat'><b>"+sgn(d.sw)+"</b><span>cambio vs 2022</span></div>"
    +"<div class='stat'><b>"+(d.mgv>=0?"+":"")+fmt(d.mgv)+"</b><span>margen en votos</span></div>"
    +"<div class='stat'><b>"+d.gan+" / "+d.munis+"</b><span>municipios ganados</span></div>"
    +"</div><p class='txt'><b>Estrategia regional:</b> "+estr+". Entra a un municipio para ver su detalle y sus puestos.</p>"
    +"<div class='mun-grid'>"+muns.map(function(m){
        return "<button class='muni' data-slug='"+m.slug+"'><div class='mn'>"+m.nm+"</div><div class='mv'>"+pc(m.c2)+" · "+fmt(m.v2)+" votos · "+(m.won?"ganamos":"perdimos")+"</div></button>"; }).join("")
    +"</div></div>";
  document.getElementById("deptPanel").innerHTML=html;
}
(function(){ var sel=document.getElementById("deptSel");
  D.departamentos.slice().sort(function(a,b){return a.depto.localeCompare(b.depto);}).forEach(function(d){
    var o=document.createElement("option"); o.value=d.depto; o.textContent=d.depto+"  ("+(d.won?"ganamos":"perdimos")+")"; sel.appendChild(o); });
  sel.addEventListener("change", function(){ if(this.value) renderDept(this.value); });
})();
document.getElementById("deptPanel").addEventListener("click", function(e){
  var b=e.target.closest(".muni"); if(!b) return; var m=byslug[b.dataset.slug]; if(m) openDetail(m);
});
document.getElementById("resetMap").addEventListener("click", resetMap);
document.getElementById("detail").addEventListener("click", function(e){ if(e.target.closest(".backlink")) resetMap(); });
})();
