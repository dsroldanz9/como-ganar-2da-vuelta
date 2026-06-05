(function () {
  const data = window.CIUDADES13;
  if (!data) { console.error("Sin CIUDADES13"); return; }

  const CL_COLOR = { 1: "#7b2ff7", 2: "#2474a6", 3: "#f3930d", 4: "#8a94a6" };
  const TIER_COLOR = { "Fortín": "#7b2ff7", "En disputa": "#c8d400", "Escenario difícil": "#2746e6" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmtPct = (v) => Number.isFinite(+v) ? `${(+v).toFixed(1).replace(".", ",")}%` : "—";
  const fmtNum = (v) => Number.isFinite(+v) ? Math.round(+v).toLocaleString("es-CO") : "—";
  const fmtPts = (v) => Number.isFinite(+v) ? `${v > 0 ? "+" : ""}${(+v).toFixed(1).replace(".", ",")} pts` : "—";
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  const cityBySlug = new Map(data.ciudades.map((c) => [c.slug, c]));
  const comunasByCity = new Map();
  data.comunas.forEach((c) => { if (!comunasByCity.has(c.ciudad_slug)) comunasByCity.set(c.ciudad_slug, []); comunasByCity.get(c.ciudad_slug).push(c); });

  const els = {
    cityTiers: document.getElementById("cityTiers"),
    citySelect: document.getElementById("citySelect"),
    colorSelect: document.getElementById("colorSelect"),
    fitBtn: document.getElementById("fitBtn"),
    mapTitle: document.getElementById("mapTitle"),
    mapLegend: document.getElementById("mapLegend"),
    cityHead: document.getElementById("cityHead"),
    summary: document.getElementById("summaryCards"),
    listTitle: document.getElementById("listTitle"),
    comunaLists: document.getElementById("comunaLists"),
    lineCards: document.getElementById("lineCards"),
    methodology: document.getElementById("methodology"),
  };

  const state = { city: data.ciudades[0]?.slug, colorMode: "categoria" };
  let map, layer, bounds;

  function colorOf(c) {
    if (state.colorMode === "linea") return (data.lineas[c.linea]?.color) || "#8a94a6";
    return CL_COLOR[c.cluster] || "#8a94a6";
  }

  function renderTiers() {
    const order = ["Fortín", "En disputa", "Escenario difícil"];
    els.cityTiers.innerHTML = order.map((t) => {
      const cities = data.ciudades.filter((c) => c.tier === t);
      if (!cities.length) return "";
      return `<div class="tier-group" style="--seg:${TIER_COLOR[t]}">
        <div class="tier-head"><span class="seg-dot" style="background:${TIER_COLOR[t]}"></span><b>${esc(t)}</b><span>${cities.length} ciudades</span></div>
        <div class="tier-cities">${cities.map((c) => `
          <button class="city-chip${c.slug === state.city ? " active" : ""}" data-slug="${esc(c.slug)}">
            <b>${esc(c.ciudad)}</b><span>${fmtPct(c.cepeda)} · ${c.n_comunas} comunas</span></button>`).join("")}</div>
      </div>`;
    }).join("");
    els.cityTiers.querySelectorAll(".city-chip").forEach((b) => b.addEventListener("click", () => selectCity(b.dataset.slug)));
  }

  function fillCitySelect() {
    els.citySelect.innerHTML = data.ciudades.map((c) => `<option value="${esc(c.slug)}">${esc(c.ciudad)} — ${esc(c.tier)}</option>`).join("");
    els.citySelect.value = state.city;
  }

  function initMap() {
    map = L.map("map", { scrollWheelZoom: false, preferCanvas: true }).setView([4.6, -74.1], 11);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "&copy; OSM, &copy; CARTO", maxZoom: 19 }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function drawMap() {
    layer.clearLayers();
    const list = comunasByCity.get(state.city) || [];
    const pts = [];
    list.forEach((c) => {
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return;
      const m = L.circleMarker([c.lat, c.lon], {
        radius: clamp(Math.sqrt(c.votos || 1) / 14, 6, 22),
        color: "#fff", weight: 1.5, fillColor: colorOf(c), fillOpacity: .9
      });
      m.bindTooltip(`<div class="map-tip"><strong>${esc(c.comuna)}</strong><span>${esc(c.categoria)} · ${esc(data.lineas[c.linea]?.corto || c.linea)}</span><span>${fmtPct(c.cepeda)} Cepeda · ${fmtPts(c.caida)} vs 2022</span><span>prioridad ${c.score}/100</span></div>`, { sticky: true });
      m.addTo(layer); pts.push([c.lat, c.lon]);
    });
    if (pts.length) { bounds = L.latLngBounds(pts); map.fitBounds(bounds.pad(.15), { animate: false }); }
    renderLegend();
  }

  function renderLegend() {
    if (state.colorMode === "linea") {
      els.mapLegend.innerHTML = ["L1", "L2", "L3"].map((k) => `<span><i class="sw" style="background:${data.lineas[k].color}"></i> ${k} · ${esc(data.lineas[k].corto)}</span>`).join("");
    } else {
      const city = cityBySlug.get(state.city);
      const cats = catNamesForTier(city?.tier);
      els.mapLegend.innerHTML = cats.map((nm, i) => `<span><i class="sw" style="background:${CL_COLOR[i + 1]}"></i> ${esc(nm)}</span>`).join("");
    }
  }

  function catNamesForTier(tier) {
    // recupera los nombres en orden de clúster 1..4 desde las comunas de una ciudad de ese tier
    const sample = data.comunas.find((c) => c.tier === tier);
    const names = [1, 2, 3, 4].map((cl) => {
      const c = data.comunas.find((x) => x.tier === tier && x.cluster === cl);
      return c ? c.categoria : "—";
    });
    return names;
  }

  function renderCity() {
    const city = cityBySlug.get(state.city);
    if (!city) return;
    els.mapTitle.textContent = `Comunas de ${city.ciudad}`;
    els.listTitle.textContent = `Comunas de ${city.ciudad} — priorización`;
    els.cityHead.innerHTML = `<div class="city-head" style="--seg:${TIER_COLOR[city.tier]}">
      <span class="tier-badge" style="background:${TIER_COLOR[city.tier]}">${esc(city.tier)}</span>
      <h3>${esc(city.ciudad)}</h3>
      <p>${fmtPct(city.cepeda)} de voto Cepeda · ${city.n_comunas} comunas</p>
      <p class="muted">${esc(data.tiers.find((t) => t.key === city.tier)?.desc || "")}</p></div>`;
    const list = comunasByCity.get(state.city) || [];
    const byCl = {};
    list.forEach((c) => { (byCl[c.cluster] = byCl[c.cluster] || []).push(c); });
    const total = list.reduce((a, c) => a + (c.votos || 0), 0);
    els.summary.innerHTML = `
      <div class="metric"><span>Comunas</span><strong>${list.length}</strong><span>en ${esc(city.ciudad)}</span></div>
      <div class="metric"><span>Voto Cepeda ciudad</span><strong>${fmtPct(city.cepeda)}</strong><span>${fmtNum(total)} votos</span></div>`;
    els.comunaLists.innerHTML = [1, 2, 3, 4].map((cl) => {
      const rows = (byCl[cl] || []).slice().sort((a, b) => b.score - a.score);
      if (!rows.length) return "";
      const nm = rows[0].categoria;
      return `<article class="seg-list" style="--seg:${CL_COLOR[cl]}">
        <header><span class="seg-dot" style="background:${CL_COLOR[cl]}"></span><div><h3>${esc(nm)}</h3><p>${rows.length} comunas · ${esc(data.lineas[rows[0].linea]?.corto || "")}</p></div></header>
        <ol class="seg-items">${rows.map((c) => `<li class="seg-item">
          <span class="seg-rank">${esc(c.comuna).slice(0, 22)}</span>
          <span class="seg-score"><b>${c.score}</b><small>${fmtPct(c.cepeda)} · ${fmtPts(c.caida)}</small></span></li>`).join("")}</ol>
      </article>`;
    }).join("");
    document.querySelectorAll(".city-chip").forEach((b) => b.classList.toggle("active", b.dataset.slug === state.city));
  }

  function selectCity(slug) {
    state.city = slug;
    els.citySelect.value = slug;
    drawMap(); renderCity();
  }

  function renderLineCards() {
    els.lineCards.innerHTML = ["L1", "L2", "L3"].map((k) => {
      const l = data.lineas[k];
      return `<article class="line-card" style="border-top:5px solid ${l.color}">
        <h3>${esc(l.titulo)}</h3><p><b>${esc(l.corto)}</b></p><p>${esc(l.objetivo)}</p>
        <ul class="mini">${l.mensajes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></article>`;
    }).join("");
  }

  function renderMethodology() {
    const m = data.metodologia;
    els.methodology.innerHTML = `<div class="metodo-text">
      <p><b>${esc(m.algoritmo)}</b> · ${m.n_ciudades} ciudades · ${m.n_comunas} comunas · ${m.n_clusters} grupos por ciudad.</p>
      <p><b>Variables:</b></p><ul>${m.variables.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>
      <p class="doc-note" style="background:#fbf6e6;border:1px solid #ead79a;border-radius:10px;padding:10px;">${esc(m.relativo)}</p>
      <p class="muted">${esc(m.fuente)}</p></div>`;
  }

  els.citySelect.addEventListener("change", () => selectCity(els.citySelect.value));
  els.colorSelect.addEventListener("change", () => { state.colorMode = els.colorSelect.value; drawMap(); });
  els.fitBtn.addEventListener("click", () => { if (bounds) map.fitBounds(bounds.pad(.15)); });

  renderTiers(); fillCitySelect(); initMap(); renderLineCards(); renderMethodology(); selectCity(state.city);
})();
