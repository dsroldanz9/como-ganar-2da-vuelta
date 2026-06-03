(function () {
  const data = window.BOGOTA_CAMPANA;
  const geo = window.BOGOTA_GEO;

  const lineInfo = {
    L1: {
      title: "Tu voto también es por ti",
      short: "Persuadir centro",
      color: "#2474a6",
      soft: "#edf7fc",
      audience: "centro, clase media establecida y voto que teme el ruido político",
      frame: "Tranquilidad, futuro, cuidado, respeto y responsabilidad democrática.",
      content: "Video sobrio, carrusel de confianza, vocerías ciudadanas y piezas de futuro sin ruido."
    },
    L2: {
      title: "No estamos dispuestos a renunciar a...",
      short: "Fortalecer derechos",
      color: "#544595",
      soft: "#f2eef9",
      audience: "sectores populares y clases medias que votaron por la izquierda",
      frame: "Salario vital, educación, vida, tierra, derechos y Estado presente.",
      content: "Voz en off con barrios, aulas, naturaleza, campo, trabajo y llamado a mover familia y vecinos."
    },
    L3: {
      title: "No podemos ser gobernados por el testaferro de testaferros",
      short: "Contraste ético",
      color: "#f3930d",
      soft: "#fff4e2",
      audience: "clases medias aspiracionales, derecha blanda y territorios donde creció la derecha",
      frame: "Contraste ético, denuncia, riesgos de corrupción y cierre con voto por la democracia.",
      content: "Video de archivo, titulares, contraste de trayectorias, piezas cortas para redes y pauta geográfica."
    }
  };

  const state = {
    locKey: "",
    line: "",
    layer: "localidades",
    query: "",
    active: null
  };

  const locByKey = new Map(data.localidades.map((d) => [d.key, d]));
  const upzById = new Map(data.upz.map((d) => [`${d.key}|${d.upz_key}`, d]));
  const puestoByCode = new Map(data.puestos.map((d) => [String(d.cod_puesto), d]));

  const els = {
    loc: document.getElementById("locSelect"),
    line: document.getElementById("lineSelect"),
    layer: document.getElementById("layerSelect"),
    search: document.getElementById("searchInput"),
    reset: document.getElementById("resetBtn"),
    lineCards: document.getElementById("lineCards"),
    summary: document.getElementById("summaryCards"),
    reading: document.getElementById("reading"),
    profile: document.getElementById("profileBars"),
    profileSubtitle: document.getElementById("profileSubtitle"),
    priority: document.getElementById("priorityLists"),
    matrix: document.getElementById("matrixBody"),
    download: document.getElementById("downloadBtn"),
    mapSubtitle: document.getElementById("mapSubtitle")
  };

  const fmtPct = (v) => Number.isFinite(v) ? `${v.toFixed(1).replace(".", ",")}%` : "s/d";
  const fmtPts = (v) => Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} pts` : "s/d";
  const fmtNum = (v) => Number.isFinite(v) ? Math.round(v).toLocaleString("es-CO") : "s/d";
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function weighted(rows, field) {
    const den = rows.reduce((a, r) => a + (Number(r.validos) || 0), 0);
    if (!den) return null;
    return rows.reduce((a, r) => a + (Number(r[field]) || 0) * (Number(r.validos) || 0), 0) / den;
  }

  function totalContext() {
    const rows = data.localidades;
    const votos = rows.reduce((a, r) => a + (Number(r.votos) || 0), 0);
    const validos = rows.reduce((a, r) => a + (Number(r.validos) || 0), 0);
    return {
      key: "",
      localidad: "Bogotá",
      cepeda: validos ? votos / validos * 100 : 0,
      derecha: weighted(rows, "derecha"),
      swing: weighted(rows, "swing"),
      votos,
      validos,
      joven: weighted(rows, "joven"),
      mayor: weighted(rows, "mayor"),
      mujeres: weighted(rows, "mujeres"),
      linea: "L1",
      mensaje: "Tres líneas según territorio",
      publico: "toda Bogotá, segmentada por localidad, UPZ, estrato y puesto",
      accion: "Priorizar recuperación donde cayó el voto, movilizar fortines populares y persuadir centro con mensajes diferenciados."
    };
  }

  function contextRow() {
    if (state.active?.type === "puesto") return state.active.row;
    if (state.active?.type === "upz") return state.active.row;
    if (state.locKey) return locByKey.get(state.locKey) || totalContext();
    return totalContext();
  }

  function areaForProfile() {
    return state.locKey ? locByKey.get(state.locKey) : totalContext();
  }

  function wantedLine(row) {
    return lineInfo[row?.linea] || lineInfo.L1;
  }

  function neededVotes(row) {
    const validos = Number(row.validos) || 0;
    const votos = Number(row.votos) || 0;
    const target = Math.floor(validos * 0.5) + 1;
    return target - votos;
  }

  function rowMatches(row) {
    if (state.locKey && row.key !== state.locKey) return false;
    if (state.line && row.linea !== state.line) return false;
    if (!state.query) return true;
    const hay = norm([row.localidad, row.upz, row.puesto, row.sitio, row.direccion, row.categoria].join(" "));
    return hay.includes(norm(state.query));
  }

  function fillSelects() {
    els.loc.innerHTML = `<option value="">Todas las localidades</option>` +
      data.localidades
        .slice()
        .sort((a, b) => a.localidad.localeCompare(b.localidad, "es"))
        .map((d) => `<option value="${esc(d.key)}">${esc(d.localidad)}</option>`)
        .join("");
  }

  function renderLineCards() {
    const counts = data.localidades.reduce((acc, d) => {
      acc[d.linea] = (acc[d.linea] || 0) + 1;
      return acc;
    }, {});
    els.lineCards.innerHTML = Object.entries(lineInfo).map(([id, line]) => `
      <article class="line-card ${state.line === id ? "active" : ""}" data-line="${id}">
        <h3>${esc(line.title)}</h3>
        <p><b>${esc(line.short)}</b> · ${esc(line.audience)}.</p>
        <p>${esc(line.frame)}</p>
        <b>${counts[id] || 0} localidades con esta línea</b>
      </article>
    `).join("");
    els.lineCards.querySelectorAll(".line-card").forEach((card) => {
      card.addEventListener("click", () => {
        state.line = state.line === card.dataset.line ? "" : card.dataset.line;
        els.line.value = state.line;
        state.active = null;
        renderAll(true);
      });
    });
  }

  let map;
  let mapLayer;
  let baseBounds;

  function initMap() {
    map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([4.65, -74.09], 10);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM, &copy; CARTO",
      maxZoom: 19
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
  }

  function rowColor(row) {
    if (!row) return "#8d97a8";
    if (row.swing <= -7) return "#c7312b";
    if (row.linea === "L3") return lineInfo.L3.color;
    if (row.linea === "L2") return lineInfo.L2.color;
    return lineInfo.L1.color;
  }

  function rowStroke(row) {
    if (state.active?.row === row) return "#25233a";
    if (row?.swing <= -6) return "#c7312b";
    return "#ffffff";
  }

  function tooltip(row, title) {
    const line = wantedLine(row);
    return `
      <div class="map-tip">
        <strong>${esc(title)}</strong>
        <span>${fmtPct(row?.cepeda)} Cepeda · ${fmtPts(row?.swing)} vs 2022</span>
        <span>${fmtNum(row?.votos)} votos · ${esc(line.short)}</span>
      </div>
    `;
  }

  function drawMap(fit) {
    mapLayer.clearLayers();
    const bounds = [];
    const layer = state.layer;
    els.mapSubtitle.textContent = layer === "puestos"
      ? "Cada punto es un puesto; color por línea y tamaño por votos válidos."
      : layer === "upz"
        ? "Cada polígono es una UPZ; rojo indica caídas fuertes, morado fortines y naranja contraste."
        : "Cada polígono es una localidad; rojo indica caídas fuertes, morado fortines y naranja contraste.";

    if (layer === "localidades") {
      L.geoJSON(geo.localidades, {
        filter: (f) => {
          const row = locByKey.get(f.properties.key);
          return row && rowMatches(row);
        },
        style: (f) => {
          const row = locByKey.get(f.properties.key);
          return {
            color: rowStroke(row),
            weight: state.locKey === row?.key ? 3 : 1.2,
            fillColor: rowColor(row),
            fillOpacity: state.locKey && state.locKey !== row?.key ? .25 : .72
          };
        },
        onEachFeature: (f, lyr) => {
          const row = locByKey.get(f.properties.key);
          lyr.bindTooltip(tooltip(row, row?.localidad || f.properties.localidad), { sticky: true });
          lyr.on("click", () => {
            state.locKey = row.key;
            state.active = { type: "localidad", row };
            els.loc.value = row.key;
            if (state.layer === "localidades") state.layer = "upz";
            els.layer.value = state.layer;
            renderAll(true);
          });
          bounds.push(lyr.getBounds());
        }
      }).addTo(mapLayer);
    }

    if (layer === "upz") {
      L.geoJSON(geo.upz, {
        filter: (f) => {
          const row = upzById.get(`${f.properties.key}|${f.properties.upz_key}`);
          return row && rowMatches(row);
        },
        style: (f) => {
          const row = upzById.get(`${f.properties.key}|${f.properties.upz_key}`);
          return {
            color: rowStroke(row),
            weight: state.active?.type === "upz" && state.active.row === row ? 3 : 1,
            fillColor: rowColor(row),
            fillOpacity: .72
          };
        },
        onEachFeature: (f, lyr) => {
          const row = upzById.get(`${f.properties.key}|${f.properties.upz_key}`);
          lyr.bindTooltip(tooltip(row, `${row?.upz || f.properties.upz} · ${row?.localidad || ""}`), { sticky: true });
          lyr.on("click", () => {
            state.locKey = row.key;
            state.active = { type: "upz", row };
            els.loc.value = row.key;
            renderAll(false);
          });
          bounds.push(lyr.getBounds());
        }
      }).addTo(mapLayer);
    }

    if (layer === "puestos") {
      L.geoJSON(geo.puestos, {
        filter: (f) => {
          const row = puestoByCode.get(String(f.properties.cod_puesto));
          return row && rowMatches(row);
        },
        pointToLayer: (f, latlng) => {
          const row = puestoByCode.get(String(f.properties.cod_puesto));
          const radius = clamp(Math.sqrt(Number(row.validos) || 0) / 8, 4, 20);
          return L.circleMarker(latlng, {
            radius,
            color: "#fff",
            weight: 1,
            fillColor: rowColor(row),
            fillOpacity: .82
          });
        },
        onEachFeature: (f, lyr) => {
          const row = puestoByCode.get(String(f.properties.cod_puesto));
          lyr.bindTooltip(tooltip(row, row?.puesto || f.properties.puesto), { sticky: true });
          lyr.on("click", () => {
            state.locKey = row.key;
            state.active = { type: "puesto", row };
            els.loc.value = row.key;
            renderAll(false);
          });
          bounds.push(lyr.getLatLng ? L.latLngBounds([lyr.getLatLng()]) : lyr.getBounds());
        }
      }).addTo(mapLayer);
    }

    if (!baseBounds && bounds.length) {
      baseBounds = bounds.reduce((acc, b) => acc ? acc.extend(b) : L.latLngBounds(b), null);
    }
    if (fit && bounds.length) {
      const all = bounds.reduce((acc, b) => acc ? acc.extend(b) : L.latLngBounds(b), null);
      map.fitBounds(all.pad(.08), { animate: false });
    } else if (fit && baseBounds) {
      map.fitBounds(baseBounds.pad(.08), { animate: false });
    }
  }

  function renderSummary() {
    const row = contextRow();
    const need = neededVotes(row);
    const line = wantedLine(row);
    const needText = need > 0 ? `${fmtNum(need)} votos` : `${fmtNum(Math.abs(need))} de margen`;
    const swingClass = row.swing < -6 ? "bad" : row.swing < -3 ? "warn" : "good";
    els.summary.innerHTML = `
      <div class="metric ${row.cepeda >= 50 ? "good" : "warn"}"><span>Voto Cepeda</span><strong>${fmtPct(row.cepeda)}</strong><span>${fmtNum(row.votos)} votos</span></div>
      <div class="metric ${swingClass}"><span>Cambio vs 2022</span><strong>${fmtPts(row.swing)}</strong><span>${row.swing < -6 ? "caída fuerte" : row.swing < -3 ? "caída moderada" : "estable o mejor"}</span></div>
      <div class="metric"><span>Meta 50% + 1</span><strong>${needText}</strong><span>${need > 0 ? "por ganar en el filtro" : "sobre la meta"}</span></div>
      <div class="metric"><span>Línea recomendada</span><strong>${esc(line.short)}</strong><span>${esc(line.title)}</span></div>
    `;
  }

  function renderReading() {
    const row = contextRow();
    const profile = areaForProfile();
    const line = wantedLine(row);
    const scope = state.active?.type === "puesto" ? `puesto ${row.puesto}` : state.active?.type === "upz" ? `UPZ ${row.upz}` : row.localidad;
    const need = neededVotes(row);
    const ageText = Number.isFinite(profile.joven)
      ? `${fmtPct(profile.joven)} de población 18-28 y ${fmtPct(profile.mayor)} de 65+`
      : "sin cruce etario completo en este corte";
    const strategic = row.cepeda >= 52
      ? "El trabajo principal es convertir simpatía en voto efectivo: recordación, transporte electoral, testigos y conversación de barrio."
      : row.swing <= -6
        ? "La alerta está en recuperar caída: combinar contraste político con una razón concreta para volver a votar."
        : "El territorio está competido: conviene mezclar persuasión emocional, garantías de estabilidad y movilización fina por puesto.";
    els.reading.innerHTML = `
      <h3>${esc(scope)}</h3>
      <p><strong>Lectura territorial.</strong> Cepeda está en ${fmtPct(row.cepeda)}, con ${fmtNum(row.votos)} votos y ${fmtPts(row.swing)} frente a 2022. ${strategic}</p>
      <p><strong>Lectura etaria y social.</strong> El perfil del área marca ${ageText}. En estratos bajos pesa la defensa de derechos y salario; en estratos medios-altos pesa más confianza, ética pública y contraste democrático.</p>
      <p><strong>Mensaje.</strong> ${esc(line.title)}. ${esc(line.frame)}</p>
      <p><strong>Contenido sugerido.</strong> ${esc(line.content)}</p>
      <p><strong>Meta inmediata.</strong> ${need > 0 ? `Ganar al menos ${fmtNum(need)} votos netos para llegar a 50% + 1 en este filtro.` : `Cuidar el margen de ${fmtNum(Math.abs(need))} votos sobre 50% + 1 y usarlo como base de movilización.`}</p>
      <div class="chip-row">
        <span class="chip">${esc(line.short)}</span>
        <span class="chip">${row.cepeda >= 50 ? "fortalecer" : "recuperar"}</span>
        <span class="chip">${row.swing <= -6 ? "caída roja" : "seguimiento"}</span>
      </div>
    `;
  }

  function aggregateEstratos(rows) {
    const groups = new Map();
    rows.forEach((r) => {
      const key = String(r.estrato ?? "s/d");
      if (!groups.has(key)) groups.set(key, { estrato: key, votos: 0, validos: 0, swing: 0, weight: 0, puestos: 0 });
      const g = groups.get(key);
      g.votos += Number(r.votos) || 0;
      g.validos += Number(r.validos) || 0;
      g.swing += (Number(r.swing) || 0) * (Number(r.validos) || 0);
      g.weight += Number(r.validos) || 0;
      g.puestos += Number(r.puestos) || 0;
    });
    return Array.from(groups.values())
      .map((g) => ({ ...g, cepeda: g.validos ? g.votos / g.validos * 100 : null, swing: g.weight ? g.swing / g.weight : null }))
      .sort((a, b) => Number(a.estrato) - Number(b.estrato));
  }

  function renderProfile() {
    const profile = areaForProfile();
    const estratos = aggregateEstratos(data.estratos.filter((r) => !state.locKey || r.key === state.locKey));
    const ageRows = [
      { label: "18 a 28", value: profile.joven, cls: "l2" },
      { label: "65 o más", value: profile.mayor, cls: "l3" },
      { label: "Mujeres", value: profile.mujeres, cls: "l1" }
    ].filter((d) => Number.isFinite(d.value));
    els.profileSubtitle.textContent = state.locKey ? `Perfil de ${profile.localidad}.` : "Perfil ponderado de Bogotá.";
    const estratoHtml = estratos.length ? `
      <div class="bar-group">
        <h3>Voto por estrato</h3>
        ${estratos.map((r) => `
          <div class="bar-row">
            <span>Estrato ${esc(r.estrato)}</span>
            <div class="bar-track"><div class="bar-fill ${r.swing <= -7 ? "bad" : "l2"}" style="width:${clamp(r.cepeda, 3, 100)}%"></div></div>
            <b>${fmtPct(r.cepeda)}</b>
          </div>
        `).join("")}
      </div>` : `<p class="profile-note">No hay datos de estrato para este filtro.</p>`;
    const ageHtml = ageRows.length ? `
      <div class="bar-group">
        <h3>Perfil etario y género</h3>
        ${ageRows.map((r) => `
          <div class="bar-row">
            <span>${esc(r.label)}</span>
            <div class="bar-track"><div class="bar-fill ${r.cls}" style="width:${clamp(r.value, 3, 100)}%"></div></div>
            <b>${fmtPct(r.value)}</b>
          </div>
        `).join("")}
      </div>` : `<p class="profile-note">El cruce etario no está completo para este filtro.</p>`;
    const note = `<p class="profile-note">La matriz cruza resultados electorales con estrato por puesto y perfil etario por localidad. No perfila personas: usa agregados territoriales para orientar contenido, pauta y trabajo de campo.</p>`;
    els.profile.innerHTML = estratoHtml + ageHtml + note;
  }

  function renderPriority() {
    const upzRows = data.upz.filter(rowMatches);
    const puestosRows = data.puestos.filter(rowMatches);
    const recover = upzRows.slice().sort((a, b) => a.swing - b.swing || b.validos - a.validos).slice(0, 6);
    const mobilize = upzRows.slice().sort((a, b) => b.votos - a.votos || b.cepeda - a.cepeda).slice(0, 6);
    const decisive = puestosRows.slice()
      .sort((a, b) => {
        const ap = Math.abs(50 - a.cepeda) + Math.max(0, a.swing + 8);
        const bp = Math.abs(50 - b.cepeda) + Math.max(0, b.swing + 8);
        return ap - bp || b.validos - a.validos;
      })
      .slice(0, 6);
    const lineRows = puestosRows.slice().sort((a, b) => a.swing - b.swing || b.validos - a.validos).slice(0, 6);
    els.priority.innerHTML = [
      miniList("Recuperar UPZ", recover, (r) => `${fmtPts(r.swing)} · ${fmtNum(r.votos)} votos`, "upz"),
      miniList("Movilizar UPZ", mobilize, (r) => `${fmtPct(r.cepeda)} · ${fmtNum(r.votos)} votos`, "upz"),
      miniList("Puestos decisivos", decisive, (r) => `${fmtPct(r.cepeda)} · ${fmtNum(r.validos)} válidos`, "puesto"),
      miniList("Caídas por puesto", lineRows, (r) => `${fmtPts(r.swing)} · estrato ${r.estrato ?? "s/d"}`, "puesto")
    ].join("");
  }

  function miniList(title, rows, valueFn, type) {
    if (!rows.length) return `<div class="mini-list"><h3>${esc(title)}</h3><p class="muted">Sin registros para el filtro.</p></div>`;
    return `
      <div class="mini-list">
        <h3>${esc(title)}</h3>
        ${rows.map((r) => `
          <div class="mini-item" role="button" tabindex="0" data-type="${type}" data-key="${esc(type === "upz" ? `${r.key}|${r.upz_key}` : r.cod_puesto)}">
            <span>${esc(type === "upz" ? r.upz : r.puesto)}</span>
            <b>${esc(valueFn(r))}</b>
          </div>
        `).join("")}
      </div>
    `;
  }

  function rowAction(row) {
    if (row.cepeda >= 52) return "Fortalecer, cuidar testigos y volver apoyo en participación.";
    if (row.swing <= -7) return "Recuperar voto caído con mensaje directo y pauta territorial.";
    if (row.cepeda < 40) return "Persuadir sin saturar: contraste, confianza y vocerías cercanas.";
    return "Territorio competido: combinar calle, redes y llamados a votar.";
  }

  function matrixRows() {
    const upzRows = data.upz.filter(rowMatches).map((r) => ({ ...r, type: "UPZ", perfil: `${r.puestos} puestos`, name: r.upz }));
    const puestoRows = data.puestos.filter(rowMatches).map((r) => ({ ...r, type: "Puesto", perfil: `Estrato ${r.estrato ?? "s/d"} · ${r.sitio || r.direccion || ""}`, name: r.puesto }));
    return upzRows.concat(puestoRows)
      .sort((a, b) => a.linea.localeCompare(b.linea) || a.swing - b.swing || b.validos - a.validos)
      .slice(0, 80);
  }

  function renderMatrix() {
    const rows = matrixRows();
    if (!rows.length) {
      els.matrix.innerHTML = `<tr><td colspan="5">Sin resultados para el filtro activo.</td></tr>`;
      return;
    }
    els.matrix.innerHTML = rows.map((r) => {
      const line = wantedLine(r);
      const swingClass = r.swing < 0 ? "negative" : "positive";
      return `
        <tr>
          <td><strong>${esc(r.name)}</strong><br><span class="muted">${esc(r.type)} · ${esc(r.localidad)}</span></td>
          <td>${fmtPct(r.cepeda)} Cepeda<br><span class="${swingClass}">${fmtPts(r.swing)}</span><br><span class="muted">${fmtNum(r.votos)} votos</span></td>
          <td>${esc(r.perfil || "s/d")}<br><span class="muted">${fmtNum(r.validos)} votos válidos</span></td>
          <td><strong>${esc(line.title)}</strong><br><span class="tag ${r.linea}">${esc(line.short)}</span></td>
          <td>${esc(rowAction(r))}<br><span class="muted">${esc(line.content)}</span></td>
        </tr>
      `;
    }).join("");
  }

  function bindPriorityClicks() {
    document.querySelectorAll(".mini-item").forEach((el) => {
      el.addEventListener("click", () => {
        if (el.dataset.type === "upz") {
          const row = upzById.get(el.dataset.key);
          if (row) {
            state.locKey = row.key;
            state.active = { type: "upz", row };
            state.layer = "upz";
          }
        } else {
          const row = puestoByCode.get(el.dataset.key);
          if (row) {
            state.locKey = row.key;
            state.active = { type: "puesto", row };
            state.layer = "puestos";
          }
        }
        els.loc.value = state.locKey;
        els.layer.value = state.layer;
        renderAll(true);
      });
    });
  }

  function downloadCsv() {
    const rows = matrixRows();
    const headers = ["tipo", "territorio", "localidad", "cepeda_pct", "swing_pts", "votos", "validos", "linea", "mensaje", "accion"];
    const lines = [headers.join(",")].concat(rows.map((r) => {
      const line = wantedLine(r);
      const vals = [r.type, r.name, r.localidad, r.cepeda, r.swing, r.votos, r.validos, r.linea, line.title, rowAction(r)];
      return vals.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    }));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bogota_matriz_campana_${state.locKey || "todas"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadExcel(event) {
    if (event) event.preventDefault();
    const b64 = window.PROTECTED_FILES?.BOGOTA_EXCEL_B64 || window.BOGOTA_EXCEL_B64;
    if (!b64) return;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bogota_matriz_upz_mensajes.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderAll(fitMap) {
    renderLineCards();
    drawMap(fitMap);
    renderSummary();
    renderReading();
    renderProfile();
    renderPriority();
    renderMatrix();
    bindPriorityClicks();
  }

  function bindEvents() {
    els.loc.addEventListener("change", () => {
      state.locKey = els.loc.value;
      state.active = state.locKey ? { type: "localidad", row: locByKey.get(state.locKey) } : null;
      if (state.locKey && state.layer === "localidades") {
        state.layer = "upz";
        els.layer.value = state.layer;
      }
      renderAll(true);
    });
    els.line.addEventListener("change", () => {
      state.line = els.line.value;
      state.active = null;
      renderAll(true);
    });
    els.layer.addEventListener("change", () => {
      state.layer = els.layer.value;
      state.active = state.locKey ? { type: "localidad", row: locByKey.get(state.locKey) } : null;
      renderAll(true);
    });
    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim();
      state.active = null;
      renderAll(true);
    });
    els.reset.addEventListener("click", () => {
      state.locKey = "";
      state.line = "";
      state.layer = "localidades";
      state.query = "";
      state.active = null;
      els.loc.value = "";
      els.line.value = "";
      els.layer.value = "localidades";
      els.search.value = "";
      renderAll(true);
    });
    els.download.addEventListener("click", downloadCsv);
    document.querySelectorAll("[data-excel-download]").forEach((link) => {
      link.addEventListener("click", downloadExcel);
    });
  }

  fillSelects();
  initMap();
  bindEvents();
  renderAll(true);
})();
