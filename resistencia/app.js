(function(){
"use strict";
var D = window.RES_DATA; if(!D){ return; }
var R = D.resumen;
var byslug = {}; D.municipios.forEach(function(m){ byslug[m.slug]=m; });
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
var layer=null, selected=null;
function style(f){ var m=byslug[f.properties.slug];
  return { fillColor:colorFor(m,MODE), weight:.4, color:"#fff", fillOpacity:m?0.9:0.5 }; }
function onEach(f,lyr){
  var m=byslug[f.properties.slug];
  lyr.on("mouseover",function(){ lyr.setStyle({weight:1.6,color:"#241a3a"}); lyr.bringToFront(); tip(m,f); });
  lyr.on("mouseout",function(){ if(lyr!==selected) layer.resetStyle(lyr); hideTip(); });
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
  el.innerHTML="<div class='card'><div class='dh'><h3>"+m.nm+"</h3><span class='dep'>"+m.dnm+"</span> "+badge+"<span class='ruta-tag'>"+m.ruta+"</span></div>"
    +"<div class='stats'>"
    +"<div class='stat'><b>"+pc(m.c2)+"</b><span>2ª vuelta (a dos)</span></div>"
    +"<div class='stat'><b>"+pc(m.c1)+"</b><span>1ª vuelta</span></div>"
    +"<div class='stat'><b>"+sgn(m.sw)+"</b><span>cambio vs 2022</span></div>"
    +"<div class='stat'><b>"+(m.mgv>=0?"+":"")+fmt(m.mgv)+"</b><span>margen en votos</span></div>"
    +"<div class='stat'><b>"+pc(m.ce)+"</b><span>centro 1ª v. (Fajardo+Claudia)</span></div>"
    +"<div class='stat'><b>"+pc(m.bl)+"</b><span>blanco 2ª v.</span></div>"
    +"<div class='stat'><b>"+sgn(m.mob)+"%</b><span>movilización 1v→2v</span></div>"
    +"<div class='stat'><b>"+fmt(m.v2)+"</b><span>votos válidos 2ª v.</span></div>"
    +"</div><p class='txt'>"+txt+"</p>"+link+"</div>";
  el.scrollIntoView({behavior:"smooth",block:"nearest"});
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
  if(hit){ openDetail(hit); flashSlug(hit.slug); }
});
function flashSlug(slug){ if(!layer) return; layer.eachLayer(function(l){ if(l.feature.properties.slug===slug){ selectLayer(l); map.fitBounds(l.getBounds(),{maxZoom:9,padding:[40,40]}); } }); }

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
  var b=e.target.closest(".muni"); if(!b) return; var m=byslug[b.dataset.slug]; if(m){ openDetail(m); flashSlug(m.slug); }
});
renderRoute("bastiones");
})();
