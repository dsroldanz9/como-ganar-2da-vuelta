const DATA = window.APP_DATA;

const COL = { ganada: '#2B37D6', disputa: '#F9A01B', adversa: '#8a94a6' };
const TAG = { ganada: 'g', disputa: 'd', adversa: 'a' };
const ESTADO_TXT = { ganada: 'Ganamos', disputa: 'En disputa', adversa: 'Difícil' };
const PRIORIDAD = { disputa: 0, ganada: 1, adversa: 2 };

let currentSlug = null;
let cityMap = null;
let cityGeoLayer = null;
let currentMapMode = 'swing';

const fmt = n => (n == null || Number.isNaN(Number(n))) ? '—' : Number(n).toLocaleString('es-CO');
const co = n => (n == null || Number.isNaN(Number(n))) ? '—' : Number(n).toString().replace('.', ',');
const pts = n => (n == null || Number.isNaN(Number(n))) ? '—' : `${n >= 0 ? '+' : ''}${co(n)} pts`;
const swColor = s => s <= -6 ? '#F4501E' : s < -1 ? '#F9A01B' : s <= 1 ? '#b9c0cc' : '#2B37D6';
const swLabel = s => s <= -6 ? 'Perdimos fuerte' : s < -1 ? 'Perdimos' : s <= 1 ? 'Estable' : 'Ganamos terreno';
const swClass = s => s <= -6 ? 'loss-strong' : s < -1 ? 'loss' : s <= 1 ? 'stable' : 'gain';
const swText = s => `<span class="swing-text ${swClass(s)}">${pts(s)}</span>`;
const areaName = d => d.unidad === 'localidad' ? 'localidades' : 'comunas';
const mapModeLabel = {
  swing: 'Cambio vs 2022',
  apoyo: 'Apoyo actual',
  volumen: 'Volumen de votos'
};

function legendHtml(mode) {
  if (mode === 'apoyo') {
    return '<b>Apoyo actual</b><i style="background:#F4501E"></i><35%<i style="background:#F9A01B"></i>35-45%<i style="background:#b9c0cc"></i>45-52%<i style="background:#2B37D6"></i>>52%<br><span class="maplg-note">Áreas: comuna/localidad · puntos: puestos</span>';
  }
  if (mode === 'volumen') {
    return '<b>Volumen de votos</b><i style="background:#CCD2F7"></i>bajo<i style="background:#7D86E8"></i>medio<i style="background:#2B37D6"></i>alto<i style="background:#1D268F"></i>muy alto<br><span class="maplg-note">Intensidad morada = más votos por Cepeda</span>';
  }
  return '<b>Cambio vs 2022</b><i style="background:#F4501E"></i>perdimos fuerte<i style="background:#F9A01B"></i>perdimos<i style="background:#b9c0cc"></i>estable<i style="background:#2B37D6"></i>ganamos<br><span class="maplg-note">Áreas: comuna/localidad · puntos: puestos</span>';
}

function mapFillColor(props, mode, maxVotes = 1) {
  if (mode === 'apoyo') {
    return props.apoyo < 35 ? '#F4501E' : props.apoyo < 45 ? '#F9A01B' : props.apoyo < 52 ? '#b9c0cc' : '#2B37D6';
  }
  if (mode === 'volumen') {
    const x = Math.max(0, Math.min(1, (props.votos || 0) / maxVotes));
    if (x > .75) return '#1D268F';
    if (x > .5) return '#2B37D6';
    if (x > .25) return '#7D86E8';
    return '#CCD2F7';
  }
  return swColor(props.swing);
}

const strategicRows = rows => (rows && rows.length)
  ? rows.map(r => `<li><span>${r.comuna}</span><b>${co(r.apoyo)}% · ${fmt(r.votos)} votos</b></li>`).join('')
  : '<li class="empty-row"><span>Sin territorio claro en esta categoría</span><b>—</b></li>';

const fallRows = rows => (rows && rows.length)
  ? rows.map(r => `<li class="${swClass(r.swing)}"><span>${r.comuna}</span><b><span class="swing-text ${swClass(r.swing)}">${pts(r.swing)}</span> · ${fmt(r.votos)} votos</b></li>`).join('')
  : '<li class="empty-row"><span>Sin datos territoriales suficientes</span><b>—</b></li>';

document.getElementById('gen').textContent = `Actualizado: ${DATA.generado || ''}`;
document.getElementById('m-ciudades').textContent = DATA.ciudades.length;
document.getElementById('m-ganadas').textContent = DATA.ciudades.filter(c => c.estado === 'ganada').length;
document.getElementById('m-disputa').textContent = DATA.ciudades.filter(c => c.estado === 'disputa').length;

const sortedCities = () => DATA.ciudades.slice().sort((a, b) => {
  const p = PRIORIDAD[a.estado] - PRIORIDAD[b.estado];
  if (p !== 0) return p;
  return Math.abs(b.swing) - Math.abs(a.swing);
});

function renderCards() {
  const cards = sortedCities().map(c => {
    return `<article class="city-card" data-slug="${c.slug}" tabindex="0">
      <div class="city-card-body">
        <div class="city-card-top">
          <h3>${c.ciudad}</h3>
          <span class="tag ${TAG[c.estado]}">${ESTADO_TXT[c.estado]}</span>
        </div>
        <div class="card-metrics">
          <span><b>${co(c.cepeda)}%</b>Cepeda</span>
          <span><b>${fmt(c.votos_cepeda)}</b>votos Cepeda</span>
        </div>
        <p>Total votos válidos: <b>${fmt(c.votos_total)}</b></p>
      </div>
    </article>`;
  }).join('');

  document.getElementById('cityCards').innerHTML = cards;
  document.querySelectorAll('.city-card').forEach(card => {
    const go = () => selectCity(card.dataset.slug, true);
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(); });
  });
}

const map = L.map('map', { scrollWheelZoom: false }).setView([4.9, -74.7], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap, © CARTO',
  maxZoom: 18
}).addTo(map);

DATA.ciudades.forEach(c => {
  const marker = L.circleMarker([c.lat, c.lon], {
    radius: 10,
    color: '#fff',
    weight: 2,
    fillColor: COL[c.estado],
    fillOpacity: 0.95
  }).addTo(map).bindTooltip(`${c.ciudad} · Cepeda ${co(c.cepeda)}% · ${swText(c.swing)}`);
  marker.on('click', () => selectCity(c.slug, true));
});

function renderStrategyBlock(d) {
  return `<div class="strategy-grid">
    <div class="strategy-col recover">
      <h3>Recuperar</h3>
      <p>${areaName(d)} competitivas donde cayó el voto afín.</p>
      <ul>${strategicRows(d.recuperar)}</ul>
    </div>
    <div class="strategy-col mobilize">
      <h3>Fortalecer</h3>
      <p>Fortines con volumen para cuidar participación.</p>
      <ul>${strategicRows(d.fortalecer)}</ul>
    </div>
    <div class="strategy-col decisive">
      <h3>Decisivas</h3>
      <p>Territorios grandes o parejos donde el esfuerzo rinde.</p>
      <ul>${strategicRows(d.decisivas)}</ul>
    </div>
  </div>`;
}

function renderDetail(d) {
  const etario = d.texto.etario ? `<section class="analysis-block">
    <div class="section-head compact">
      <div>
        <h2>Perfil etario territorial</h2>
        <p>No dice cómo votó una persona; cruza edad y territorio para orientar mensaje.</p>
      </div>
    </div>
    <div class="kpis kpis3">
      <div class="kpi"><div class="n">${co(d.edad_joven)}%</div><div class="l">18 a 28 años</div></div>
      <div class="kpi"><div class="n">${co(d.edad_mayor)}%</div><div class="l">65 años o más</div></div>
      <div class="kpi"><div class="n">${co(d.edad_mujeres)}%</div><div class="l">Mujeres 18+</div></div>
    </div>
    <p class="analysis-text">${d.texto.etario}</p>
  </section>` : '';

  document.getElementById('detalle').innerHTML = `<div class="detail-head">
    <div>
      <span class="overline">${d.depto} · ${d.unidad === 'localidad' ? 'análisis por localidad' : 'análisis por comuna'}</span>
      <h2>${d.ciudad}</h2>
    </div>
    <span class="tag ${TAG[d.estado]}">${ESTADO_TXT[d.estado]}</span>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="n">${co(d.cepeda)}%</div><div class="l">Iván Cepeda</div><div class="delta ${swClass(d.swing)}">${pts(d.swing)} vs 2022</div></div>
    <div class="kpi"><div class="n">${co(d.derecha)}%</div><div class="l">Bloque derecha</div></div>
    <div class="kpi"><div class="n">${fmt(d.votos_cepeda)}</div><div class="l">Votos por Cepeda</div></div>
    <div class="kpi"><div class="n">${d.n_puestos}</div><div class="l">Puestos usados como dato</div></div>
  </div>

  <section class="analysis-block">
    <h2>Resumen estratégico</h2>
    <div class="text-grid">
      <article><h3>Diagnóstico</h3><p>${d.texto.diagnostico}</p></article>
      <article><h3>Qué hacer</h3><p>${d.texto.quehacer}</p></article>
      <article class="wide"><h3>Público y territorio</h3><p>${d.texto.publico}</p></article>
      <article class="wide accent"><h3>Cómo se ganó en 2022</h3><p>${d.texto.gano22}</p></article>
    </div>
  </section>

  <section class="analysis-block">
    <div class="section-head compact">
      <div>
        <h2>Plan territorial</h2>
        <p>Acciones por ${areaName(d)}, no por nombres de puestos de votación.</p>
      </div>
    </div>
    ${renderStrategyBlock(d)}
  </section>

  ${etario}

  <section class="analysis-block map-section">
    <div class="section-head compact">
      <div>
        <h2>Mapa de ${areaName(d)} y puestos de votación</h2>
        <p>Rojo/naranja: perdimos frente a 2022. Gris: estable. Morado: ganamos terreno. Las áreas son localidades/comunas y los puntos son puestos de votación.</p>
      </div>
      <div class="map-modes" role="group" aria-label="Capas del mapa">
        <button class="active" type="button" data-map-mode="swing">Cambio</button>
        <button type="button" data-map-mode="apoyo">Apoyo</button>
        <button type="button" data-map-mode="volumen">Votos</button>
      </div>
    </div>
    <div class="map-layout">
      <div id="cmap"></div>
      <div class="rank-panel">
        <div id="mapFocus" class="map-focus">
          <span>Explora el mapa</span>
          <h3>Pasa el mouse o toca una zona</h3>
          <p>Verás datos agregados por ${d.unidad}; si tocas un punto, verás el puesto de votación.</p>
        </div>
        <h3>Dónde cayó más</h3>
        <ul>${fallRows(d.comuna_fall)}</ul>
      </div>
    </div>
  </section>

  ${d.galeria && d.galeria.length ? `<section class="analysis-block">
    <h2>Capas de análisis a detalle</h2>
    <div class="galeria">${d.galeria.map(g => `<figure><figcaption>${g.t}</figcaption><img src="${g.img}" alt="${g.t}" loading="lazy"><p>${g.a || ''}</p></figure>`).join('')}</div>
  </section>` : ''}`;
}

function renderCityMap(d) {
  if (cityMap) {
    cityMap.remove();
    cityMap = null;
  }
  cityGeoLayer = null;
  currentMapMode = 'swing';
  if (!d.puntos || !d.puntos.length) return;

  cityMap = L.map('cmap', { scrollWheelZoom: false }).setView([d.lat, d.lon], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM, © CARTO',
    maxZoom: 18
  }).addTo(cityMap);

  const gj = (window.APP_GEO || {})[d.slug];
  const maxVotes = gj && gj.features ? Math.max(...gj.features.map(f => f.properties.votos || 0), 1) : 1;
  const focus = document.getElementById('mapFocus');
  const updateFocus = props => {
    if (!focus || !props) return;
    focus.className = `map-focus ${swClass(props.swing)}`;
    if (props.kind === 'puesto') {
      focus.innerHTML = `<span>Puesto de votación</span>
        <h3>${props.nombre}</h3>
        <div class="focus-kpis">
          <span><b>${co(props.apoyo)}%</b><small>Cepeda</small></span>
          <span><b class="swing-text ${swClass(props.swing)}">${pts(props.swing)}</b><small>vs 2022</small></span>
          <span><b>${fmt(props.votos)}</b><small>votos Cepeda</small></span>
        </div>`;
      return;
    }
    focus.innerHTML = `<span>${swLabel(props.swing)}</span>
      <h3>${props.comuna}</h3>
      <div class="focus-kpis">
        <span><b>${co(props.apoyo)}%</b><small>Cepeda</small></span>
        <span><b class="swing-text ${swClass(props.swing)}">${pts(props.swing)}</b><small>vs 2022</small></span>
        <span><b>${fmt(props.votos)}</b><small>votos Cepeda</small></span>
        <span><b>${fmt(props.total)}</b><small>votos válidos</small></span>
      </div>`;
  };
  if (gj) {
    cityGeoLayer = L.geoJSON(gj, {
      style: f => ({ fillColor: mapFillColor(f.properties, currentMapMode, maxVotes), fillOpacity: 0.72, color: '#fff', weight: 1.4 }),
      onEachFeature: (f, l) => {
        const props = f.properties;
        l.bindTooltip(`<div class="map-tip ${swClass(props.swing)}"><b>${props.comuna}</b><span>${swLabel(props.swing)}</span><br>Cepeda ${props.apoyo}% · ${swText(props.swing)}<br>${fmt(props.votos)} votos Cepeda · ${fmt(props.total)} válidos</div>`, { sticky: true, direction: 'top' });
        l.on({
          mouseover: e => {
            e.target.setStyle({ weight: 3, color: '#2a2740', fillOpacity: 0.88 });
            updateFocus(props);
          },
          mouseout: e => {
            e.target.setStyle({ weight: 1.4, color: '#fff', fillOpacity: 0.72 });
          },
          click: e => {
            updateFocus(props);
            cityMap.fitBounds(e.target.getBounds(), { padding: [40, 40], maxZoom: 13 });
          }
        });
      }
    }).addTo(cityMap);
    try { cityMap.fitBounds(cityGeoLayer.getBounds(), { padding: [18, 18] }); } catch (e) {}
  }

  document.querySelectorAll('[data-map-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMapMode = btn.dataset.mapMode;
      document.querySelectorAll('[data-map-mode]').forEach(x => x.classList.toggle('active', x === btn));
      if (cityGeoLayer) {
        cityGeoLayer.setStyle(f => ({
          fillColor: mapFillColor(f.properties, currentMapMode, maxVotes),
          fillOpacity: 0.72,
          color: '#fff',
          weight: 1.4
        }));
      }
      const legendBox = document.querySelector('.maplg');
      if (legendBox) legendBox.innerHTML = legendHtml(currentMapMode);
    });
  });

  const lats = [];
  const lons = [];
  d.puntos.forEach(p => {
    lats.push(p.lat);
    lons.push(p.lon);
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: Math.max(3, Math.min(9, Math.sqrt(p.v || 1) / 12)),
      color: '#fff',
      weight: 1,
      fillColor: swColor(p.sw),
      fillOpacity: gj ? 0.62 : 0.82
    }).addTo(cityMap).bindTooltip(`<div class="map-tip ${swClass(p.sw)}"><b>${p.n}</b><span>Puesto de votación</span><br>Cepeda ${p.ap}% · ${fmt(p.v)} votos<br>${swText(p.sw)} vs 2022</div>`);
    marker.on({
      mouseover: () => updateFocus({ kind: 'puesto', nombre: p.n, apoyo: p.ap, swing: p.sw, votos: p.v }),
      click: () => updateFocus({ kind: 'puesto', nombre: p.n, apoyo: p.ap, swing: p.sw, votos: p.v })
    });
  });
  if (lats.length && !gj) {
    cityMap.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], { padding: [25, 25] });
  }

  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const x = L.DomUtil.create('div', 'maplg');
    x.innerHTML = legendHtml(currentMapMode);
    return x;
  };
  legend.addTo(cityMap);
  setTimeout(() => cityMap.invalidateSize(), 180);
}

function selectCity(slug, scroll = false) {
  const d = DATA.detalle[slug];
  if (!d) return;
  currentSlug = slug;
  document.querySelectorAll('.city-card').forEach(c => c.classList.toggle('active', c.dataset.slug === slug));
  map.setView([d.lat, d.lon], 8, { animate: true });
  renderDetail(d);
  renderCityMap(d);
  if (scroll) document.getElementById('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('reset-sort').addEventListener('click', () => {
  renderCards();
  if (currentSlug) document.querySelector(`.city-card[data-slug="${currentSlug}"]`)?.classList.add('active');
});

renderCards();
selectCity('bogota', false);
