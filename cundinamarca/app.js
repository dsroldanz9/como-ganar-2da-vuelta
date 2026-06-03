/* Cundinamarca municipio a municipio — piloto estático */
const D = window.MUN_DATA;
const COL = { ganada:'#544595', disputa:'#F3930D', adversa:'#8a94a6' };
const TAG = { ganada:'g', disputa:'d', adversa:'a' };
const TXT = { ganada:'Ganamos', disputa:'En disputa', adversa:'Difícil' };
const fmt = n => (n==null||Number.isNaN(+n))?'—':(+n).toLocaleString('es-CO');
const co  = n => (n==null||Number.isNaN(+n))?'—':(+n).toString().replace('.',',');
const pts = n => (n==null)?'—':`${n>=0?'+':''}${co(n)} pts`;
const swColor = s => s<=-6?'#c7312b':s<-1?'#F3930D':s<=1?'#b9c0cc':'#544595';
let cmap=null, mchart=null;

try{
document.getElementById('gen').textContent = 'Actualizado: ' + (D.generado||'');
document.getElementById('count').textContent = `(${D.municipios.length})`;

/* mapa departamental */
const map = L.map('map',{scrollWheelZoom:false}).setView([4.9,-74.3],8);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM, © CARTO',maxZoom:18}).addTo(map);
const markers={};
const okLL = v => v!=null && !isNaN(v);
D.municipios.forEach(c=>{
  if(!okLL(c.lat)||!okLL(c.lon)) return;
  const m=L.circleMarker([c.lat,c.lon],{radius:7,color:'#fff',weight:1.5,fillColor:COL[c.estado],fillOpacity:.92})
    .addTo(map).bindTooltip(`${c.municipio} · Cepeda ${co(c.cepeda)}%`);
  m.on('click',()=>selectMun(c.slug)); markers[c.slug]=m;
});

/* lista + buscador */
function renderList(filter=''){
  const f = filter.trim().toLowerCase();
  const rows = D.municipios.slice()
    .filter(c=>c.municipio.toLowerCase().includes(f))
    .sort((a,b)=>({disputa:0,ganada:1,adversa:2}[a.estado]-{disputa:0,ganada:1,adversa:2}[b.estado]) || Math.abs(b.swing)-Math.abs(a.swing));
  document.getElementById('list').innerHTML = rows.map(c=>`
    <button class="mun-item" data-slug="${c.slug}">
      <span class="mi-name">${c.municipio}</span>
      <span class="mi-meta"><b>${co(c.cepeda)}%</b><span class="tag ${TAG[c.estado]}">${TXT[c.estado]}</span></span>
    </button>`).join('') || '<p class="hint">Sin resultados.</p>';
  document.querySelectorAll('.mun-item').forEach(b=>b.onclick=()=>selectMun(b.dataset.slug));
}
document.getElementById('q').addEventListener('input', e=>renderList(e.target.value));
renderList();

/* gráfica etaria (dispersión jóvenes vs apoyo) */
const ept = D.municipios.filter(c=>c.joven!=null);
mchart = new Chart(document.getElementById('etario'),{
  type:'scatter',
  data:{datasets:[{
    data: ept.map(c=>({x:c.joven, y:c.cepeda, m:c.municipio})),
    backgroundColor: ept.map(c=>swColor(c.swing)), pointRadius:5, pointHoverRadius:7 }]},
  options:{plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`${c.raw.m}: ${co(c.raw.x)}% jóvenes · ${co(c.raw.y)}% Cepeda`}}},
    scales:{x:{title:{display:true,text:'% jóvenes 18–28'}},y:{title:{display:true,text:'% voto Cepeda'}}}}
});

/* detalle por municipio */
function selectMun(slug){
  const d = D.detalle[slug]; if(!d) return;
  if(cmap){cmap.remove();cmap=null;}
  const swCss = d.swing<0?'#c7312b':'#544595';
  const com = d.comunas&&d.comunas.length ? `<div class="chart-box"><h3>Por comuna/sector</h3>
    <ul class="fort">${d.comunas.slice(0,10).map(c=>`<li><span>${c.comuna}</span><b>${co(c.apoyo)}% · ${pts(c.swing)}</b></li>`).join('')}</ul></div>` : '';
  const eta = d.joven!=null ? `<div class="chart-box"><h3>Perfil etario (DANE 2026)</h3>
    <div class="kpis kpis3">
      <div class="kpi"><div class="n">${co(d.joven)}%</div><div class="l">18–28 años</div></div>
      <div class="kpi"><div class="n">${co(d.mayor)}%</div><div class="l">65 o más</div></div>
      <div class="kpi"><div class="n">${co(d.mujeres)}%</div><div class="l">Mujeres 18+</div></div>
    </div></div>` : '';
  document.getElementById('detail').innerHTML = `
    <div class="dh"><h2>${d.municipio}</h2><span class="tag ${TAG[d.estado]}">${TXT[d.estado]}</span></div>
    <div class="kpis">
      <div class="kpi"><div class="n">${co(d.cepeda)}%</div><div class="l">Iván Cepeda</div><div class="delta" style="color:${swCss}">${pts(d.swing)} vs 2022</div></div>
      <div class="kpi"><div class="n">${co(d.derecha)}%</div><div class="l">Bloque derecha</div></div>
      <div class="kpi"><div class="n">${fmt(d.votos_cepeda)}</div><div class="l">Votos por Cepeda</div></div>
      <div class="kpi"><div class="n">${d.n_puestos}</div><div class="l">Puestos</div></div>
    </div>
    <div class="card"><p>${d.texto}</p></div>
    ${d.puntos&&d.puntos.length?`<div class="chart-box"><h3>Mapa por puesto de votación</h3>
      <p class="hint">Cada punto es un puesto: rojo = cayó vs 2022, morado = creció; tamaño = votos por Cepeda.</p>
      <div id="cmap"></div></div>`:''}
    ${com}${eta}`;

  if(d.puntos&&d.puntos.length){
    cmap=L.map('cmap',{scrollWheelZoom:false}).setView([(d.lat&&!isNaN(d.lat))?d.lat:4.9,(d.lon&&!isNaN(d.lon))?d.lon:-74.3],11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM, © CARTO',maxZoom:18}).addTo(cmap);
    const la=[],lo=[];
    d.puntos.forEach(p=>{la.push(p.lat);lo.push(p.lon);
      L.circleMarker([p.lat,p.lon],{radius:Math.max(4,Math.min(16,Math.sqrt(p.v||1)/4)),color:'#fff',weight:1,fillColor:swColor(p.sw),fillOpacity:.85})
       .addTo(cmap).bindTooltip(`<b>${p.n}</b><br>Cepeda ${p.ap}% · ${fmt(p.v)} votos<br>${p.sw>=0?'+':''}${p.sw} pts vs 2022`);});
    if(la.length) cmap.fitBounds([[Math.min(...la),Math.min(...lo)],[Math.max(...la),Math.max(...lo)]],{padding:[25,25]});
    setTimeout(()=>cmap.invalidateSize(),200);
  }
  document.getElementById('detail').scrollIntoView({behavior:'smooth',block:'start'});
}
selectMun(D.municipios.slice().sort((a,b)=>b.votos_cepeda-a.votos_cepeda)[0].slug);
}catch(e){window.__APPERR=(e&&e.stack)||String(e);var _l=document.getElementById('list');if(_l)_l.innerHTML='<pre style="font-size:11px;white-space:pre-wrap;color:#c00">'+window.__APPERR+'</pre>';}
