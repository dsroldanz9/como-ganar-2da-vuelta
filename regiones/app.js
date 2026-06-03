const DATA = window.REGIONES_DATA;
const municipios = DATA.municipios;
const detail = DATA.detalle;
const COL = { ganada:'#544595', disputa:'#F3930D', adversa:'#8a94a6' };
const TXT = { ganada:'Ganamos', disputa:'En disputa', adversa:'Difícil' };
const PRIOR = { disputa:0, ganada:1, adversa:2 };
let selectedDept = 'todos';
let selectedSlug = municipios[0]?.slug;
let markerLayer;
let puestoMap;
let scatter;

const $ = id => document.getElementById(id);
const fmt = n => n==null || Number.isNaN(+n) ? '—' : (+n).toLocaleString('es-CO');
const co = n => n==null || Number.isNaN(+n) ? '—' : String(n).replace('.', ',');
const pct = n => n==null || Number.isNaN(+n) ? '—' : `${co(n)}%`;
const pts = n => n==null || Number.isNaN(+n) ? '—' : `${n >= 0 ? '+' : ''}${co(n)} pts`;
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const swClass = n => n <= -6 ? 'loss-strong' : n < -1 ? 'loss' : n <= 1 ? 'stable' : 'gain';
const swColor = n => n <= -6 ? '#c7312b' : n < -1 ? '#F3930D' : n <= 1 ? '#b9c0cc' : '#544595';

function renderSummary(){
  $('summary').innerHTML = `
    <div class="kpi"><b>${fmt(DATA.resumen.departamentos)}</b><span>departamentos/regiones</span></div>
    <div class="kpi"><b>${fmt(DATA.resumen.municipios)}</b><span>municipios con resultado</span></div>
    <div class="kpi"><b>${pct(DATA.resumen.cepeda)}</b><span>Cepeda agregado</span></div>
    <div class="kpi"><b>${fmt(DATA.resumen.votos_cepeda)}</b><span>votos Cepeda</span></div>
    <div class="kpi"><b>${fmt(DATA.resumen.votos_total)}</b><span>votos válidos</span></div>`;
  $('gen').textContent = `Actualizado: ${DATA.generado || ''}`;
}

function renderDeptOptions(){
  $('dept').innerHTML = '<option value="todos">Todos</option>' + DATA.departamentos
    .map(d => `<option value="${d.depto_slug}">${d.depto}</option>`).join('');
  $('deptStrip').innerHTML = DATA.departamentos.slice(0, 12).map(d => `
    <button class="dept-card ${d.depto_slug === selectedDept ? 'active' : ''}" data-dept="${d.depto_slug}" type="button">
      <h3>${d.depto}</h3>
      <p><b>${pct(d.cepeda)}</b> · ${fmt(d.municipios)} municipios · ${fmt(d.votos_total)} votos</p>
    </button>`).join('');
  document.querySelectorAll('.dept-card').forEach(b => b.addEventListener('click', () => {
    selectedDept = b.dataset.dept;
    $('dept').value = selectedDept;
    update();
  }));
}

function currentRows(){
  const q = norm($('q').value);
  const estado = $('estado').value;
  return municipios.filter(m => {
    if (selectedDept !== 'todos' && m.depto_slug !== selectedDept) return false;
    if (estado !== 'todos' && m.estado !== estado) return false;
    if (q && !norm(`${m.municipio} ${m.depto}`).includes(q)) return false;
    return true;
  });
}

function sorted(rows){
  const mode = $('sort').value;
  const arr = rows.slice();
  if (mode === 'votos') return arr.sort((a,b)=>b.votos_total-a.votos_total);
  if (mode === 'caida') return arr.sort((a,b)=>a.swing-b.swing);
  if (mode === 'jovenes') return arr.sort((a,b)=>(b.joven ?? -1)-(a.joven ?? -1));
  return arr.sort((a,b)=>{
    const p = PRIOR[a.estado]-PRIOR[b.estado];
    if (p) return p;
    return b.votos_total-a.votos_total;
  });
}

const map = L.map('map', { scrollWheelZoom:false }).setView([4.8,-74.2], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution:'© OSM, © CARTO', maxZoom:18 }).addTo(map);

function markerRadius(m){ return Math.max(4, Math.min(18, Math.sqrt(m.votos_total)/75)); }
function renderMap(rows){
  if (markerLayer) markerLayer.remove();
  markerLayer = L.layerGroup().addTo(map);
  const visible = rows.filter(m => m.lat != null && m.lon != null).slice(0, 950);
  visible.forEach(m => {
    const mk = L.circleMarker([m.lat,m.lon], { radius:markerRadius(m), color:'#fff', weight:1.4, fillColor:COL[m.estado], fillOpacity:.88 }).addTo(markerLayer);
    mk.bindTooltip(`<b>${m.municipio}</b><br>${m.depto}<br>Cepeda ${pct(m.cepeda)} · ${pts(m.swing)}<br>${fmt(m.votos_total)} votos`);
    mk.on('click', () => selectMun(m.slug, true));
  });
  if (visible.length && selectedDept !== 'todos') {
    map.fitBounds(visible.map(m => [m.lat,m.lon]), { padding:[24,24] });
  } else {
    map.setView([4.8,-74.2], 5);
  }
}

function renderList(rows){
  const list = sorted(rows).slice(0, 180);
  $('count').textContent = `${fmt(rows.length)} municipios`;
  $('note').textContent = list.length < rows.length ? `mostrando ${list.length}` : 'todos visibles';
  $('list').innerHTML = list.map(m => `
    <button class="mun-item ${m.estado} ${m.slug === selectedSlug ? 'active' : ''}" data-slug="${m.slug}" type="button">
      <div><h3>${m.municipio}</h3><p>${m.depto} · ${TXT[m.estado]} · ${m.n_puestos} puestos</p></div>
      <b>${pct(m.cepeda)}</b>
    </button>`).join('') || '<p>Sin municipios para este filtro.</p>';
  document.querySelectorAll('.mun-item').forEach(b => b.addEventListener('click', () => selectMun(b.dataset.slug, true)));
}

function renderDetail(slug){
  const d = detail[slug];
  if (!d) return;
  selectedSlug = slug;
  if (puestoMap) { puestoMap.remove(); puestoMap = null; }
  $('detail').innerHTML = `
    <div>
      <h2>${d.municipio}</h2>
      <p>${d.depto} · ${TXT[d.estado]} · ${fmt(d.n_puestos)} puestos</p>
      <div class="detail-text">${d.texto}</div>
      ${d.puntos?.length ? '<div id="puestoMap"></div>' : ''}
    </div>
    <aside class="metrics">
      <div><b>${pct(d.cepeda)}</b><span>Cepeda</span></div>
      <div><b>${pct(d.derecha)}</b><span>Derecha</span></div>
      <div><b class="${swClass(d.swing)}">${pts(d.swing)}</b><span>vs Petro 2022</span></div>
      <div><b>${fmt(d.votos_total)}</b><span>votos válidos</span></div>
      <div><b>${pct(d.joven)}</b><span>18 a 28 años</span></div>
      <div><b>${pct(d.mayor)}</b><span>65 años o más</span></div>
    </aside>`;
  if (d.puntos?.length) {
    puestoMap = L.map('puestoMap', { scrollWheelZoom:false }).setView([d.lat || 4.8, d.lon || -74.2], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution:'© OSM, © CARTO', maxZoom:18 }).addTo(puestoMap);
    d.puntos.forEach(p => {
      L.circleMarker([p.lat,p.lon], { radius:Math.max(4, Math.min(16, Math.sqrt(p.v || 1)/4)), color:'#fff', weight:1, fillColor:swColor(p.sw), fillOpacity:.86 })
        .addTo(puestoMap).bindTooltip(`<b>${p.n}</b><br>Cepeda ${pct(p.ap)} · ${fmt(p.v)} votos<br>${pts(p.sw)} vs 2022`);
    });
    puestoMap.fitBounds(d.puntos.map(p => [p.lat,p.lon]), { padding:[24,24] });
    setTimeout(() => puestoMap.invalidateSize(), 200);
  }
}

function renderCharts(rows){
  const sample = sorted(rows).filter(m => m.joven != null).slice(0, 450);
  if (scatter) scatter.destroy();
  scatter = new Chart($('scatter'), {
    type:'bubble',
    data:{datasets:Object.keys(COL).map(state => ({
      label:TXT[state],
      data:sample.filter(m => m.estado === state).map(m => ({ x:m.joven, y:m.cepeda, r:Math.max(3, Math.min(15, Math.sqrt(m.votos_total)/90)), label:`${m.municipio}, ${m.depto}` })),
      backgroundColor:`${COL[state]}bb`, borderColor:COL[state], borderWidth:1
    }))},
    options:{maintainAspectRatio:false, plugins:{tooltip:{callbacks:{label:c => `${c.raw.label}: joven ${pct(c.raw.x)}, Cepeda ${pct(c.raw.y)}`}}},
      scales:{x:{title:{display:true,text:'% poblacion 18-28'}}, y:{title:{display:true,text:'% Cepeda'}, min:0, max:100}}}
  });
  const recover = rows.filter(m => m.swing < -1).sort((a,b)=>a.swing-b.swing).slice(0,8);
  const mobilize = rows.filter(m => m.estado === 'ganada').sort((a,b)=>b.votos_cepeda-a.votos_cepeda).slice(0,8);
  $('rankings').innerHTML = `<h3>Recuperar</h3><ol class="rank-list">${recover.map(m=>`<li><span>${m.municipio}</span><b class="${swClass(m.swing)}">${pts(m.swing)}</b></li>`).join('')}</ol>
    <h3>Movilizar</h3><ol class="rank-list">${mobilize.map(m=>`<li><span>${m.municipio}</span><b>${fmt(m.votos_cepeda)}</b></li>`).join('')}</ol>`;
}

function selectMun(slug, scroll){
  renderDetail(slug);
  renderList(currentRows());
  if (scroll) $('detail').scrollIntoView({ behavior:'smooth', block:'start' });
}

function update(){
  selectedDept = $('dept').value;
  renderDeptOptions();
  const rows = currentRows();
  if (rows.length && !rows.some(m => m.slug === selectedSlug)) selectedSlug = sorted(rows)[0].slug;
  $('mapTitle').textContent = selectedDept === 'todos' ? 'Mapa nacional' : `Mapa de ${DATA.departamentos.find(d => d.depto_slug === selectedDept)?.depto || ''}`;
  renderMap(rows);
  renderList(rows);
  renderDetail(selectedSlug);
  renderCharts(rows);
}

$('dept').addEventListener('input', update);
$('q').addEventListener('input', update);
$('estado').addEventListener('input', update);
$('sort').addEventListener('input', update);
$('reset').addEventListener('click', () => {
  $('dept').value = 'todos'; $('q').value = ''; $('estado').value = 'todos'; $('sort').value = 'estrategia';
  selectedDept = 'todos'; update();
});

renderSummary();
renderDeptOptions();
update();
