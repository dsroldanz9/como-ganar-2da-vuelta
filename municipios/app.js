const DATA = window.MUNI_DATA;
const municipios = DATA.municipios;
const detailBySlug = new Map(DATA.detalle.map(d => [d.slug, d]));
const COL = { ganada: '#544595', disputa: '#F3930D', adversa: '#8a94a6' };
const TXT = { ganada: 'Ganamos', disputa: 'En disputa', adversa: 'Difícil' };
const PRIOR = { disputa: 0, ganada: 1, adversa: 2 };

let selected = municipios[0]?.slug;
let markerLayer;
let scatterChart;
let barChart;

const $ = id => document.getElementById(id);
const fmt = n => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('es-CO');
const co = n => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toString().replace('.', ',');
const pct = n => n == null || Number.isNaN(Number(n)) ? '—' : `${co(n)}%`;
const pts = n => n == null || Number.isNaN(Number(n)) ? '—' : `${n >= 0 ? '+' : ''}${co(n)} pts`;
const searchKey = m => `${m.municipio} ${m.depto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function swingClass(n) {
  if (n <= -6) return 'loss-strong';
  if (n < -1) return 'loss';
  if (n <= 1) return 'stable';
  return 'gain';
}

function stateFilters() {
  const q = $('q').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dept = $('dept').value;
  const estado = $('estado').value;
  const edad = $('edad').value;
  return municipios.filter(m => {
    if (q && !searchKey(m).includes(q)) return false;
    if (dept !== 'todos' && m.depto !== dept) return false;
    if (estado !== 'todos' && m.estado !== estado) return false;
    if (edad !== 'todos' && m.edad_tipo !== edad) return false;
    return true;
  });
}

function sorted(rows) {
  const mode = $('sort').value;
  const arr = rows.slice();
  const q = $('q').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const qScore = m => {
    if (!q) return 0;
    const name = m.municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    return 2;
  };
  if (q) arr.sort((a, b) => qScore(a) - qScore(b));
  if (mode === 'votos') return arr.sort((a, b) => b.votos_total - a.votos_total);
  if (mode === 'caida') return arr.sort((a, b) => a.swing - b.swing);
  if (mode === 'jovenes') return arr.sort((a, b) => (b.pct_18_28 ?? -1) - (a.pct_18_28 ?? -1));
  if (mode === 'mayores') return arr.sort((a, b) => (b.pct_65mas ?? -1) - (a.pct_65mas ?? -1));
  return arr.sort((a, b) => {
    if (q) {
      const s = qScore(a) - qScore(b);
      if (s) return s;
    }
    const p = PRIOR[a.estado] - PRIOR[b.estado];
    if (p) return p;
    return b.votos_total - a.votos_total;
  });
}

function renderSummary() {
  $('summaryKpis').innerHTML = `
    <div><b>${fmt(DATA.resumen.municipios)}</b><span>municipios con resultado</span></div>
    <div><b>${pct(DATA.resumen.cepeda)}</b><span>Cepeda nacional agregado</span></div>
    <div><b>${fmt(DATA.resumen.votos_cepeda)}</b><span>votos Cepeda</span></div>
    <div><b>${pct(DATA.resumen.joven_prom)}</b><span>promedio joven 18-28</span></div>`;
  $('gen').textContent = `Actualizado: ${DATA.generado || ''}`;
}

function renderFilters() {
  const depts = [...new Set(municipios.map(m => m.depto))].sort((a, b) => a.localeCompare(b, 'es'));
  $('dept').innerHTML = '<option value="todos">Todos</option>' + depts.map(d => `<option>${d}</option>`).join('');
}

const map = L.map('muniMap', { scrollWheelZoom: false }).setView([4.6, -74.4], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OSM, © CARTO',
  maxZoom: 18
}).addTo(map);

function radius(m) {
  return Math.max(4, Math.min(18, Math.sqrt(m.votos_total) / 58));
}

function renderMap(rows) {
  if (markerLayer) markerLayer.remove();
  markerLayer = L.layerGroup().addTo(map);
  rows.filter(m => m.lat != null && m.lon != null).slice(0, 900).forEach(m => {
    const mk = L.circleMarker([m.lat, m.lon], {
      radius: radius(m),
      color: '#fff',
      weight: 1.5,
      fillColor: COL[m.estado],
      fillOpacity: .86
    }).addTo(markerLayer);
    mk.bindTooltip(`<span class="muni-tip"><b>${m.municipio}</b><br>${m.depto}<br>Cepeda ${pct(m.cepeda)} · ${pts(m.swing)}<br>${fmt(m.votos_total)} votos válidos</span>`);
    mk.on('click', () => selectMunicipio(m.slug, true));
  });
}

function renderList(rows) {
  const top = sorted(rows).slice(0, 160);
  $('countTitle').textContent = `${fmt(rows.length)} municipios`;
  $('countNote').textContent = top.length < rows.length ? `mostrando ${top.length}` : 'todos visibles';
  $('muniList').innerHTML = top.map(m => `
    <button class="muni-row ${m.estado} ${m.slug === selected ? 'active' : ''}" data-slug="${m.slug}" type="button">
      <div>
        <h3>${m.municipio}</h3>
        <p>${m.depto} · ${TXT[m.estado]} · ${m.edad_tipo}</p>
      </div>
      <b>${pct(m.cepeda)}</b>
    </button>`).join('');
  document.querySelectorAll('.muni-row').forEach(btn => {
    btn.addEventListener('click', () => selectMunicipio(btn.dataset.slug, true));
  });
}

function ageAdvice(d) {
  if (d.pct_18_28 == null) return ['Sin cruce etario municipal DANE para este municipio. Usar resultado, volumen y estructura territorial local.'];
  const rows = [];
  if (d.pct_18_28 >= DATA.resumen.joven_prom + 2) rows.push('Municipio más joven que el promedio: redes, universidades, empleo joven y brigadas culturales pueden rendir más.');
  if (d.pct_65mas >= DATA.resumen.mayor_prom + 2) rows.push('Peso adulto alto: conviene presencia barrial, voz a voz, cuidado, salud y economía familiar.');
  if (d.swing < -1) rows.push('Hay caída frente a 2022: recuperar abstención afín y explicar con mensajes concretos, no solo identidad política.');
  if (d.estado === 'disputa') rows.push('Está en rango de pelea: un esfuerzo territorial pequeño puede mover el resultado municipal.');
  if (!rows.length) rows.push('Perfil equilibrado: combinar calle, redes y testigos sin concentrar todo en un solo canal.');
  return rows;
}

function renderDetail(slug) {
  const d = detailBySlug.get(slug);
  if (!d) return;
  selected = slug;
  const cls = swingClass(d.swing);
  $('detalle').innerHTML = `
    <div>
      <div class="detail-title">
        <h2>${d.municipio}</h2>
        <p>${d.depto} · ${TXT[d.estado]} · ${fmt(d.puestos)} puestos de votación</p>
      </div>
      <div class="detail-text">${d.texto}</div>
      <div class="age-read">
        <h3>Lectura etaria para campaña</h3>
        <ul>${ageAdvice(d).map(x => `<li>${x}</li>`).join('')}</ul>
      </div>
    </div>
    <aside>
      <div class="detail-metrics">
        <div><b>${pct(d.cepeda)}</b><span>Cepeda</span></div>
        <div><b>${pct(d.derecha)}</b><span>Derecha</span></div>
        <div><b class="swing-text ${cls}">${pts(d.swing)}</b><span>vs Petro 2022</span></div>
        <div><b>${fmt(d.votos_total)}</b><span>votos válidos</span></div>
        <div><b>${pct(d.pct_18_28)}</b><span>18 a 28 años</span></div>
        <div><b>${pct(d.pct_65mas)}</b><span>65 años o más</span></div>
      </div>
    </aside>`;
}

function renderRanks() {
  const row = (r, val) => `<li><span>${r.municipio}<small> · ${r.depto}</small></span><b>${val}</b></li>`;
  $('rankRecover').innerHTML = DATA.rankings.recuperar.slice(0, 8).map(r => row(r, `${pts(r.swing)} · ${fmt(r.votos_total)}`)).join('');
  $('rankMobilize').innerHTML = DATA.rankings.movilizar.slice(0, 8).map(r => row(r, `${pct(r.cepeda)} · ${fmt(r.votos_cepeda)}`)).join('');
  $('rankDispute').innerHTML = DATA.rankings.disputa.slice(0, 8).map(r => row(r, `${pts(r.margen)} margen`)).join('');
}

function renderCharts(rows) {
  const sample = rows.filter(m => m.pct_18_28 != null).slice(0, 450);
  if (scatterChart) scatterChart.destroy();
  scatterChart = new Chart($('ageScatter'), {
    type: 'bubble',
    data: {
      datasets: Object.keys(COL).map(state => ({
        label: TXT[state],
        data: sample.filter(m => m.estado === state).map(m => ({ x: m.pct_18_28, y: m.cepeda, r: Math.max(3, Math.min(16, Math.sqrt(m.votos_total) / 90)), label: `${m.municipio}, ${m.depto}` })),
        backgroundColor: `${COL[state]}bb`,
        borderColor: COL[state],
        borderWidth: 1
      }))
    },
    options: {
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.raw.label}: joven ${pct(ctx.raw.x)}, Cepeda ${pct(ctx.raw.y)}` } } },
      scales: {
        x: { title: { display: true, text: '% población 18-28' } },
        y: { title: { display: true, text: '% Cepeda' }, min: 0, max: 100 }
      }
    }
  });

  const young = DATA.rankings.jovenes.slice(0, 8);
  const adult = DATA.rankings.mayores.slice(0, 8);
  if (barChart) barChart.destroy();
  barChart = new Chart($('ageBars'), {
    type: 'bar',
    data: {
      labels: [...young.map(x => x.municipio), ...adult.map(x => x.municipio)],
      datasets: [{
        label: '% 18-28',
        data: [...young.map(x => x.pct_18_28), ...adult.map(x => null)],
        backgroundColor: '#544595'
      }, {
        label: '% 65+',
        data: [...young.map(x => null), ...adult.map(x => x.pct_65mas)],
        backgroundColor: '#F3930D'
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: '% población adulta' } } }
    }
  });
}

function updateAll() {
  const rows = stateFilters();
  if (rows.length && !rows.some(m => m.slug === selected)) selected = sorted(rows)[0].slug;
  renderMap(rows);
  renderList(rows);
  renderDetail(selected);
  renderCharts(sorted(rows));
}

function selectMunicipio(slug, scroll) {
  selected = slug;
  renderDetail(slug);
  renderList(stateFilters());
  if (scroll) $('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

['q', 'dept', 'estado', 'edad', 'sort'].forEach(id => $(id).addEventListener('input', updateAll));
$('resetFilters').addEventListener('click', () => {
  $('q').value = '';
  $('dept').value = 'todos';
  $('estado').value = 'todos';
  $('edad').value = 'todos';
  $('sort').value = 'estrategia';
  updateAll();
});

renderSummary();
renderFilters();
renderRanks();
updateAll();
