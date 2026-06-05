(function () {
  const data = window.CIUDADES13;
  const geo = window.APP_GEO || {};
  const puestos = window.PUESTOS13 || {};
  if (!data) { console.error("Sin CIUDADES13"); return; }

  const CL_COLOR = { 1: "#7b2ff7", 2: "#c8d400", 3: "#2746e6", 4: "#8a94a6" };
  const SEG_SHORT = { 1: "Base afín", 2: "Alta competencia", 3: "Derecha en avance", 4: "No priorizado" };
  const TIER_COLOR = { "Fortín": "#7b2ff7", "En disputa": "#c8d400", "Escenario difícil": "#2746e6" };
  const PERF = {}; (data.perfiles || []).forEach((p) => { PERF[p.key] = p; });
  const perfColor = (c) => (c && PERF[c.perf]) ? PERF[c.perf].color : "#9aa3b2";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmtPct = (v) => Number.isFinite(+v) ? `${(+v).toFixed(1).replace(".", ",")}%` : "—";
  const fmtNum = (v) => Number.isFinite(+v) ? Math.round(+v).toLocaleString("es-CO") : "—";
  const fmtPts = (v) => Number.isFinite(+v) ? `${v > 0 ? "+" : ""}${(+v).toFixed(1).replace(".", ",")} pts` : "—";
  const keyJS = (x) => {
    x = String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    x = x.replace(/\b(COMUNA|LOCALIDAD|LOC|NO|CORREGIMIENTO|CORR)\b/g, " ").replace(/\s+/g, " ").trim();
    const desc = x.replace(/[0-9]/g, "").trim();
    return desc.length >= 3 ? desc : x.replace(/[^0-9]/g, "");
  };

  const cityBySlug = new Map(data.ciudades.map((c) => [c.slug, c]));
  const comunasByCity = new Map();
  const comunaByKey = new Map();
  data.comunas.forEach((c) => {
    if (!comunasByCity.has(c.slug)) comunasByCity.set(c.slug, []);
    comunasByCity.get(c.slug).push(c);
    comunaByKey.set(c.slug + "|" + c.gkey, c);
  });

  const els = {
    cityTiers: document.getElementById("cityTiers"), citySelect: document.getElementById("citySelect"),
    colorSelect: document.getElementById("colorSelect"), fitBtn: document.getElementById("fitBtn"),
    puestoToggle: document.getElementById("puestoToggle"),
    mapTitle: document.getElementById("mapTitle"), mapLegend: document.getElementById("mapLegend"),
    cityHead: document.getElementById("cityHead"), summary: document.getElementById("summaryCards"),
    listTitle: document.getElementById("listTitle"), comunaLists: document.getElementById("comunaLists"),
    lineCards: document.getElementById("lineCards"), methodology: document.getElementById("methodology"),
    puestoLegend: document.getElementById("puestoLegend"),
    votoPanel: document.getElementById("votoPanel"), prioPanel: document.getElementById("prioPanel"),
  };
  const defaultCity = data.ciudades.some((c) => c.slug === "cali") ? "cali" : data.ciudades[0]?.slug;
  const state = { city: defaultCity, colorMode: "segmento", showPuestos: false };
  let map, layer, puestoLayer, bounds;

  const colorOf = (c) => state.colorMode === "linea" ? ((data.lineas[c.linea] || {}).color || "#8a94a6") : (CL_COLOR[c.cluster] || "#8a94a6");

  function renderTiers() {
    const order = ["Fortín", "En disputa", "Escenario difícil"];
    els.cityTiers.innerHTML = order.map((t) => {
      const cities = data.ciudades.filter((c) => c.tier === t);
      if (!cities.length) return "";
      return `<div class="tier-group" style="--seg:${TIER_COLOR[t]}">
        <div class="tier-head"><span class="seg-dot" style="background:${TIER_COLOR[t]}"></span><b>${esc(t)}</b><span>${cities.length} ciudades</span></div>
        <div class="tier-cities">${cities.map((c) => `<button class="city-chip${c.slug === state.city ? " active" : ""}" data-slug="${esc(c.slug)}"><b>${esc(c.ciudad)}</b><span>${fmtPct(c.cepeda)} · ${c.n_comunas} comunas</span></button>`).join("")}</div>
      </div>`;
    }).join("");
    els.cityTiers.querySelectorAll(".city-chip").forEach((b) => b.addEventListener("click", () => selectCity(b.dataset.slug)));
  }
  function fillCitySelect() {
    els.citySelect.innerHTML = data.ciudades.map((c) => `<option value="${esc(c.slug)}">${esc(c.ciudad)} — ${esc(c.tier)}</option>`).join("");
    els.citySelect.value = state.city;
  }
  function initMap() {
    map = L.map("map", { scrollWheelZoom: false, preferCanvas: false }).setView([4.6, -74.1], 11);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "&copy; OSM, &copy; CARTO", maxZoom: 19 }).addTo(map);
    layer = L.layerGroup().addTo(map);
    puestoLayer = L.layerGroup();
  }
  const isFino = (slug) => (data.finoCiudades || []).includes(slug);
  function puestosOf(slug) { return isFino(slug) ? (data.puestosFino[slug] || []) : (puestos[slug] || []); }
  function drawPuestos() {
    puestoLayer.clearLayers();
    renderPuestoLegend();
    if (!state.showPuestos) { if (map.hasLayer(puestoLayer)) map.removeLayer(puestoLayer); return; }
    const fino = isFino(state.city);
    puestosOf(state.city).forEach((p) => {
      let col, tip;
      if (fino) {  // voto REAL por puesto
        const pf = PERF[p.perf]; col = pf ? pf.color : "#9aa3b2";
        tip = `<strong>${esc(p.n)}</strong><span>${esc(p.comuna)} · <b style="color:${col}">${esc(pf ? pf.label : "")}</b></span><span>${fmtPct(p.cepeda)} Cepeda · ${fmtPts(p.caida)} vs 2022</span>`;
      } else {     // hereda el rendimiento de su comuna
        const c = comunaByKey.get(state.city + "|" + p.ck); col = perfColor(c); const pf = c && PERF[c.perf];
        tip = c ? `<strong>${esc(p.n)}</strong><span>${esc(c.comuna)} · <b style="color:${col}">${esc(pf ? pf.label : "")}</b></span><span>${fmtPct(c.cepeda)} Cepeda · ${fmtPts(c.caida)} vs 2022</span>`
                : `<strong>${esc(p.n)}</strong><span>puesto de votación · sin dato de comuna</span>`;
      }
      L.circleMarker([p.lat, p.lon], { radius: 3.4, color: "#ffffff", weight: .7, fillColor: col, fillOpacity: .95 })
        .bindTooltip(`<div class="map-tip">${tip}</div>`, { sticky: true }).addTo(puestoLayer);
    });
    if (!map.hasLayer(puestoLayer)) puestoLayer.addTo(map);
  }
  function renderPuestoLegend() {
    if (!els.puestoLegend) return;
    if (!state.showPuestos) { els.puestoLegend.innerHTML = ""; els.puestoLegend.style.display = "none"; return; }
    els.puestoLegend.style.display = "";
    const fino = isFino(state.city);
    const sub = fino ? `<span class="pl-sub">★ Voto <b>real por puesto</b> (Cepeda y caída calculados en cada puesto).</span>`
                     : `<span class="pl-sub">Cada puesto toma el rendimiento de <b>su comuna</b>.</span>`;
    els.puestoLegend.innerHTML = `<span class="pl-title">Puestos de votación — ¿cómo vamos?</span>` + sub +
      (data.perfiles || []).map((p) => `<span class="pl-item"><i class="pl-dot" style="background:${p.color}"></i><b>${esc(p.label)}</b> — ${esc(p.desc)}</span>`).join("");
  }
  function drawMap() {
    layer.clearLayers();
    const fc = geo[state.city];
    if (!fc) { return; }
    const gj = L.geoJSON(fc, {
      style: (f) => {
        const c = comunaByKey.get(state.city + "|" + keyJS(f.properties.comuna));
        return { color: "#ffffff", weight: 1.2, fillColor: c ? colorOf(c) : "#e3e6ec", fillOpacity: c ? .78 : .4 };
      },
      onEachFeature: (f, lyr) => {
        const c = comunaByKey.get(state.city + "|" + keyJS(f.properties.comuna));
        if (c) lyr.bindTooltip(`<div class="map-tip"><strong>${esc(c.comuna)}</strong><span>${esc(c.segmento)} · ${esc((data.lineas[c.linea] || {}).corto || c.linea)}</span><span>${fmtPct(c.cepeda)} Cepeda · ${fmtPts(c.caida)} vs 2022</span><span>prioridad ${c.score}/100</span></div>`, { sticky: true });
        else lyr.bindTooltip(`<div class="map-tip"><strong>${esc(f.properties.comuna)}</strong><span>sin dato</span></div>`, { sticky: true });
      }
    }).addTo(layer);
    bounds = gj.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(.05), { animate: false });
    renderLegend();
  }
  function renderLegend() {
    if (state.colorMode === "linea") {
      els.mapLegend.innerHTML = ["L1", "L2", "L3"].map((k) => `<span><i class="sw" style="background:${data.lineas[k].color}"></i> ${k} · ${esc(data.lineas[k].corto)}</span>`).join("");
    } else {
      els.mapLegend.innerHTML = [1, 2, 3, 4].map((cl) => `<span><i class="sw" style="background:${CL_COLOR[cl]}"></i> ${esc(SEG_SHORT[cl])}</span>`).join("");
    }
  }
  function renderCity() {
    const city = cityBySlug.get(state.city); if (!city) return;
    els.mapTitle.textContent = `Comunas de ${city.ciudad}`;
    els.listTitle.textContent = `Comunas de ${city.ciudad} — priorización por segmento`;
    els.cityHead.innerHTML = `<div class="city-head" style="--seg:${TIER_COLOR[city.tier]}">
      <span class="tier-badge" style="background:${TIER_COLOR[city.tier]}">${esc(city.tier)}</span>${isFino(city.slug) ? '<span class="fino-badge">★ nivel puesto</span>' : ''}
      <h3>${esc(city.ciudad)}</h3><p>${fmtPct(city.cepeda)} de voto Cepeda · ${city.n_comunas} comunas</p>
      <p class="muted">${esc((data.tiers.find((t) => t.key === city.tier) || {}).desc || "")}</p></div>`;
    const list = comunasByCity.get(state.city) || [];
    const byCl = {}; list.forEach((c) => { (byCl[c.cluster] = byCl[c.cluster] || []).push(c); });
    const total = list.reduce((a, c) => a + (c.votos || 0), 0);
    const nPuestos = puestosOf(state.city).length;
    const fino = isFino(state.city);
    els.summary.innerHTML = `
      <div class="metric"><span>Comunas</span><strong>${list.length}</strong><span>en ${esc(city.ciudad)}</span></div>
      <div class="metric"><span>Voto Cepeda ciudad</span><strong>${fmtPct(city.cepeda)}</strong><span>${fmtNum(total)} votos</span></div>
      <div class="metric${fino ? " metric-fino" : ""}"><span>Puestos de votación${fino ? " ★" : ""}</span><strong>${fmtNum(nPuestos)}</strong><span>${fino ? "voto real por puesto" : "actívalos en el mapa"}</span></div>`;
    els.comunaLists.innerHTML = [1, 2, 3, 4].map((cl) => {
      const rows = (byCl[cl] || []).slice().sort((a, b) => b.score - a.score);
      if (!rows.length) return "";
      return `<article class="seg-list" style="--seg:${CL_COLOR[cl]}">
        <header><span class="seg-dot" style="background:${CL_COLOR[cl]}"></span><div><h3>${esc(rows[0].segmento)}</h3><p>${rows.length} comunas · ${esc((data.lineas[rows[0].linea] || {}).corto || "")}</p></div></header>
        <ol class="seg-items">${rows.map((c) => `<li class="seg-item"><span class="seg-rank">${esc(c.comuna)}</span><span class="seg-score"><b>${c.score}</b><small>${fmtPct(c.cepeda)} · ${fmtPts(c.caida)}</small></span></li>`).join("")}</ol>
      </article>`;
    }).join("");
    document.querySelectorAll(".city-chip").forEach((b) => b.classList.toggle("active", b.dataset.slug === state.city));
    renderVoto(city); renderPrioridades(city);
  }
  const bar = (label, val, color, sub) => `<div class="vbar"><span class="vbar-l">${esc(label)}</span><div class="vbar-track"><i style="width:${Math.max(2, Math.min(100, +val || 0))}%;background:${color}"></i></div><span class="vbar-v">${fmtPct(val)}${sub ? ` <small>${esc(sub)}</small>` : ""}</span></div>`;
  function renderVoto(city) {
    if (!els.votoPanel) return;
    els.votoPanel.innerHTML = `
      <div class="voto-block">
        <h4>Cómo votó la ciudad <small>(% de votos válidos, 1ª vuelta 2026)</small></h4>
        ${bar("Izquierda · Cepeda", city.cepeda, "#7b2ff7")}
        ${bar("Centro · Fajardo + C. López", city.centro, "#8a94a6")}
        ${bar("Derecha · Abelardo + Paloma", city.der, "#f3930d")}
      </div>
      <div class="voto-block">
        <h4>Perfil de la ciudad <small>(DANE, agregados — no dicen cómo votó cada persona)</small></h4>
        ${bar("18 a 28 años", city.joven, "#2474a6")}
        ${bar("65 o más", city.mayor, "#e6a700")}
        ${bar("Mujeres", city.mujeres, "#b5179e")}
        <p class="muted vsmall">${fmtNum(city.votos)} votos a Cepeda · ${city.n_comunas} comunas. El estrato y la participación por comuna no están disponibles para estas ciudades (sí en el tablero de Bogotá).</p>
      </div>`;
  }
  function renderPrioridades(city) {
    if (!els.prioPanel) return;
    const list = (comunasByCity.get(state.city) || []).slice();
    const recuperar = list.filter((c) => c.caida < 0).sort((a, b) => a.caida - b.caida).slice(0, 6);
    const movilizar = list.slice().sort((a, b) => b.votos - a.votos).slice(0, 6);
    const col = (title, sub, rows, metric) => `<div class="prio-col"><h4>${esc(title)}</h4><p class="muted vsmall">${esc(sub)}</p>${rows.map((c) => `<div class="prio-item"><span><b>${esc(c.comuna)}</b><small>${esc((PERF[c.perf] || {}).label || "")}</small></span><span class="prio-m">${metric(c)}</span></div>`).join("") || '<p class="muted vsmall">—</p>'}</div>`;
    els.prioPanel.innerHTML =
      col("Recuperar (dónde caímos)", "Comunas con mayor caída vs 2022.", recuperar, (c) => `<b>${fmtPts(c.caida)}</b><small>${fmtNum(c.votos)} votos</small>`) +
      col("Movilizar (volumen propio)", "Comunas que más votos nos aportan.", movilizar, (c) => `<b>${fmtNum(c.votos)}</b><small>${fmtPct(c.cepeda)} Cepeda</small>`);
  }
  function selectCity(slug) { state.city = slug; els.citySelect.value = slug; drawMap(); drawPuestos(); renderCity(); }
  function renderLineCards() {
    els.lineCards.innerHTML = ["L1", "L2", "L3"].map((k) => { const l = data.lineas[k];
      return `<article class="line-card" style="border-top:5px solid ${l.color}"><h3>${esc(l.titulo)}</h3><p><b>${esc(l.corto)}</b></p><p>${esc(l.objetivo)}</p><ul class="mini">${l.mensajes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></article>`; }).join("");
  }
  function renderMethodology() {
    const m = data.metodologia;
    els.methodology.innerHTML = `<div class="metodo-text"><p><b>${esc(m.algoritmo)}</b> · ${m.n_ciudades} ciudades · ${m.n_comunas} comunas · 4 segmentos por ciudad.</p>
      <p><b>Variables:</b></p><ul>${m.variables.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
      <p class="doc-note" style="background:#fbf6e6;border:1px solid #ead79a;border-radius:10px;padding:10px;">${esc(m.relativo)}</p>
      <p class="muted">${esc(m.fuente)}</p></div>`;
  }
  els.citySelect.addEventListener("change", () => selectCity(els.citySelect.value));
  els.colorSelect.addEventListener("change", () => { state.colorMode = els.colorSelect.value; drawMap(); drawPuestos(); });
  if (els.puestoToggle) els.puestoToggle.addEventListener("change", () => { state.showPuestos = els.puestoToggle.checked; drawPuestos(); });
  els.fitBtn.addEventListener("click", () => { if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(.05)); });
  renderTiers(); fillCitySelect(); initMap(); renderLineCards(); renderMethodology(); selectCity(state.city);
})();
