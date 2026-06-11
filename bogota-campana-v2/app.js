(function () {
  const data = window.BOGOTA_CAMPANA;
  const geo = window.BOGOTA_GEO;
  const v2 = window.BOGOTA_V2 || { clusters: [], upz: [], pesos: {}, metodologia: {}, sin_match: [] };

  // --- Segmentación por clúster (v2) ---
  const CLUSTER_COLOR = { 1: "#7b2ff7", 2: "#c8d400", 3: "#2746e6", 4: "#8a94a6", 0: "#cbd2dc" };
  const clusterById = new Map((v2.clusters || []).map((c) => [c.id, c]));
  const pesos = JSON.parse(JSON.stringify(v2.pesos || {
    c1: { part: 1, fall: 1, censo: 1 },
    c2: { fall: 1, comp: 1, censo: 1, centro: 1 },
    c3: { fall: 1, comp: 1, censo: 1, centro: 1 }
  }));
  const normKey = (s) => String(s || "").normalize("NFD").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const v2ByName = new Map((v2.upz || []).map((u) => [normKey(u.upz_key), u]));
  // Mapeo línea ↔ segmento: L1 fortalece la base afín, L2 persuade alta competencia, L3 contrasta donde avanza la derecha
  const LINE_BY_CLUSTER = { 1: "L1", 2: "L2", 3: "L3" };
  (data.upz || []).forEach((r) => {
    const m = v2ByName.get(normKey(r.upz_key));
    if (m) {
      r.cluster = m.cluster; r.segmento = m.segmento; r._v2 = m;
      if (LINE_BY_CLUSTER[m.cluster]) r.linea = LINE_BY_CLUSTER[m.cluster];
    } else { r.cluster = 0; r.segmento = "Sin clasificar"; r._v2 = null; }
  });
  // Los puestos del bundle traen 'linea' con la numeración heredada (la base afín figuraba
  // como L2). Se reasigna cada puesto a la línea de su UPZ real (cluster autoritativo)
  // por punto-en-polígono, igual que la capa de UPZ del mapa.
  {
    const upzLineaByKey = new Map((data.upz || [])
      .filter((r) => r._v2 && LINE_BY_CLUSTER[r.cluster])
      .map((r) => [normKey(r.upz_key), r.linea]));
    const byCode = new Map((data.puestos || []).map((d) => [String(d.cod_puesto), d]));
    const polys = (geo.upz?.features || []).map((f) => {
      const g = f.geometry || {};
      const rings = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      rings.forEach((poly) => (poly[0] || []).forEach(([x, y]) => {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }));
      return { k: normKey(f.properties.upz_key), rings, x0, y0, x1, y1 };
    }).filter((p) => upzLineaByKey.has(p.k));
    const inRing = (x, y, ring) => {
      let ins = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    };
    const inPoly = (x, y, p) => p.rings.some((poly) =>
      inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h)));
    (geo.puestos?.features || []).forEach((f) => {
      const c = f.geometry?.coordinates; if (!c) return;
      const row = byCode.get(String(f.properties.cod_puesto)); if (!row) return;
      for (const p of polys) {
        if (c[0] < p.x0 || c[0] > p.x1 || c[1] < p.y0 || c[1] > p.y1) continue;
        if (inPoly(c[0], c[1], p)) { row.linea = upzLineaByKey.get(p.k); break; }
      }
    });
  }
  function clusterScore(r) {
    // Índice de prioridad 0-100 precalculado: z-score (estandarización) intra-segmento,
    // promedio simple de las variables orientadas (pesos iguales). Coherente con el k-means.
    const m = r && r._v2;
    return (m && m.score != null) ? m.score : null;
  }
  const dec = (v) => (v == null || Number.isNaN(Number(v))) ? "s/d" : String(v).replace(".", ",");

  const lineInfo = {
    L1: {
      title: "Tu voto es por mí",
      short: "Persuadir desde el afecto",
      color: "#2474a6",
      soft: "#edf7fc",
      objective: "Mover voto de centro y abstención blanda apelando a vínculos concretos: hija, hijo, mamá, papá, pareja, amistad, colega o familiar que sería afectado por el retroceso democrático.",
      audience: "clase media establecida, sectores altos liberales, técnicos, burócratas, profesionales y votantes de Fajardo, Claudia u Oviedo en zonas de disputa.",
      frame: "El voto no se pide por un partido: se pide por alguien querido. Votar por Cepeda puede ser un voto por la vida, los derechos, la pensión, los páramos y la gente trabajadora que uno ama.",
      messages: [
        "Tu voto es por mí: por mi vida, mis derechos y mi futuro.",
        "Tu voto es por los viejitos, para que no se queden sin pensión ni bono pensional.",
        "Tu voto es por nosotras las mujeres y por una vida libre de violencias.",
        "Tu voto es por quienes defienden derechos humanos y por quienes tienen menos.",
        "Tu voto es por los páramos, por la vida y por las personas trabajadoras."
      ],
      scripts: [
        "Una joven de clase media le habla a su papá que vota derecha o no vota: 'papá, esta vez tu voto es por mí'.",
        "Una madre le habla a un hijo apático: 'si no votas por ti, vota por mí, por mi pensión, por mi salud, por mi tranquilidad'.",
        "Carrusel con fotos familiares: 'No todos votamos igual, pero sí nos cuidamos'."
      ],
      classVariants: {
        popular: "Hablar de cuidado concreto: pensión, trabajo, salud, servicios y que la familia no retroceda.",
        media: "Apelar a estabilidad, derechos liberales, futuro profesional, cuidado de mujeres, minorías y familia.",
        alta: "Usar tono sobrio: democracia, páramos, derechos humanos, reputación internacional y responsabilidad histórica.",
        unknown: "Bajar al puesto/sitio para identificar estrato y elegir vocería familiar o técnica."
      },
      ageVariants: {
        joven: "A jóvenes: 'tu voto protege mi futuro, mi universidad, mi libertad y mi derecho a vivir sin miedo'.",
        media: "A edades medias: 'tu voto cuida a tus hijos, tu trabajo, tu barrio y la estabilidad de quienes quieres'.",
        mayor: "A mayores: 'tu voto protege pensión, salud, tranquilidad familiar y una democracia sin violencia'."
      },
      formats: {
        joven: "Reels testimoniales de 20-30s, memes suaves de familia, duetos/TikTok, stickers de WhatsApp, historias con pregunta: ¿por quién votas cuando votas?",
        media: "Video testimonial familiar, carrusel para Facebook/Instagram, WhatsApp de grupos familiares, carta corta de hija/hijo a papá-mamá, reunión de edificio o conjunto.",
        mayor: "Audio de WhatsApp, volante simple, pieza para Facebook, conversación puerta a puerta, llamada familiar y encuentro pequeño de vecinos."
      },
      events: {
        popular: "Olla comunitaria, puerta a puerta con liderazgos barriales, punto pedagógico en mercado/parque y jornada de llamadas familiares.",
        media: "Café de vecinos, reunión de conjunto, foro breve con técnicos/profesionales, activación en universidades y coworkings.",
        alta: "Conversatorio de derechos y democracia, encuentro de profesionales, carta pública de figuras respetadas y pauta sobria geolocalizada.",
        unknown: "Mapear primero el puesto: identificar edificios, comercio, universidades, colegios o barrio antes de escoger evento."
      },
      content: "Videos testimoniales íntimos, carruseles con frases familiares, fotos cotidianas, piezas sobrias para WhatsApp familiar y pauta de confianza en UPZ competidas."
    },
    L2: {
      title: "No estamos dispuestos a renunciar a...",
      short: "Movilizar multiplicadores",
      color: "#544595",
      soft: "#f2eef9",
      objective: "Convertir simpatizantes en multiplicadores activos: que no solo voten, sino que inviten, expliquen programa, muevan familia, tomen tinto con un amigo, acompañen al puesto y ayuden a subir participación.",
      audience: "sectores populares, clases medias progresistas, jóvenes, militancia territorial, familias del sur y territorios afines donde toca subir participación.",
      frame: "No regresar al pasado exige organización: defender salario vital, universidad pública, vivienda digna, tierra, derechos, vida y futuro saliendo a buscar más votos.",
      messages: [
        "No estamos dispuestos a renunciar a un salario digno.",
        "No estamos dispuestos a renunciar a la universidad pública gratuita.",
        "No estamos dispuestas a renunciar al cuidado para nosotras y a los derechos de las mujeres.",
        "No estamos dispuestos a renunciar a la vivienda digna, a la tierra y a un Estado presente.",
        "No estamos dispuestos a volver al miedo, a la represión, al militarismo ni a mandar nuestros hijos a la guerra.",
        "No estamos dispuestas a renunciar al futuro.",
        "Si ya estás convencido, convence a tres más: familia, vecino, amiga, compañero de trabajo.",
        "Tómate un tinto con alguien que duda y explícale por qué esta vez hay que salir a votar."
      ],
      scripts: [
        "Voz en off sobre barrios, aulas, trabajo y campo: 'no estamos dispuestos a renunciar a... por eso hoy salimos a convencer y a votar'.",
        "Jóvenes llamando a sumar a papá, mamá, primos, pareja, amigos y vecinos: 'no basta con estar de acuerdo, toca llevar a alguien más'.",
        "Pieza de tinto: dos personas conversan con calma; una explica salario, universidad, pensión y derechos, y cierran acordando votar juntas.",
        "Pieza de familia completa: 'este domingo no va nadie solo: votamos, llamamos, acompañamos y cuidamos el puesto'."
      ],
      classVariants: {
        popular: "Pasar de apoyo a acción: armar lista de familia/vecinos, explicar programa en el barrio, acompañar al puesto y cuidar participación.",
        media: "Activar redes de confianza: tinto con amigo, grupos de WhatsApp, colegas, universidad, trabajo y familia que aún duda.",
        alta: "Pedir apoyo logístico y vocerías: donar tiempo, circular argumentos, abrir puertas, prestar carros y mover redes profesionales.",
        unknown: "Bajar al puesto/sitio para reconocer qué red moviliza mejor: familia, comercio, universidad, conjunto o comité barrial."
      },
      ageVariants: {
        joven: "A jóvenes: no basta indignarse en redes; hagan reels, inviten parche, llamen familia y lleven a alguien a votar.",
        media: "A edades medias: organicen familia, trabajo y vecinos; tinto con quien duda, llamada a quien se abstiene y salida colectiva a votar.",
        mayor: "A mayores: voz a voz de confianza, llamada a hijos/nietos, audio de WhatsApp y acompañamiento al puesto."
      },
      formats: {
        joven: "Reels reto 'yo llevo a tres', historias con plantilla de compromiso, memes de no volver atrás, TikTok de tinto con amigo y WhatsApp militante.",
        media: "Checklist familiar de votación, carrusel programa+acción, audio para grupos de trabajo/familia, invitación a tinto y pieza 'no vayas solo'.",
        mayor: "Audio de WhatsApp, volante simple con hora/puesto, llamada familiar, Facebook comunitario y puerta a puerta de confianza."
      },
      events: {
        popular: "Comité por puesto, olla/tinto comunitario, jornada de llamadas, volanteo en transporte, recorrido por comercio y cadena barrial de WhatsApp.",
        media: "Tinto con indecisos, reunión de conjunto, encuentro de familias trabajadoras, activación en parques y llamada organizada a abstencionistas.",
        alta: "Círculo de apoyo logístico, cena/café de donantes de tiempo, red de profesionales difundiendo argumentos y transporte electoral.",
        unknown: "Recorrido diagnóstico corto: identificar líderes, comercios, conjuntos o universidades para activar la red de movilización correcta."
      },
      content: "Contenido de movilización: piezas de programa con tarea concreta, audios para WhatsApp, reto de llevar tres personas, tinto con indecisos, checklist familiar y llamados por puesto."
    },
    L3: {
      title: "Superioridad ética y contraste democrático",
      short: "Contraste ético",
      color: "#f3930d",
      soft: "#fff4e2",
      objective: "Contrastar trayectorias, valores y riesgos políticos para recuperar voto en sectores aspiracionales, populares no convencidos y zonas donde creció la derecha.",
      audience: "clases medias aspiracionales, sectores populares con rabia contra élites corruptas, derecha blanda, técnicos y territorios de caída o derecha fuerte.",
      frame: "La campaña debe oponer vida pública limpia, derechos y defensa democrática frente a un proyecto de miedo, desigualdad, represión y privilegio. Usar únicamente hechos verificables, titulares y archivo con fuente.",
      messages: [
        "Merecemos más que el miedo.",
        "El futuro es la vida, no la cárcel para todo el mundo.",
        "No podemos dejar el país en manos de una élite mafiosa y vanidosa.",
        "La revolución ética es no entregar el país a quienes han vivido de defender poderes oscuros.",
        "Iván ha dedicado su vida pública a los derechos, la paz, la denuncia de la corrupción y el control incluso al propio gobierno."
      ],
      scripts: [
        "Montaje con archivo y titulares verificados: trayectoria de Iván vs. cuestionamientos públicos del adversario.",
        "Pieza de contraste: '¿Quién representa mejor a la clase media trabajadora: quien defiende derechos o quien desprecia al diferente?'.",
        "Video corto de ética pública: 'no se trata solo de ganar, se trata de quién puede gobernar sin deberle el país a poderes oscuros'."
      ],
      classVariants: {
        popular: "Contrastar élite mafiosa vs. pueblo trabajador: miedo, desigualdad, desprecio a pobres y defensa de privilegios.",
        media: "Contrastar meritocracia limpia vs. enriquecimiento oscuro: ética pública, trabajo honesto y gobierno sin deudas mafiosas.",
        alta: "Contrastar reputación, institucionalidad y gobernabilidad: un país serio no se entrega al escándalo ni al odio.",
        unknown: "Usar contraste general, pero afinar por estrato del puesto antes de pautar."
      },
      ageVariants: {
        joven: "A jóvenes: no al miedo, no al autoritarismo, no a una política que odia al diferente.",
        media: "A edades medias: ética, seguridad democrática sin mafia, estabilidad y respeto a la clase trabajadora.",
        mayor: "A mayores: tranquilidad, decencia pública, no violencia y no entregar el país a poderes oscuros."
      },
      formats: {
        joven: "Memes de contraste, clips de archivo subtitulados, carruseles de 'miedo vs futuro', videos reacción y piezas cortas con fuente visible.",
        media: "Carrusel comparativo, video de trayectoria, hilo/placa de titulares verificados, audio de WhatsApp con tono sereno y pieza de ética pública.",
        mayor: "Volante sobrio, audio explicativo, Facebook, conversación directa y pieza de tranquilidad: no violencia, decencia y gobierno serio."
      },
      events: {
        popular: "Conversatorio barrial de 'ricos mafiosos vs pueblo trabajador', volanteo en comercio, debate abierto y perifoneo con mensaje de dignidad.",
        media: "Foro de ética pública, reunión con profesionales/técnicos, pieza para grupos de oficina y conversación en conjuntos residenciales.",
        alta: "Encuentro de institucionalidad, carta de figuras respetadas, conversatorio de reputación país y pauta sobria de riesgo democrático.",
        unknown: "Antes de contrastar duro, identificar si el puesto es popular, medio o alto para ajustar tono y vocería."
      },
      content: "Videos de contraste con fuentes, carruseles de trayectoria, memes de superioridad ética, piezas cortas de riesgo democrático y pauta en UPZ con caída o derecha fuerte.",
      historia: "Iván Cepeda encarna esta línea: bogotano, hijo del senador Manuel Cepeda asesinado en 1994, hizo del dolor una causa. Defensor de derechos humanos y voz de las víctimas, sereno y firme; enfrentó amenazas y el exilio, y volvió a defender la memoria y la dignidad de los que menos tienen. Su vida —trágica y digna— es nuestro mejor contraste frente al miedo: no es propaganda, es una trayectoria. «Merecemos más que el miedo»."
    }
  };

  // Relabel: la base afín ("No estamos dispuestos a renunciar a…", hoy L2) pasa a ser L1; alta competencia pasa a L2. L3 (contraste) sin cambio.
  { const _s = lineInfo.L1; lineInfo.L1 = lineInfo.L2; lineInfo.L2 = _s; }

  const state = {
    locKey: "",
    line: "",
    layer: "upz",
    query: "",
    active: null,
    showBarrios: true,
    showAglomeraciones: false,
    showLoteria: false
  };

  const locByKey = new Map(data.localidades.map((d) => [d.key, d]));
  const upzById = new Map(data.upz.map((d) => [`${d.key}|${d.upz_key}`, d]));
  const upzByName = new Map(data.upz.map((d) => [normKey(d.upz_key), d]));
  const resolveUpz = (f) => upzById.get(`${f.properties.key}|${f.properties.upz_key}`) || upzByName.get(normKey(f.properties.upz_key));
  const puestoByCode = new Map(data.puestos.map((d) => [String(d.cod_puesto), d]));
  const puestoFeatureByCode = new Map((geo.puestos?.features || []).map((f) => [String(f.properties.cod_puesto), f]));

  const els = {
    loc: document.getElementById("locSelect"),
    line: document.getElementById("lineSelect"),
    layer: document.getElementById("layerSelect"),
    search: document.getElementById("searchInput"),
    reset: document.getElementById("resetBtn"),
    lineCards: document.getElementById("lineCards"),
    summary: document.getElementById("summaryCards"),
    segDist: document.getElementById("segDist"),
    reading: document.getElementById("reading"),
    profile: document.getElementById("profileBars"),
    profileSubtitle: document.getElementById("profileSubtitle"),
    priority: document.getElementById("priorityLists"),
    matrix: document.getElementById("matrixBody"),
    editorial: document.getElementById("editorialMatrix"),
    micro: document.getElementById("microSegments"),
    download: document.getElementById("downloadBtn"),
    mapSubtitle: document.getElementById("mapSubtitle"),
    toggleBarrios: document.getElementById("toggleBarrios"),
    toggleAglomeraciones: document.getElementById("toggleAglomeraciones"),
    toggleLoteria: document.getElementById("toggleLoteria"),
    clearMap: document.getElementById("clearMapBtn"),
    fitMap: document.getElementById("fitMapBtn"),
    methodology: document.getElementById("methodology"),
    clusterCards: document.getElementById("clusterCards"),
    weightControls: document.getElementById("weightControls"),
    segmentLists: document.getElementById("segmentLists"),
    downloadSeg: document.getElementById("downloadSegBtn"),
    toggleMatrix: document.getElementById("toggleMatrixBtn"),
    matrixWrap: document.getElementById("matrixWrap"),
    mapColorSelect: document.getElementById("mapColorSelect"),
    mapLegend: document.getElementById("mapLegend")
  };
  let mapColorMode = "segmento";

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

  function classSegment(row) {
    const estrato = Number(row?.estrato);
    if (!Number.isFinite(estrato)) {
      return {
        id: "unknown",
        label: row?.type === "UPZ" ? "Clase por afinar en puestos" : "Estrato s/d",
        detail: "La UPZ orienta territorio; el mensaje de clase se afina bajando al puesto/sitio."
      };
    }
    if (estrato <= 2) return { id: "popular", label: `Clase popular · estrato ${estrato}`, detail: "Derechos materiales, salario, vivienda, servicios, educación y vida cotidiana." };
    if (estrato <= 4) return { id: "media", label: `Clase media · estrato ${estrato}`, detail: "Estabilidad, movilidad social, derechos liberales, ética pública y cuidado familiar." };
    return { id: "alta", label: `Clase alta · estrato ${estrato}`, detail: "Democracia, reputación, páramos, derechos humanos e institucionalidad." };
  }

  function ageSegmentForKey(key) {
    const p = key ? locByKey.get(key) : areaForProfile();
    if (!p) return { id: "media", label: "Edades medias", detail: "Perfil etario mixto; combinar cuidado familiar, trabajo y futuro." };
    if (Number(p.joven) >= 23.5) return { id: "joven", label: "Jóvenes 18-28", detail: `${fmtPct(p.joven)} jóvenes: redes, universidad, empleo, cultura y futuro.` };
    if (Number(p.mayor) >= 16.5) return { id: "mayor", label: "Mayores 65+", detail: `${fmtPct(p.mayor)} mayores: pensión, salud, tranquilidad y cuidado.` };
    return { id: "media", label: "Edades medias", detail: "Perfil mixto: trabajo, familia, cuidado y estabilidad territorial." };
  }

  function segmentMessage(row) {
    const line = wantedLine(row);
    const cls = classSegment(row);
    const age = ageSegmentForKey(row?.key);
    return {
      classLabel: cls.label,
      ageLabel: age.label,
      classText: line.classVariants[cls.id] || line.classVariants.unknown,
      ageText: line.ageVariants[age.id] || line.ageVariants.media,
      formatText: line.formats[age.id] || line.formats.media,
      eventText: line.events[cls.id] || line.events.unknown,
      detail: `${cls.detail} ${age.detail}`
    };
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
    const counts = data.upz.reduce((acc, d) => {
      acc[d.linea] = (acc[d.linea] || 0) + 1;
      return acc;
    }, {});
    els.lineCards.innerHTML = Object.entries(lineInfo).map(([id, line]) => `
      <article class="line-card ${state.line === id ? "active" : ""}" data-line="${id}">
        <h3>${esc(line.title)}</h3>
        <p><b>${esc(line.short)}</b> · ${esc(line.audience)}.</p>
        <p>${esc(line.objective)}</p>
        <p>${esc(line.frame)}</p>
        ${line.historia ? `<p class="line-bio">${esc(line.historia)}</p>` : ""}
        <b>${counts[id] || 0} UPZ con esta línea</b>
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

  function renderEditorialMatrix() {
    els.editorial.innerHTML = Object.entries(lineInfo).map(([id, line]) => `
      <article class="editorial-card" data-line="${id}">
        <div class="editorial-top">
          <span>${esc(id)}</span>
          <h3>${esc(line.title)}</h3>
        </div>
        <p><strong>Objetivo.</strong> ${esc(line.objective)}</p>
        <p><strong>Target.</strong> ${esc(line.audience)}</p>
        <p><strong>Marco.</strong> ${esc(line.frame)}</p>
        <div class="editorial-list">
          <b>Mensajes clave</b>
          <ul>${line.messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
        </div>
        <div class="editorial-list">
          <b>Guiones y piezas</b>
          <ul>${line.scripts.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
        </div>
        <div class="editorial-list">
          <b>Formatos por edad</b>
          <ul>${Object.entries(line.formats).map(([k, m]) => `<li><strong>${esc(k)}:</strong> ${esc(m)}</li>`).join("")}</ul>
        </div>
      </article>
    `).join("");
  }

  function microWhy(linea) {
    if (linea === "L1") return "Es base afín: ya nos votan, el reto es que salgan a votar. Por eso movilizar multiplicadores y activar la abstención.";
    if (linea === "L2") return "Está en disputa: hay clase media, estudiantes, jóvenes y voto de centro por convencer. Por eso persuadir desde el afecto.";
    if (linea === "L3") return "Aquí avanzó la derecha: hay que recuperar con contraste ético y la trayectoria de Iván.";
    return "Ajusta el mensaje al perfil del área antes de bajar a la calle.";
  }

  function renderMicroSegments() {
    const rows = matrixRows().slice(0, 24);
    const groups = new Map();
    rows.forEach((row) => {
      const line = wantedLine(row);
      const seg = segmentMessage(row);
      const id = `${row.linea}|${seg.classLabel}|${seg.ageLabel}`;
      if (!groups.has(id)) {
        groups.set(id, {
          line,
          seg,
          rows: [],
          votos: 0,
          validos: 0
        });
      }
      const g = groups.get(id);
      g.rows.push(row);
      g.votos += Number(row.votos) || 0;
      g.validos += Number(row.validos) || 0;
    });
    const cards = Array.from(groups.values()).slice(0, 9);
    if (!cards.length) {
      els.micro.innerHTML = `<p class="muted">Sin microsegmentos para el filtro activo.</p>`;
      return;
    }
    els.micro.innerHTML = cards.map((g) => {
      const pct = g.validos ? g.votos / g.validos * 100 : null;
      const territories = g.rows.slice(0, 3).map((r) => r.name).join(" · ");
      return `
        <article class="micro-card">
          <div class="micro-head">
            <span class="tag ${g.rows[0].linea}">${esc(g.line.short)}</span>
            <b>${fmtPct(pct)} · ${fmtNum(g.votos)} votos</b>
          </div>
          <h3>${esc(g.seg.classLabel)} / ${esc(g.seg.ageLabel)}</h3>
          <p class="micro-why"><strong>A quién.</strong> ${esc(g.seg.classLabel)} de ${esc(g.seg.ageLabel)} (${fmtNum(g.votos)} votos, Cepeda ${fmtPct(pct)}). <strong>Por qué.</strong> ${esc(microWhy(g.rows[0].linea))}</p>
          <p><strong>Mensaje.</strong> ${esc(g.seg.classText)} ${esc(g.seg.ageText)}</p>
          <p><strong>Pieza.</strong> ${esc(g.seg.formatText)}</p>
          <p><strong>Evento/acción.</strong> ${esc(g.seg.eventText)}</p>
          <p class="muted"><strong>Territorios muestra:</strong> ${esc(territories)}</p>
        </article>
      `;
    }).join("");
  }

  let map;
  let mapLayer;
  let barrioLayer;
  let agloLayer;
  let loteriaLayer;
  let baseBounds;

  function initMap() {
    map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([4.65, -74.09], 10);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM, &copy; CARTO",
      maxZoom: 19
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    loteriaLayer = L.layerGroup().addTo(map);
    barrioLayer = L.layerGroup().addTo(map);
    agloLayer = L.layerGroup().addTo(map);
  }

  function rowColor(row) {
    if (!row) return "#8d97a8";
    if (mapColorMode === "linea" && row.linea && lineInfo[row.linea]) return lineInfo[row.linea].color;
    if (row.cluster) return CLUSTER_COLOR[row.cluster] || "#cbd2dc";
    if (row.cluster === 0) return "#cbd2dc";   // UPZ sin clasificar (rural): gris neutro
    // puestos (sin propiedad cluster): matiz por caída
    if (row.swing <= -7) return "#c7312b";
    if (row.swing <= -3) return "#f3930d";
    return "#8d97a8";
  }

  function renderMapLegend() {
    if (!els.mapLegend) return;
    els.mapLegend.innerHTML = mapColorMode === "linea"
      ? ["L1", "L2", "L3"].map((k) => `<span><i class="sw" style="background:${lineInfo[k].color}"></i> ${k} · ${esc(lineInfo[k].short)}</span>`).join("")
      : `<span><i class="sw" style="background:#7b2ff7"></i> Base afín · abstencionistas</span>
         <span><i class="sw" style="background:#c8d400"></i> Alta competencia</span>
         <span><i class="sw" style="background:#2746e6"></i> Derecha en avance</span>
         <span><i class="sw" style="background:#8a94a6"></i> No priorizado</span>`;
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

  function featureLatLng(feature) {
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    return L.latLng(coords[1], coords[0]);
  }

  function filteredPuestos() {
    return data.puestos.filter(rowMatches);
  }

  function buildSiteGroups(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const feature = puestoFeatureByCode.get(String(row.cod_puesto));
      const latlng = featureLatLng(feature);
      if (!latlng) return;
      const site = row.sitio || row.puesto || row.direccion || "Sitio sin nombre";
      const key = `${row.key}|${norm(site)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          site,
          key: row.key,
          localidad: row.localidad,
          rows: [],
          votos: 0,
          validos: 0,
          lat: 0,
          lng: 0,
          weight: 0
        });
      }
      const g = groups.get(key);
      const weight = Number(row.validos) || 1;
      g.rows.push(row);
      g.votos += Number(row.votos) || 0;
      g.validos += Number(row.validos) || 0;
      g.lat += latlng.lat * weight;
      g.lng += latlng.lng * weight;
      g.weight += weight;
    });
    return Array.from(groups.values()).map((g) => {
      const main = g.rows.slice().sort((a, b) => (Number(b.validos) || 0) - (Number(a.validos) || 0))[0];
      return {
        ...g,
        row: main,
        latlng: L.latLng(g.lat / g.weight, g.lng / g.weight),
        cepeda: g.validos ? g.votos / g.validos * 100 : null
      };
    });
  }

  function drawOptionalLayers() {
    barrioLayer.clearLayers();
    agloLayer.clearLayers();
    loteriaLayer.clearLayers();
    if (state.showLoteria && window.LOTERIA_GEO) {
      const col = { 1: "#ffd27f", 2: "#f7a40d", 3: "#d6453d" };
      const lab = { 1: "baja", 2: "media", 3: "alta" };
      L.geoJSON(window.LOTERIA_GEO, {
        style: (f) => ({ stroke: false, fillColor: col[f.properties.nivel] || "#f7a40d", fillOpacity: .42 }),
        onEachFeature: (f, lyr) => lyr.bindTooltip(
          `<div class="map-tip"><strong>Lotería · aglomeración</strong><span>Concurrencia ${lab[f.properties.nivel] || f.properties.nivel} (nivel ${f.properties.nivel}/3)</span><span>Zonas de mayor flujo de personas (puntos de venta)</span></div>`,
          { sticky: true })
      }).addTo(loteriaLayer);
    }
    const rows = filteredPuestos();

    if (state.showBarrios) {
      buildSiteGroups(rows)
        .sort((a, b) => (b.validos || 0) - (a.validos || 0))
        .slice(0, 90)
        .forEach((g) => {
          const row = g.row;
          const marker = L.circleMarker(g.latlng, {
            radius: clamp(Math.sqrt(Number(g.validos) || 0) / 18, 4, 10),
            color: "#25233a",
            weight: 1,
            fillColor: rowColor(row),
            fillOpacity: .92
          });
          marker.bindTooltip(`
            <div class="map-tip">
              <strong>${esc(g.site)}</strong>
              <span>${esc(g.localidad)} · ${g.rows.length} puesto(s)</span>
              <span>${fmtPct(g.cepeda)} Cepeda · ${fmtNum(g.votos)} votos</span>
              <span>Sitio/barrio de orientación</span>
            </div>
          `, { sticky: true });
          marker.on("click", () => {
            state.locKey = row.key;
            state.active = { type: "puesto", row };
            state.query = g.site;
            els.loc.value = row.key;
            els.search.value = g.site;
            renderAll(false);
          });
          marker.addTo(barrioLayer);
        });
    }

    if (state.showAglomeraciones) {
      const keywords = /universidad|colegio|instituto|sena|parque|plaza|portal|terminal|centro comercial|coliseo|estadio|alcald|hospital|biblioteca|sal[oó]n|casa de la cultura/i;
      rows
        .filter((row) => (Number(row.validos) || 0) >= 4500 || keywords.test(`${row.sitio || ""} ${row.puesto || ""} ${row.direccion || ""}`))
        .sort((a, b) => (Number(b.validos) || 0) - (Number(a.validos) || 0))
        .slice(0, 80)
        .forEach((row) => {
          const latlng = featureLatLng(puestoFeatureByCode.get(String(row.cod_puesto)));
          if (!latlng) return;
          const seg = segmentMessage(row);
          const marker = L.circleMarker(latlng, {
            radius: clamp(Math.sqrt(Number(row.validos) || 0) / 10, 7, 18),
            color: "#111827",
            weight: 2,
            fillColor: row.swing <= -7 ? "#c7312b" : "#f3930d",
            fillOpacity: .58
          });
          marker.bindTooltip(`
            <div class="map-tip">
              <strong>${esc(row.sitio || row.puesto)}</strong>
              <span>Aglomeración sugerida por volumen/actividad electoral</span>
              <span>${fmtNum(row.validos)} votos válidos · ${fmtPct(row.cepeda)} Cepeda</span>
              <span>${esc(seg.eventText)}</span>
            </div>
          `, { sticky: true });
          marker.on("click", () => {
            state.locKey = row.key;
            state.active = { type: "puesto", row };
            els.loc.value = row.key;
            renderAll(false);
          });
          marker.addTo(agloLayer);
        });
    }
  }

  function drawMap(fit) {
    mapLayer.clearLayers();
    const bounds = [];
    const layer = state.layer;
    const leyendaColor = "El color es el segmento de clúster (morado base afín · amarillo alta competencia · azul derecha en avance · gris no priorizado). Las líneas L1/L2/L3 siguen guiando el mensaje en cada UPZ.";
    els.mapSubtitle.textContent = layer === "puestos"
      ? "Cada punto es un puesto; tamaño por votos válidos. " + leyendaColor
      : layer === "upz"
        ? "Cada polígono es una UPZ. " + leyendaColor
        : "Cada polígono es una localidad. " + leyendaColor;

    if (layer === "localidades") {
      L.geoJSON(geo.localidades, {
        filter: (f) => locByKey.has(f.properties.key),   // mostrar SIEMPRE todas las localidades (clic libre entre vecinas)
        style: (f) => {
          const row = locByKey.get(f.properties.key);
          return {
            color: state.locKey === row?.key ? "#25233a" : "#ffffff",
            weight: state.locKey === row?.key ? 3 : 1.2,
            fillColor: rowColor(row),
            fillOpacity: state.locKey && state.locKey !== row?.key ? .35 : .78
          };
        },
        onEachFeature: (f, lyr) => {
          const row = locByKey.get(f.properties.key);
          lyr.bindTooltip(tooltip(row, row?.localidad || f.properties.localidad), { sticky: true });
          lyr.on("click", () => {
            // alternar: si ya está seleccionada, deseleccionar; si no, seleccionar (sin cambiar de capa)
            const same = state.locKey === row.key;
            state.locKey = same ? "" : row.key;
            state.active = same ? null : { type: "localidad", row };
            els.loc.value = state.locKey;
            renderAll(false);
          });
          bounds.push(lyr.getBounds());
        }
      }).addTo(mapLayer);
    }

    if (layer === "upz") {
      const noFilter = () => !state.locKey && !state.line && !state.query;
      L.geoJSON(geo.upz, {
        filter: (f) => {
          const row = resolveUpz(f);
          if (!row) return noFilter();            // UPZ sin dato: rellenar sólo en la vista completa
          return rowMatches(row);
        },
        style: (f) => {
          const row = resolveUpz(f);
          if (!row) return { color: "#ffffff", weight: .6, fillColor: "#dfe3ea", fillOpacity: .55 };
          return {
            color: rowStroke(row),
            weight: state.active?.type === "upz" && state.active.row === row ? 3 : 1,
            fillColor: rowColor(row),
            fillOpacity: .72
          };
        },
        onEachFeature: (f, lyr) => {
          const row = resolveUpz(f);
          if (!row) {
            lyr.bindTooltip(`<div class="map-tip"><strong>${esc(f.properties.upz || "UPZ")}</strong><span>Sin dato electoral en esta capa</span></div>`, { sticky: true });
            bounds.push(lyr.getBounds());
            return;
          }
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
    drawOptionalLayers();
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
    const seg = segmentMessage(row);
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
      <div class="reading-head">
        <h3>${esc(scope)}</h3>
        <span class="reading-tag">${esc(line.short)}</span>
      </div>
      <p class="reading-sum">${strategic}</p>
      <div class="reading-line">
        <b>${esc(line.title)}</b>
        <p>${esc(line.messages[0])}</p>
      </div>
      <p class="reading-meta">${need > 0 ? `Faltan <b>${fmtNum(need)}</b> votos para 50%+1` : `Margen de <b>${fmtNum(Math.abs(need))}</b> sobre 50%+1`} · perfil ${ageText}.</p>
      <div class="chip-row">
        <span class="chip">${esc(seg.classLabel)}</span>
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

  function voteAgg() {
    const rows = (data.upz || []).filter((r) => !state.locKey || r.key === state.locKey);
    let vCep = 0, val = 0, censo = 0, valC = 0, derW = 0, cenW = 0, w = 0;
    rows.forEach((r) => {
      const v = Number(r.validos) || 0;
      vCep += Number(r.votos) || 0; val += v;
      if (r._v2) {
        if (Number(r._v2.censo)) { censo += Number(r._v2.censo); valC += v; }
        if (Number.isFinite(Number(r._v2.dif_cd))) { derW += (Number(r.cepeda) - Number(r._v2.dif_cd)) * v; cenW += (Number(r._v2.centro) || 0) * v; w += v; }
      }
    });
    const izq = val ? vCep / val * 100 : 0, der = w ? derW / w : 0, cen = w ? cenW / w : 0;
    return { izq, der, cen, otros: Math.max(0, 100 - izq - der - cen), part: censo ? valC / censo * 100 : 0, abst: censo ? (1 - valC / censo) * 100 : 0 };
  }

  function renderProfile() {
    const profile = areaForProfile();
    const v = voteAgg();
    const bar = (label, val, color) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${clamp(val, 2, 100)}%;background:${color}"></div></div><b>${fmtPct(val)}</b></div>`;
    const blocHtml = `
      <div class="bar-group">
        <h3>Cómo votó el territorio <small style="color:var(--muted);font-weight:600">(% de votos válidos)</small></h3>
        ${bar("Izquierda · Cepeda", v.izq, "#544595")}
        ${bar("Centro · Fajardo + C. López", v.cen, "#8a94a6")}
        ${bar("Derecha · Abelardo + Paloma", v.der, "#f3930d")}
      </div>
      <div class="bar-group">
        <h3>Participación y abstención <small style="color:var(--muted);font-weight:600">(% del censo)</small></h3>
        ${bar("Participación", v.part, "#2474a6")}
        ${bar("Abstención", v.abst, "#c7312b")}
      </div>`;
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
    const note = `<p class="profile-note"><b>Cómo se calculan estos datos.</b> El voto por bloque sale del preconteo por puesto, como % de los votos válidos de cada UPZ: <b>izquierda</b> = Cepeda; <b>derecha</b> = Abelardo + Paloma; <b>centro</b> = Fajardo + Claudia López. La <b>participación</b> = votos válidos ÷ censo electoral, y la <b>abstención</b> = 100% − participación. La cifra del filtro es el promedio ponderado por votos de sus UPZ. El estrato y el perfil etario son agregados por puesto/localidad: orientan contenido y trabajo de campo, <b>no dicen cómo votó cada persona</b>.</p>`;
    els.profile.innerHTML = blocHtml + estratoHtml + ageHtml + note;
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
    const v = voteAgg();
    const voteChips = `<div class="prio-vote">
      <span style="--c:#544595">Izquierda <b>${fmtPct(v.izq)}</b></span>
      <span style="--c:#8a94a6">Centro <b>${fmtPct(v.cen)}</b></span>
      <span style="--c:#f3930d">Derecha <b>${fmtPct(v.der)}</b></span>
      <span style="--c:#c7312b">Abstención <b>${fmtPct(v.abst)}</b></span>
    </div>`;
    els.priority.innerHTML = voteChips + [
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
    const line = wantedLine(row);
    if (row.cepeda >= 52) return `${line.short}: cuidar testigos, subir participación y pedir a cada simpatizante que mueva familia, vecindario y WhatsApp.`;
    if (row.swing <= -7) return `${line.short}: recuperar voto caído con presencia territorial, pieza emocional y pauta geográfica por puesto.`;
    if (row.cepeda < 40) return `${line.short}: persuadir sin saturar; usar vocerías confiables, contraste verificable y mensaje de futuro.`;
    return `${line.short}: territorio competido; combinar calle, redes, contenido local y llamados concretos a votar.`;
  }

  function matrixRows() {
    const upzRows = data.upz.filter(rowMatches).map((r) => ({ ...r, type: "UPZ", perfil: `${r.puestos} puestos · estrato por puestos`, name: r.upz, estrato: null }));
    const puestoRows = data.puestos.filter(rowMatches).map((r) => ({ ...r, type: "Puesto", perfil: `Estrato ${r.estrato ?? "s/d"} · ${r.sitio || r.direccion || ""}`, name: r.puesto }));
    return upzRows.concat(puestoRows)
      .sort((a, b) => a.linea.localeCompare(b.linea) || a.swing - b.swing || b.validos - a.validos)
      .slice(0, 80);
  }

  function renderMatrix() {
    const rows = matrixRows();
    if (!rows.length) {
      els.matrix.innerHTML = `<tr><td colspan="6">Sin resultados para el filtro activo.</td></tr>`;
      return;
    }
    els.matrix.innerHTML = rows.map((r) => {
      const line = wantedLine(r);
      const seg = segmentMessage(r);
      const swingClass = r.swing < 0 ? "negative" : "positive";
      return `
        <tr>
          <td><strong>${esc(r.name)}</strong><br><span class="muted">${esc(r.type)} · ${esc(r.localidad)}</span></td>
          <td>${fmtPct(r.cepeda)} Cepeda<br><span class="${swingClass}">${fmtPts(r.swing)}</span><br><span class="muted">${fmtNum(r.votos)} votos</span></td>
          <td>${esc(r.perfil || "s/d")}<br><span class="muted">${fmtNum(r.validos)} votos válidos</span></td>
          <td><strong>${esc(seg.classLabel)}</strong><br>${esc(seg.ageLabel)}<br><span class="muted">${esc(seg.detail)}</span></td>
          <td><strong>${esc(line.title)}</strong><br><span class="tag ${r.linea}">${esc(line.short)}</span></td>
          <td>${esc(rowAction(r))}<br><span class="muted">${esc(seg.classText)} ${esc(seg.ageText)}</span><br><span class="muted"><strong>Pieza:</strong> ${esc(seg.formatText)}</span><br><span class="muted"><strong>Evento:</strong> ${esc(seg.eventText)}</span></td>
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
    const headers = ["tipo", "territorio", "localidad", "cepeda_pct", "swing_pts", "votos", "validos", "estrato", "segmento_clase", "segmento_edad", "linea", "mensaje", "target", "mensaje_clase", "mensaje_edad", "pieza_recomendada", "evento_accion", "mensajes_clave", "guiones", "accion"];
    const lines = [headers.join(",")].concat(rows.map((r) => {
      const line = wantedLine(r);
      const seg = segmentMessage(r);
      const vals = [r.type, r.name, r.localidad, r.cepeda, r.swing, r.votos, r.validos, r.estrato ?? "", seg.classLabel, seg.ageLabel, r.linea, line.title, line.audience, seg.classText, seg.ageText, seg.formatText, seg.eventText, line.messages.join(" | "), line.scripts.join(" | "), rowAction(r)];
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

  function renderMethodology() {
    if (!els.methodology) return;
    const m = v2.metodologia || {};
    const vars = (m.variables || []).map((v) => `<li><b>${esc(v.nombre)}.</b> ${esc(v.desc)}</li>`).join("");
    els.methodology.innerHTML = `
      <div class="metodo-text">
        <p><b>Algoritmo.</b> ${esc(m.algoritmo || "k-means")} sobre ${m.n_upz || ""} UPZ, agrupadas en ${m.n_clusters || 4} segmentos homogéneos según su comportamiento electoral.</p>
        <p><b>Variables del modelo.</b></p>
        <ul>${vars}</ul>
        <p class="muted">${esc(m.nota || "")}</p>
      </div>
      <div class="metodo-fit">
        <h3>Ajuste del modelo</h3>
        <div class="fit-kpis">
          <div><b>${m.ajuste?.pct_explicada ?? "—"}%</b><span>varianza explicada entre grupos</span></div>
          <div><b>${m.n_clusters || 4}</b><span>clústeres</span></div>
          <div><b>${m.n_upz || "—"}</b><span>UPZ analizadas</span></div>
        </div>
        <p class="muted">SC entre grupos ${dec(m.ajuste?.bss)} · dentro de grupos ${dec(m.ajuste?.wss)} · total ${dec(m.ajuste?.tss)}. Fuente: ${esc(v2.fuente || "")}.</p>
      </div>`;
  }

  function renderClusters() {
    if (!els.clusterCards) return;
    els.clusterCards.innerHTML = (v2.clusters || []).map((c) => `
      <article class="cluster-card${c.prioriza ? "" : " no-prio"}" style="--seg:${c.color}">
        <div class="cluster-top">
          <span class="seg-dot" style="background:${c.color}"></span>
          <div><h3>${esc(c.nombre)}</h3><p>${esc(c.titulo)}</p></div>
          <span class="seg-n">${c.n} UPZ</span>
        </div>
        <p>${esc(c.desc)}</p>
        <div class="cluster-stats">
          <span><b>${dec(c.cepeda)}%</b> Cepeda</span>
          <span><b>${dec(c.dif_dif)}</b> DIF-DIF</span>
          <span><b>${dec(c.centro)}%</b> centro</span>
        </div>
        <p class="cluster-estrato">${esc(c.estrato)}</p>
        <div class="cluster-pond"><b>Ponderación</b><ul>${(c.ponderacion || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
      </article>
    `).join("");
  }

  const WEIGHT_DEFS = {
    c1: [["part", "Participación (menor = +)"], ["fall", "Caída Cepeda-Petro"], ["censo", "Censo"]],
    c2: [["fall", "Caída Cepeda-Petro"], ["comp", "Competitividad vs derecha"], ["censo", "Censo"], ["centro", "Centro capturable"]],
    c3: [["fall", "Caída Cepeda-Petro"], ["comp", "Competitividad vs derecha"], ["censo", "Censo"], ["centro", "Centro capturable"]]
  };
  const SEG_OF = { c1: 1, c2: 2, c3: 3 };

  function renderWeightControls() {
    if (!els.weightControls) return;
    els.weightControls.innerHTML = Object.entries(WEIGHT_DEFS).map(([ck, defs]) => {
      const c = clusterById.get(SEG_OF[ck]);
      return `<div class="weight-group" style="--seg:${c?.color || "#888"}">
        <h4><span class="seg-dot" style="background:${c?.color}"></span> ${esc(c?.nombre || ck)}</h4>
        ${defs.map(([k, lbl]) => `<label class="weight-row"><span>${esc(lbl)}</span>
          <input type="range" min="0" max="3" step="0.5" value="${pesos[ck][k]}" data-ck="${ck}" data-wk="${k}">
          <b data-out="${ck}-${k}">${dec(pesos[ck][k])}</b></label>`).join("")}
      </div>`;
    }).join("");
    els.weightControls.querySelectorAll("input[type=range]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const ck = inp.dataset.ck, wk = inp.dataset.wk;
        pesos[ck][wk] = Number(inp.value);
        const out = els.weightControls.querySelector(`[data-out="${ck}-${wk}"]`);
        if (out) out.textContent = dec(inp.value);
        renderSegmentLists();
      });
    });
  }

  function segUpzRows(cl) {
    let rows = (data.upz || [])
      .filter((r) => r.cluster === cl && (!state.locKey || r.key === state.locKey))
      .map((r) => ({ ...r, score: clusterScore(r) }))
      .filter((r) => r.score != null)
      .sort((a, b) => b.score - a.score);
    const seen = new Set();
    return rows.filter((r) => { const k = normKey(r.upz_key); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function renderSegmentLists() {
    if (!els.segmentLists) return;
    els.segmentLists.innerHTML = [1, 2, 3].map((cl) => {
      const c = clusterById.get(cl);
      const rows = segUpzRows(cl);
      const items = rows.slice(0, 15).map((r, i) => `
        <li class="seg-item" role="button" tabindex="0" data-key="${esc(`${r.key}|${r.upz_key}`)}">
          <span class="seg-rank">${i + 1}</span>
          <span class="seg-name">${esc(r.upz)}<small>${esc(r.localidad)} · ${esc(lineInfo[r.linea]?.short || r.linea)}</small></span>
          <span class="seg-score"><b>${Math.round(r.score)}</b><small>${fmtNum(r._v2.censo)} censo · ${fmtPts(r._v2.dif_cp)}</small></span>
        </li>`).join("");
      return `<article class="seg-list" style="--seg:${c.color}">
        <header><span class="seg-dot" style="background:${c.color}"></span>
          <div><h3>${esc(c.nombre)}</h3><p>${rows.length} UPZ · ${esc(c.titulo)}</p></div></header>
        <ol class="seg-items">${items || '<li class="muted">Sin UPZ para el filtro activo.</li>'}</ol>
      </article>`;
    }).join("");
    els.segmentLists.querySelectorAll(".seg-item").forEach((el) => {
      const go = () => {
        const row = upzById.get(el.dataset.key);
        if (row) {
          state.locKey = row.key; state.active = { type: "upz", row }; state.layer = "upz";
          els.loc.value = row.key; els.layer.value = "upz"; renderAll(true);
          document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };
      el.addEventListener("click", go);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") go(); });
    });
  }

  function downloadSegments() {
    const headers = ["segmento", "rank", "upz", "localidad", "linea", "score", "censo", "caida_cepeda_petro", "dif_vs_derecha", "participacion_26", "voto_centro"];
    const lines = [headers.join(",")];
    [1, 2, 3].forEach((cl) => {
      const c = clusterById.get(cl);
      segUpzRows(cl).forEach((r, i) => {
        const v = [c.nombre, i + 1, r.upz, r.localidad, r.linea, r.score, r._v2.censo, r._v2.dif_cp, r._v2.dif_cd, r._v2.part26, r._v2.centro];
        lines.push(v.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","));
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bogota_v2_listas_por_segmento.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderSegDist() {
    if (!els.segDist) return;
    const agg = [1, 2, 3, 4].map((id) => {
      const c = clusterById.get(id);
      const seen = new Set();
      const rows = (data.upz || []).filter((r) => r.cluster === id && (!state.locKey || r.key === state.locKey))
        .filter((r) => { const k = normKey(r.upz_key); if (seen.has(k)) return false; seen.add(k); return true; });
      const votos = rows.reduce((a, r) => a + (Number(r.votos) || 0), 0);
      return { c, n: rows.length, votos };
    }).filter((a) => a.c);
    const max = Math.max(1, ...agg.map((a) => a.votos));
    els.segDist.innerHTML = `<h3>Distribución por segmento</h3>` + agg.map((a) => `
      <div class="segdist-row">
        <span class="segdist-label"><i style="background:${a.c.color}"></i>${esc(a.c.nombre)}</span>
        <div class="segdist-track"><div class="segdist-fill" style="width:${Math.round(a.votos / max * 100)}%;background:${a.c.color}"></div></div>
        <span class="segdist-val">${a.n} UPZ · ${fmtNum(a.votos)}</span>
      </div>`).join("");
  }

  function renderAll(fitMap) {
    renderLineCards();
    renderMicroSegments();
    drawMap(fitMap);
    renderSummary();
    renderSegDist();
    renderReading();
    renderProfile();
    renderPriority();
    renderMatrix();
    renderSegmentLists();
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
      state.layer = "upz";
      state.query = "";
      state.active = null;
      els.loc.value = "";
      els.line.value = "";
      els.layer.value = "upz";
      els.search.value = "";
      renderAll(true);
    });
    els.toggleBarrios.addEventListener("change", () => {
      state.showBarrios = els.toggleBarrios.checked;
      drawOptionalLayers();
    });
    els.toggleAglomeraciones.addEventListener("change", () => {
      state.showAglomeraciones = els.toggleAglomeraciones.checked;
      drawOptionalLayers();
    });
    if (els.toggleLoteria) els.toggleLoteria.addEventListener("change", () => {
      state.showLoteria = els.toggleLoteria.checked;
      drawOptionalLayers();
    });
    els.clearMap.addEventListener("click", () => {
      state.locKey = "";
      state.line = "";
      state.query = "";
      state.active = null;
      els.loc.value = "";
      els.line.value = "";
      els.search.value = "";
      renderAll(true);
    });
    els.fitMap.addEventListener("click", () => {
      if (baseBounds) map.fitBounds(baseBounds.pad(.08), { animate: true });
    });
    els.download.addEventListener("click", downloadCsv);
    document.querySelectorAll("[data-excel-download]").forEach((link) => {
      link.addEventListener("click", downloadExcel);
    });
  }

  function setupCollapsibles() {
    [["segmentLists"], ["methodology"], ["microSegments"]].forEach(([id]) => {
      const content = document.getElementById(id);
      if (!content) return;
      const panel = content.closest(".panel");
      const head = panel && panel.querySelector(".panel-head");
      if (!head || head.querySelector(".collapse-btn")) return;
      content.style.display = "none";               // colapsado por defecto: el mapa queda más arriba
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "collapse-btn";
      btn.textContent = "Mostrar";
      btn.addEventListener("click", () => {
        const hidden = content.style.display === "none";
        content.style.display = hidden ? "" : "none";
        btn.textContent = hidden ? "Ocultar" : "Mostrar";
      });
      head.appendChild(btn);
    });
  }

  fillSelects();
  initMap();
  bindEvents();
  renderMethodology();
  renderClusters();
  renderMapLegend();
  if (els.mapColorSelect) els.mapColorSelect.addEventListener("change", () => {
    mapColorMode = els.mapColorSelect.value;
    renderMapLegend();
    drawMap(false);
  });
  if (els.downloadSeg) els.downloadSeg.addEventListener("click", downloadSegments);
  if (els.toggleMatrix && els.matrixWrap) {
    els.toggleMatrix.addEventListener("click", () => {
      const hidden = els.matrixWrap.style.display === "none";
      els.matrixWrap.style.display = hidden ? "" : "none";
      els.toggleMatrix.textContent = hidden ? "Ocultar" : "Desplegar";
    });
  }
  renderAll(true);
  setupCollapsibles();
})();
