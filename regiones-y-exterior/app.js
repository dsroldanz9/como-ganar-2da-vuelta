const DATA = window.REGIONES_DATA;
const municipios = DATA.municipios;
const detail = DATA.detalle;
const COL = { ganada: '#544595', disputa: '#F3930D', adversa: '#8a94a6' };
const TXT = { ganada: 'Ganamos', disputa: 'En disputa', adversa: 'Difícil' };
const PRIOR = { disputa: 0, ganada: 1, adversa: 2 };

let selectedDept = 'todos';
let selectedSlug = municipios[0]?.slug;
let markerLayer;
let geoBySlug = null;
let puestoMap;
let scatter;

const $ = id => document.getElementById(id);
const fmt = n => n == null || Number.isNaN(+n) ? '—' : (+n).toLocaleString('es-CO');
const co = n => n == null || Number.isNaN(+n) ? '—' : String(n).replace('.', ',');
const pct = n => n == null || Number.isNaN(+n) ? '—' : `${co(n)}%`;
const pts = n => n == null || Number.isNaN(+n) ? '—' : `${n >= 0 ? '+' : ''}${co(n)} pts`;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const swClass = n => n <= -6 ? 'loss-strong' : n < -1 ? 'loss' : n <= 1 ? 'stable' : 'gain';
const swColor = n => n <= -6 ? '#c7312b' : n < -1 ? '#F3930D' : n <= 1 ? '#b9c0cc' : '#544595';

function rightVotes(row) {
  return Math.round((row.derecha || 0) * (row.votos_total || 0) / 100);
}

function aggregate(rows) {
  const total = rows.reduce((s, m) => s + (m.votos_total || 0), 0);
  const cepedaVotes = rows.reduce((s, m) => s + (m.votos_cepeda || 0), 0);
  const derechaVotes = rows.reduce((s, m) => s + rightVotes(m), 0);
  const cepeda = total ? +(100 * cepedaVotes / total).toFixed(1) : null;
  const derecha = total ? +(100 * derechaVotes / total).toFixed(1) : null;
  const deficit = Math.max(0, derechaVotes - cepedaVotes + 1);
  const deficitPts = total ? +(100 * deficit / total).toFixed(1) : 0;
  return { total, cepedaVotes, derechaVotes, cepeda, derecha, deficit, deficitPts };
}

function targetText(rows) {
  const a = aggregate(rows);
  if (!rows.length) return { big: '—', label: 'Sin filtro activo', body: 'No hay municipios en este filtro.' };
  if (a.deficit <= 0) {
    const ventaja = a.cepedaVotes - a.derechaVotes;
    return {
      big: `+${fmt(ventaja)}`,
      label: 'votos de ventaja',
      body: `Este filtro ya queda arriba: Cepeda ${pct(a.cepeda)} vs derecha ${pct(a.derecha)}. La tarea es cuidar participación y testigos.`
    };
  }
  return {
    big: fmt(a.deficit),
    label: 'votos nuevos netos para superar derecha',
    body: `Meta mínima del filtro: subir ${pts(a.deficitPts)} o sumar ${fmt(a.deficit)} votos netos por Cepeda. Si es persuasión directa, la mitad de ese movimiento también sirve.`
  };
}

function renderSummary(rows) {
  const a = aggregate(rows);
  const target = targetText(rows);
  const deps = new Set(rows.map(m => m.depto)).size;
  $('summary').innerHTML = `
    <div class="kpi"><b>${fmt(deps)}</b><span>departamentos en filtro</span></div>
    <div class="kpi"><b>${fmt(rows.length)}</b><span>territorios visibles</span></div>
    <div class="kpi"><b>${pct(a.cepeda)}</b><span>Cepeda agregado</span></div>
    <div class="kpi"><b>${pct(a.derecha)}</b><span>derecha agregada</span></div>
    <div class="kpi target-kpi"><b>${target.big}</b><span>${target.label}</span><p>${target.body}</p></div>`;
  $('gen').textContent = `Actualizado: ${DATA.generado || ''}`;
}

function renderDeptOptions() {
  if (!$('dept').options.length) {
    $('dept').innerHTML = '<option value="todos">Todos</option>' + DATA.departamentos
      .map(d => `<option value="${d.depto_slug}">${d.depto}</option>`).join('');
  }
  const hasFilter = selectedDept !== 'todos' || $('estado').value !== 'todos' || norm($('q').value);
  $('deptStrip').classList.toggle('is-hidden', !!hasFilter);
  if (hasFilter) {
    $('deptStrip').innerHTML = '';
    return;
  }
  $('deptStrip').innerHTML = DATA.departamentos.map(d => `
    <button class="dept-card ${d.depto_slug === selectedDept ? 'active' : ''}" data-dept="${d.depto_slug}" type="button">
      <h3>${d.depto}</h3>
      <p><b>${pct(d.cepeda)}</b> · ${fmt(d.municipios)} ${d.depto === 'Exterior' ? 'consulados' : 'municipios'} · ${fmt(d.votos_total)} votos</p>
    </button>`).join('');
  document.querySelectorAll('.dept-card').forEach(b => b.addEventListener('click', () => {
    selectedDept = b.dataset.dept;
    $('dept').value = selectedDept;
    update();
  }));
}

function currentRows() {
  const q = norm($('q').value);
  const estado = $('estado').value;
  return municipios.filter(m => {
    if (selectedDept !== 'todos' && m.depto_slug !== selectedDept) return false;
    if (estado !== 'todos' && m.estado !== estado) return false;
    if (q && !norm(`${m.municipio} ${m.depto}`).includes(q)) return false;
    return true;
  });
}

function sorted(rows) {
  const mode = $('sort').value;
  const arr = rows.slice();
  const q = norm($('q').value);
  const qScore = m => {
    if (!q) return 0;
    const name = norm(m.municipio);
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    return 2;
  };
  if (mode === 'votos') return arr.sort((a, b) => qScore(a) - qScore(b) || b.votos_total - a.votos_total);
  if (mode === 'caida') return arr.sort((a, b) => qScore(a) - qScore(b) || a.swing - b.swing);
  if (mode === 'jovenes') return arr.sort((a, b) => qScore(a) - qScore(b) || (b.joven ?? -1) - (a.joven ?? -1));
  return arr.sort((a, b) => {
    const qs = qScore(a) - qScore(b);
    if (qs) return qs;
    const p = PRIOR[a.estado] - PRIOR[b.estado];
    if (p) return p;
    return b.votos_total - a.votos_total;
  });
}

const map = L.map('map', { scrollWheelZoom: false }).setView([4.8, -74.2], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OSM, © CARTO', maxZoom: 18 }).addTo(map);

function markerRadius(m) { return Math.max(4, Math.min(18, Math.sqrt(m.votos_total) / 75)); }

function renderMap(rows) {
  if (markerLayer) markerLayer.remove();
  markerLayer = L.layerGroup().addTo(map);

  // Choropleth por municipio (polígonos) cuando el geojson ya cargó
  if (geoBySlug) {
    const feats = rows.map(m => geoBySlug.get(m.slug)).filter(Boolean);
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: f => ({ fillColor: COL[f.properties.estado] || '#cfd3dc', fillOpacity: .82, color: '#ffffff', weight: .6 }),
      onEachFeature: (f, l) => {
        const p = f.properties;
        l.bindTooltip(`<b>${p.municipio}</b><br>${p.depto}<br>Cepeda ${pct(p.cepeda)} · ${pts(p.swing)}<br>${fmt(p.votos)} votos`, { sticky: true });
        l.on('click', () => selectMun(p.slug, true));
        l.on('mouseover', () => l.setStyle({ weight: 1.8, color: '#352963' }));
        l.on('mouseout', () => l.setStyle({ weight: .6, color: '#ffffff' }));
      }
    }).addTo(markerLayer);
    // puntos para municipios sin polígono (no quedan invisibles)
    const sinPoly = rows.filter(m => m.lat != null && m.lon != null && !geoBySlug.has(m.slug));
    sinPoly.forEach(m => L.circleMarker([m.lat, m.lon], { radius: markerRadius(m), color: '#fff', weight: 1.2, fillColor: COL[m.estado], fillOpacity: .85 })
      .addTo(markerLayer).bindTooltip(`<b>${m.municipio}</b><br>${m.depto}<br>Cepeda ${pct(m.cepeda)} · ${pts(m.swing)}`).on('click', () => selectMun(m.slug, true)));
    if (feats.length && selectedDept !== 'todos') { try { map.fitBounds(layer.getBounds(), { padding: [24, 24] }); } catch (e) {} }
    else if (selectedDept === 'todos') map.setView([4.8, -74.2], 5);
    return;
  }

  // Respaldo: puntos mientras carga el geojson
  const visible = rows.filter(m => m.lat != null && m.lon != null).slice(0, 950);
  visible.forEach(m => {
    const mk = L.circleMarker([m.lat, m.lon], { radius: markerRadius(m), color: '#fff', weight: 1.4, fillColor: COL[m.estado], fillOpacity: .88 }).addTo(markerLayer);
    mk.bindTooltip(`<b>${m.municipio}</b><br>${m.depto}<br>Cepeda ${pct(m.cepeda)} · ${pts(m.swing)}<br>${fmt(m.votos_total)} votos`);
    mk.on('click', () => selectMun(m.slug, true));
  });
  if (visible.length && selectedDept !== 'todos') map.fitBounds(visible.map(m => [m.lat, m.lon]), { padding: [24, 24] });
  else map.setView([4.8, -74.2], 5);
}

function renderList(rows) {
  const list = sorted(rows).slice(0, 180);
  const ext = rows.filter(m => m.depto === 'Exterior').length;
  const mun = rows.length - ext;
  $('count').textContent = (mun && ext) ? `${fmt(mun)} municipios + ${fmt(ext)} del exterior`
    : ext ? `${fmt(ext)} puestos del exterior` : `${fmt(mun)} municipios`;
  $('note').textContent = list.length < rows.length ? `mostrando ${list.length}` : 'todos visibles';
  $('list').innerHTML = list.map(m => `
    <button class="mun-item ${m.estado} ${m.slug === selectedSlug ? 'active' : ''}" data-slug="${m.slug}" type="button">
      <div><h3>${m.municipio}</h3><p>${m.depto} · ${TXT[m.estado]} · ${m.n_puestos} puestos</p></div>
      <b>${pct(m.cepeda)}</b>
    </button>`).join('') || '<p>Sin municipios para este filtro.</p>';
  document.querySelectorAll('.mun-item').forEach(b => b.addEventListener('click', () => selectMun(b.dataset.slug, true)));
}

function targetMini(d) {
  const derVotes = rightVotes(d);
  const deficit = Math.max(0, derVotes - d.votos_cepeda + 1);
  const deficitPts = d.votos_total ? +(100 * deficit / d.votos_total).toFixed(1) : 0;
  if (deficit <= 0) {
    return `<div class="win-box win"><b>Arriba por ${fmt(d.votos_cepeda - derVotes)}</b><span>votos frente a derecha. Cuidar participación.</span></div>`;
  }
  return `<div class="win-box"><b>${fmt(deficit)} votos</b><span>meta mínima para ganar aquí: ${pts(deficitPts)} netos por Cepeda.</span></div>`;
}

function renderDetail(slug) {
  const d = detail[slug];
  if (!d) return;
  selectedSlug = slug;
  if (puestoMap) { puestoMap.remove(); puestoMap = null; }
  $('detail').innerHTML = `
    <div>
      <h2>${d.municipio}</h2>
      <p>${d.depto} · ${TXT[d.estado]} · ${fmt(d.n_puestos)} puestos</p>
      ${targetMini(d)}
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
    puestoMap = L.map('puestoMap', { scrollWheelZoom: false }).setView([d.lat || 4.8, d.lon || -74.2], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OSM, © CARTO', maxZoom: 18 }).addTo(puestoMap);
    d.puntos.forEach(p => {
      L.circleMarker([p.lat, p.lon], { radius: Math.max(4, Math.min(16, Math.sqrt(p.v || 1) / 4)), color: '#fff', weight: 1, fillColor: swColor(p.sw), fillOpacity: .86 })
        .addTo(puestoMap).bindTooltip(`<b>${p.n}</b><br>Cepeda ${pct(p.ap)} · ${fmt(p.v)} votos<br>${pts(p.sw)} vs 2022`);
    });
    puestoMap.fitBounds(d.puntos.map(p => [p.lat, p.lon]), { padding: [24, 24] });
    setTimeout(() => puestoMap.invalidateSize(), 200);
  }
}

function chartRows(rows) {
  return sorted(rows).filter(m => m.joven != null).slice(0, 260);
}

function renderCharts(rows) {
  const sample = chartRows(rows);
  if (scatter) scatter.destroy();
  scatter = new Chart($('scatter'), {
    type: 'bubble',
    data: {
      datasets: Object.keys(COL).map(state => ({
        label: TXT[state],
        data: sample.filter(m => m.estado === state).map(m => ({
          x: m.joven,
          y: m.cepeda,
          r: Math.max(4, Math.min(16, Math.sqrt(m.votos_total) / 95)),
          label: `${m.municipio}, ${m.depto}`,
          slug: m.slug,
          votos: m.votos_total,
          swing: m.swing
        })),
        backgroundColor: `${COL[state]}cc`,
        borderColor: COL[state],
        borderWidth: 1
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: { mode: 'nearest', intersect: false },
      onClick: (_evt, points) => {
        if (!points.length) return;
        const p = points[0];
        const raw = scatter.data.datasets[p.datasetIndex].data[p.index];
        if (raw?.slug) selectMun(raw.slug, true);
      },
      plugins: {
        tooltip: {
          enabled: true,
          callbacks: {
            label: c => `${c.raw.label}: joven ${pct(c.raw.x)}, Cepeda ${pct(c.raw.y)}, ${fmt(c.raw.votos)} votos, ${pts(c.raw.swing)}`
          }
        },
        legend: { position: 'top' }
      },
      scales: {
        x: { title: { display: true, text: '% población 18-28' } },
        y: { title: { display: true, text: '% Cepeda' }, min: 0, max: 100 }
      }
    }
  });
  renderChartReading(rows, sample);
}

function mean(rows, field) {
  const vals = rows.map(r => r[field]).filter(v => v != null && !Number.isNaN(+v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function corr(rows) {
  const vals = rows.filter(r => r.joven != null && r.cepeda != null);
  if (vals.length < 3) return null;
  const mx = mean(vals, 'joven');
  const my = mean(vals, 'cepeda');
  const num = vals.reduce((s, r) => s + (r.joven - mx) * (r.cepeda - my), 0);
  const dx = Math.sqrt(vals.reduce((s, r) => s + Math.pow(r.joven - mx, 2), 0));
  const dy = Math.sqrt(vals.reduce((s, r) => s + Math.pow(r.cepeda - my, 2), 0));
  return dx && dy ? num / (dx * dy) : null;
}

function renderChartReading(rows, sample) {
  if (!rows.length) {
    $('chartRead').innerHTML = '<h3>Lectura del gráfico</h3><p>No hay municipios en este filtro.</p>';
    return;
  }
  if (rows.length === 1) {
    const d = detail[rows[0].slug];
    $('chartRead').innerHTML = `<h3>Lectura del gráfico</h3><p>Con un solo municipio el punto no muestra relación territorial, sino perfil local: ${d.municipio} tiene ${pct(d.joven)} de población 18-28 y Cepeda está en ${pct(d.cepeda)}. Para decidir acción, mira puestos de volumen y puestos con caída en Top estratégicos.</p>`;
    return;
  }
  const withAge = rows.filter(r => r.joven != null);
  const c = corr(withAge);
  const avgJ = mean(withAge, 'joven');
  const avgC = mean(withAge, 'cepeda');
  const youngStrong = withAge.filter(r => r.joven >= avgJ && r.cepeda >= avgC).sort((a, b) => b.votos_total - a.votos_total).slice(0, 3);
  const recoverYoung = withAge.filter(r => r.joven >= avgJ && r.swing < -1).sort((a, b) => a.swing - b.swing).slice(0, 3);
  const rel = c == null ? 'no alcanza muestra suficiente para estimar tendencia' :
    c > .25 ? 'hay una asociación positiva: los municipios más jóvenes tienden a dar más apoyo' :
    c < -.25 ? 'hay una asociación negativa: los municipios más jóvenes no están empujando más apoyo' :
    'no hay una relación clara: edad y voto no se mueven juntos de forma fuerte';
  $('chartRead').innerHTML = `<h3>Lectura del gráfico</h3>
    <p>Se cruza % de población 18-28 del DANE 2026 (eje X) con % Cepeda 2026 (eje Y). El tamaño del punto es volumen de votos válidos y el color indica si ganamos, disputamos o estamos difíciles. En este filtro ${rel}.</p>
    <p>Promedios del filtro: ${pct(avgJ)} jóvenes 18-28 y ${pct(avgC)} Cepeda. Territorios jóvenes y fuertes: ${youngStrong.map(m => m.municipio).join(', ') || 'sin casos claros'}. Jóvenes con caída para recuperar: ${recoverYoung.map(m => `${m.municipio} (${pts(m.swing)})`).join(', ') || 'sin casos claros'}.</p>`;
}

function rankLine(label, value, cls = '') {
  return `<li><span>${label}</span><b class="${cls}">${value}</b></li>`;
}

function renderMunicipioRanks(d) {
  const puestos = (d.puntos || []).slice();
  const zonas = (d.zonas || []).slice();
  const recover = puestos.filter(p => p.sw < -1).sort((a, b) => a.sw - b.sw).slice(0, 8);
  const strong = puestos.sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 8);
  const zoneRows = zonas.sort((a, b) => a.swing - b.swing).slice(0, 8);
  $('rankings').innerHTML = `
    <h3>Puestos a recuperar</h3><ol class="rank-list">${recover.map(p => rankLine(p.n, `${pts(p.sw)} · ${fmt(p.v)} votos`, swClass(p.sw))).join('') || '<li><span>Sin caídas fuertes en puestos enlazados</span><b>—</b></li>'}</ol>
    <h3>Puestos de volumen</h3><ol class="rank-list">${strong.map(p => rankLine(p.n, `${pct(p.ap)} · ${fmt(p.v)} votos`)).join('')}</ol>
    ${zoneRows.length ? `<h3>Localidades / zonas</h3><ol class="rank-list">${zoneRows.map(z => rankLine(z.comuna, `${pts(z.swing)} · ${fmt(z.votos)} votos`, swClass(z.swing))).join('')}</ol>` : ''}`;
}

function renderRegionRanks(rows) {
  const recover = rows.filter(m => m.swing < -1).sort((a, b) => a.swing - b.swing || b.votos_total - a.votos_total).slice(0, 8);
  const dispute = rows.filter(m => m.estado === 'disputa').sort((a, b) => b.votos_total - a.votos_total).slice(0, 8);
  const mobilize = rows.filter(m => m.estado === 'ganada').sort((a, b) => b.votos_cepeda - a.votos_cepeda).slice(0, 8);
  $('rankings').innerHTML = `
    <h3>Municipios a recuperar</h3><ol class="rank-list">${recover.map(m => rankLine(m.municipio, `${pts(m.swing)} · ${fmt(m.votos_total)} votos`, swClass(m.swing))).join('') || '<li><span>Sin caídas claras</span><b>—</b></li>'}</ol>
    <h3>Ciudades / municipios en disputa</h3><ol class="rank-list">${dispute.map(m => rankLine(m.municipio, `${pct(m.cepeda)} · ${fmt(m.votos_total)} votos`)).join('') || '<li><span>Sin disputas en el filtro</span><b>—</b></li>'}</ol>
    <h3>Fortalecer y movilizar</h3><ol class="rank-list">${mobilize.map(m => rankLine(m.municipio, `${fmt(m.votos_cepeda)} votos`)).join('') || '<li><span>Sin municipios ganados en el filtro</span><b>—</b></li>'}</ol>`;
}

function renderRankings(rows) {
  if (rows.length === 1) renderMunicipioRanks(detail[rows[0].slug]);
  else renderRegionRanks(rows);
}

function selectMun(slug, scroll) {
  renderDetail(slug);
  renderList(currentRows());
  renderMunicipioRanks(detail[slug]);
  if (scroll) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function update() {
  selectedDept = $('dept').value;
  renderDeptOptions();
  const rows = currentRows();
  if (rows.length && !rows.some(m => m.slug === selectedSlug)) selectedSlug = sorted(rows)[0].slug;
  $('mapTitle').textContent = selectedDept === 'todos' ? 'Mapa nacional' : `Mapa de ${DATA.departamentos.find(d => d.depto_slug === selectedDept)?.depto || ''}`;
  renderSummary(rows);
  renderMap(rows);
  renderList(rows);
  renderDetail(selectedSlug);
  renderCharts(rows);
  renderRankings(rows);
}

$('dept').addEventListener('input', update);
$('q').addEventListener('input', update);
$('estado').addEventListener('input', update);
$('sort').addEventListener('input', update);
$('reset').addEventListener('click', () => {
  $('dept').value = 'todos';
  $('q').value = '';
  $('estado').value = 'todos';
  $('sort').value = 'estrategia';
  selectedDept = 'todos';
  update();
});

renderDeptOptions();
update();

// Cargar polígonos de municipios y repintar como choropleth
fetch('municipios.geojson').then(r => r.json()).then(g => {
  geoBySlug = new Map();
  (g.features || []).forEach(f => { if (f.properties && f.properties.slug) geoBySlug.set(f.properties.slug, f); });
  update();
}).catch(() => { /* sin geojson: se quedan los puntos */ });
