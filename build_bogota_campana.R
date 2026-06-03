# =====================================================================
# build_bogota_campana.R - Sitio de mensajes para Bogota
# Genera webapp/bogota-campana/data.js y geo.js con datos territoriales,
# etarios, estrato por puesto y recomendacion de linea comunicativa.
# Ejecutar desde la carpeta madre del proyecto.
# =====================================================================
suppressPackageStartupMessages({
  library(tidyverse)
  library(jsonlite)
})

norm <- function(x) toupper(stringi::stri_trans_general(as.character(x), "Latin-ASCII"))
key <- function(x) stringr::str_squish(stringr::str_replace_all(norm(x), "[^A-Z0-9 ]", " "))
label <- function(x) stringr::str_to_title(stringr::str_to_lower(as.character(x)))
pct <- function(x) paste0(format(round(100 * x, 1), decimal.mark = ","), "%")
pts <- function(x) paste0(ifelse(x >= 0, "+", ""), format(round(100 * x, 1), decimal.mark = ","), " pts")

out_dir <- "webapp/bogota-campana"
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

salida <- "datos/salida"
geo_dir <- "datos/geo"

loc <- read_csv(file.path(salida, "real_2026_por_localidad.csv"), show_col_types = FALSE) |>
  mutate(key = key(localidad), localidad = label(localidad))

edad <- read_csv(file.path(salida, "perfil_edad_sexo_localidad.csv"), show_col_types = FALSE) |>
  mutate(key = key(localidad), localidad = label(localidad))

foc <- read_csv(file.path(salida, "focalizacion_2davuelta_localidad.csv"), show_col_types = FALSE) |>
  mutate(key = key(localidad), localidad = label(localidad))

upz <- read_csv(file.path(salida, "real_por_upz.csv"), show_col_types = FALSE) |>
  mutate(key = key(localidad), upz_key = key(upz), localidad = label(localidad), upz = label(upz))

puestos <- read_csv(file.path(salida, "real_2026_por_puesto.csv"), show_col_types = FALSE) |>
  mutate(key = key(localidad), cod_puesto = as.character(cod_puesto), localidad = label(localidad))

estrato_puesto <- read_csv(file.path(salida, "puestos_estrato_bogota.csv"), show_col_types = FALSE) |>
  mutate(cod_puesto = as.character(cod_puesto), key = key(localidad), localidad = label(localidad))

puesto_join <- puestos |>
  left_join(estrato_puesto |> select(cod_puesto, puesto, sitio, direccion, estrato_puesto), by = "cod_puesto")

estrato_loc <- puesto_join |>
  filter(!is.na(estrato_puesto)) |>
  group_by(key, localidad, estrato = estrato_puesto) |>
  summarise(
    cepeda = sum(cepeda_26, na.rm = TRUE) / sum(validos_26, na.rm = TRUE),
    derecha = sum(derecha_26, na.rm = TRUE) / sum(validos_26, na.rm = TRUE),
    swing = sum(cepeda_26, na.rm = TRUE) / sum(validos_26, na.rm = TRUE) - sum(cepeda_22, na.rm = TRUE) / sum(validos_22, na.rm = TRUE),
    votos = sum(cepeda_26, na.rm = TRUE),
    validos = sum(validos_26, na.rm = TRUE),
    puestos = n(),
    .groups = "drop"
  ) |>
  arrange(key, estrato)

loc2 <- loc |>
  left_join(edad |> select(key, pct_mujeres, pct_18_28, pct_29_44, pct_45_64, pct_65mas, pob18), by = "key") |>
  left_join(foc |> select(key, bolsa_afin, competit, score_movilizar, score_persuadir, score_defender), by = "key")

message_for <- function(izq, der, swing, joven, estratos) {
  est <- mean(estratos, na.rm = TRUE)
  if (is.nan(est)) est <- NA_real_
  if (!is.na(est) && est >= 3.2 && (swing < -0.045 || der > izq)) {
    return(list(
      linea = "L3",
      titulo = "Superioridad ética y contraste democrático",
      tono = "Contraste ético y seguridad democrática",
      publico = "clases medias aspiracionales, sectores populares no convencidos y territorios donde creció la derecha",
      accion = "Contrastar trayectorias y riesgos políticos con hechos verificables, titulares y archivo con fuente. Cerrar con merecemos más que el miedo."
    ))
  }
  if (izq >= 0.48) {
    return(list(
      linea = "L2",
      titulo = "No estamos dispuestos a renunciar a...",
      tono = "Movilización activa y defensa de derechos",
      publico = "sectores populares, clases medias progresistas, jóvenes, militancia territorial y familias del sur",
      accion = "Convertir simpatizantes en multiplicadores: invitar, explicar programa, mover familia, tomar tinto con indecisos, acompañar al puesto y cuidar participación."
    ))
  }
  list(
    linea = "L1",
    titulo = "Tu voto es por mí",
    tono = "Esperanza responsable para centro persuadible",
    publico = "clase media establecida, sectores altos liberales, técnicos, burócratas y votantes de Fajardo, Claudia u Oviedo",
    accion = "Pedir el voto desde el afecto: hija, hijo, mamá, papá, pareja, amistad o colega que sería afectado por el retroceso democrático."
  )
}

estratos_by_key <- split(estrato_loc, estrato_loc$key)

loc_rows <- loc2 |>
  arrange(swing) |>
  mutate(
    msg = pmap(list(izq_2026, der_2026, swing, pct_18_28, key), \(izq, der, sw, joven, k) {
      es <- estratos_by_key[[k]]
      message_for(izq, der, sw, joven, if (is.null(es)) numeric() else es$estrato)
    })
  )

make_text <- function(r) {
  msg <- r$msg[[1]]
  paste0(
    r$localidad, " tiene Cepeda en ", pct(r$izq_2026), " y derecha en ", pct(r$der_2026),
    ". Frente a 2022, la izquierda ", ifelse(r$swing < 0, "cayó ", "subió "), pts(r$swing),
    ". Perfil etario: ", pct(r$pct_18_28), " jóvenes 18-28 y ", pct(r$pct_65mas), " de 65+.",
    " Linea recomendada: ", msg$titulo, ". ", msg$accion
  )
}

loc_out <- loc_rows |>
  mutate(texto = pmap_chr(
    list(localidad, izq_2026, der_2026, swing, pct_18_28, pct_65mas, msg),
    \(localidad, izq, der, swing, pct_18_28, pct_65mas, msg) {
      paste0(
        localidad, " tiene Cepeda en ", pct(izq), " y derecha en ", pct(der),
        ". Frente a 2022, la izquierda ", ifelse(swing < 0, "cayó ", "subió "), pts(swing),
        ". Perfil etario: ", pct(pct_18_28), " jóvenes 18-28 y ", pct(pct_65mas), " de 65+.",
        " Línea recomendada: ", msg$titulo, ". ", msg$accion
      )
    }
  )) |>
  transmute(
    key, localidad,
    cepeda = round(100 * izq_2026, 1),
    derecha = round(100 * der_2026, 1),
    swing = round(100 * swing, 1),
    votos = round(votos_cepeda_26),
    validos = round(validos_26),
    joven = round(100 * pct_18_28, 1),
    mayor = round(100 * pct_65mas, 1),
    mujeres = round(100 * pct_mujeres, 1),
    bolsa_afin = round(bolsa_afin),
    score_movilizar = round(score_movilizar),
    score_persuadir = round(score_persuadir),
    linea = map_chr(msg, "linea"),
    mensaje = map_chr(msg, "titulo"),
    tono = map_chr(msg, "tono"),
    publico = map_chr(msg, "publico"),
    accion = map_chr(msg, "accion"),
    texto
  )

upz_out <- upz |>
  mutate(linea = pmap_chr(list(izq_2026, swing, validos_26), \(izq, sw, val) {
    if (izq >= .52) "L2" else if (sw < -.055 || izq < .40) "L3" else "L1"
  })) |>
  transmute(
    upz_key, key, upz, localidad,
    cepeda = round(100 * izq_2026, 1),
    swing = round(100 * swing, 1),
    votos = round(votos_cepeda_26),
    validos = round(validos_26),
    puestos,
    categoria,
    linea
  )

puestos_out <- puesto_join |>
  mutate(linea = case_when(
    pct_izq_2026 >= .52 ~ "L2",
    swing_izq < -.055 | pct_izq_2026 < .40 ~ "L3",
    TRUE ~ "L1"
  )) |>
  transmute(
    cod_puesto, key, localidad,
    puesto = coalesce(puesto, sitio, cod_puesto),
    sitio = coalesce(sitio, puesto),
    direccion,
    estrato = estrato_puesto,
    cepeda = round(100 * pct_izq_2026, 1),
    derecha = round(100 * pct_der_2026, 1),
    swing = round(100 * swing_izq, 1),
    votos = round(cepeda_26),
    validos = round(validos_26),
    linea
  )

estrato_out <- estrato_loc |>
  transmute(key, localidad, estrato,
            cepeda = round(100 * cepeda, 1),
            derecha = round(100 * derecha, 1),
            swing = round(100 * swing, 1),
            votos = round(votos),
            validos = round(validos),
            puestos)

payload <- list(
  generado = as.character(Sys.Date()),
  resumen = list(localidades = nrow(loc_out), upz = nrow(upz_out), puestos = nrow(puestos_out)),
  lineas = list(
    list(id = "L1", titulo = "Tu voto es por mí", foco = "Centro persuadible, afectos familiares y clase media establecida", pieza = "Video testimonial familiar + carrusel de confianza + WhatsApp de cuidado"),
    list(id = "L2", titulo = "No estamos dispuestos a renunciar a...", foco = "Simpatizantes que deben volverse multiplicadores activos", pieza = "Reto de llevar tres, tinto con indecisos, WhatsApp familiar, comité por puesto y salida colectiva a votar"),
    list(id = "L3", titulo = "Superioridad ética y contraste democrático", foco = "Clase media aspiracional, derecha blanda y territorios donde creció derecha", pieza = "Contraste con archivo y titulares verificados, trayectoria limpia y llamado ético a votar")
  ),
  localidades = loc_out,
  upz = upz_out,
  puestos = puestos_out,
  estratos = estrato_out
)

lineas_excel <- tibble::tribble(
  ~linea, ~mensaje, ~objetivo, ~publico, ~mensajes_clave, ~guiones, ~formatos_jovenes, ~formatos_edades_medias, ~formatos_mayores, ~eventos_populares, ~eventos_clase_media, ~eventos_clase_alta, ~pieza_sugerida,
  "L1", "Tu voto es por mí",
  "Persuadir centro, abstención blanda y clases medias desde vínculos concretos de afecto: hija, hijo, mamá, papá, amistad, pareja, colega o familiar.",
  "Clase media establecida, sectores altos liberales, técnicos, burócratas, profesionales y votantes de Fajardo, Claudia u Oviedo en zonas de disputa.",
  "Tu voto es por mí | Tu voto es por los viejitos para que no se queden sin pensión | Tu voto es por nosotras las mujeres | Tu voto es por los derechos humanos | Tu voto es por la vida, los páramos, la gente trabajadora y quienes tienen menos",
  "Joven de clase media a su papá: papá, esta vez tu voto es por mí | Madre a hijo apático: si no votas por ti, vota por mí | Carrusel familiar: no todos votamos igual, pero sí nos cuidamos",
  "Reels testimoniales, memes familiares suaves, historias con pregunta, stickers de WhatsApp.",
  "Video testimonial familiar, carrusel Facebook/Instagram, carta corta hija/hijo a papá-mamá, reunión de edificio.",
  "Audio de WhatsApp, volante simple, Facebook, llamada familiar, puerta a puerta.",
  "Olla comunitaria, puerta a puerta, punto pedagógico en mercado/parque, llamadas familiares.",
  "Café de vecinos, reunión de conjunto, foro con técnicos/profesionales, universidades/coworkings.",
  "Conversatorio de democracia y derechos, carta pública de figuras respetadas, pauta sobria.",
  "Video testimonial familiar, carrusel de confianza, fotos cotidianas, WhatsApp familiar y pauta sobria en UPZ competidas.",
  "L2", "No estamos dispuestos a renunciar a...",
  "Convertir simpatizantes en multiplicadores activos: que no solo voten, sino que inviten, expliquen programa, muevan familia, tomen tinto con un amigo, acompañen al puesto y ayuden a subir participación.",
  "Sectores populares, clases medias progresistas, jóvenes, militancia territorial, familias del sur y territorios afines donde toca subir participación.",
  "No renunciar al salario digno | Universidad pública gratuita | Vivienda digna y tierra | Derechos de mujeres y personas LGBTI | No volver al miedo ni a la represión | Si ya estás convencido, convence a tres más | Tómate un tinto con alguien que duda | Este domingo no va nadie solo: votamos y llevamos a alguien más",
  "Voz en off: no estamos dispuestos a renunciar a... por eso salimos a convencer y votar | Jóvenes llamando a sumar familia, pareja, amigos y vecinos | Pieza de tinto con indeciso | Familia completa: votamos, llamamos, acompañamos y cuidamos el puesto",
  "Reels reto 'yo llevo a tres', historias con plantilla de compromiso, memes de no volver atrás, TikTok de tinto con amigo y WhatsApp militante.",
  "Checklist familiar de votación, carrusel programa+acción, audio para grupos de trabajo/familia, invitación a tinto y pieza 'no vayas solo'.",
  "Audio de WhatsApp, volante simple con hora/puesto, llamada familiar, Facebook comunitario y puerta a puerta de confianza.",
  "Comité por puesto, olla/tinto comunitario, jornada de llamadas, volanteo en transporte, recorrido por comercio y cadena barrial de WhatsApp.",
  "Tinto con indecisos, reunión de conjunto, encuentro de familias trabajadoras, activación en parques y llamada organizada a abstencionistas.",
  "Círculo de apoyo logístico, café de donantes de tiempo, red de profesionales difundiendo argumentos y transporte electoral.",
  "Contenido de movilización: piezas de programa con tarea concreta, audios para WhatsApp, reto de llevar tres personas, tinto con indecisos, checklist familiar y llamados por puesto.",
  "L3", "Superioridad ética y contraste democrático",
  "Contrastar trayectorias, valores y riesgos políticos para recuperar voto en sectores aspiracionales, populares no convencidos y zonas donde creció la derecha.",
  "Clases medias aspiracionales, sectores populares con rabia contra élites corruptas, derecha blanda, técnicos y territorios de caída o derecha fuerte.",
  "Merecemos más que el miedo | El futuro es la vida | No entregar el país a una élite mafiosa | Revolución ética contra poderes oscuros | Iván: derechos, paz, denuncia de corrupción y control al propio gobierno",
  "Montaje con archivo y titulares verificados | Contraste: derechos vs desprecio al diferente | Video de ética pública: quién puede gobernar sin deberle el país a poderes oscuros",
  "Memes de contraste, clips de archivo subtitulados, carruseles miedo vs futuro, videos reacción con fuente visible.",
  "Carrusel comparativo, video de trayectoria, placas de titulares verificados, audio sereno de ética pública.",
  "Volante sobrio, audio explicativo, Facebook, conversación directa y pieza de tranquilidad.",
  "Conversatorio barrial ricos mafiosos vs pueblo trabajador, comercio, debate abierto, perifoneo de dignidad.",
  "Foro de ética pública, reunión con profesionales/técnicos, grupos de oficina, conjuntos residenciales.",
  "Encuentro de institucionalidad, carta de figuras respetadas, reputación país y riesgo democrático.",
  "Videos de contraste con fuentes, carruseles de trayectoria, memes de superioridad ética, piezas cortas de riesgo democrático y pauta en UPZ de caída."
)

upz_excel <- upz_out |>
  left_join(loc_out |> select(key, localidad, joven, mayor, mujeres), by = c("key", "localidad")) |>
  left_join(lineas_excel, by = "linea") |>
  mutate(
    votos_para_50_mas_1 = pmax(0, floor(validos * 0.5) + 1 - votos),
    prioridad_operativa = case_when(
      cepeda >= 52 ~ "Fortalecer",
      swing <= -6.5 ~ "Recuperar",
      cepeda < 40 ~ "Persuadir",
      TRUE ~ "Competir"
    ),
    prioridad_score = case_when(
      prioridad_operativa == "Fortalecer" ~ votos * pmax(cepeda - 50, 1) / 100,
      prioridad_operativa == "Recuperar" ~ validos * abs(swing) / 100,
      prioridad_operativa == "Persuadir" ~ validos * (100 - abs(50 - cepeda)) / 100,
      TRUE ~ validos * .35
    ),
    lectura = case_when(
      prioridad_operativa == "Fortalecer" ~ "Territorio afín: cuidar participación, testigos, transporte electoral y activación de redes familiares/vecinales.",
      prioridad_operativa == "Recuperar" ~ "Territorio con caída: requiere presencia, contraste de riesgo y una razón concreta para volver a votar.",
      prioridad_operativa == "Persuadir" ~ "Territorio adverso o de derecha fuerte: no saturar, usar vocerías confiables y mensajes de futuro/ética.",
      TRUE ~ "Territorio competido: combinar calle, pauta digital y seguimiento por puestos."
    ),
    segmento_edad = case_when(
      joven >= 23.5 ~ "Jóvenes 18-28",
      mayor >= 16.5 ~ "Mayores 65+",
      TRUE ~ "Edades medias / mixto"
    ),
    mensaje_por_edad = case_when(
      segmento_edad == "Jóvenes 18-28" & linea == "L1" ~ "Tu voto protege mi futuro, mi universidad, mi libertad y mi derecho a vivir sin miedo.",
      segmento_edad == "Jóvenes 18-28" & linea == "L2" ~ "No basta indignarse en redes: hacer reels, invitar parche, llamar familia y llevar a alguien a votar.",
      segmento_edad == "Jóvenes 18-28" & linea == "L3" ~ "No al miedo, no al autoritarismo, no a una política que odia al diferente.",
      segmento_edad == "Mayores 65+" & linea == "L1" ~ "Tu voto protege pensión, salud, tranquilidad familiar y una democracia sin violencia.",
      segmento_edad == "Mayores 65+" & linea == "L2" ~ "Voz a voz de confianza, llamada a hijos/nietos, audio de WhatsApp y acompañamiento al puesto.",
      segmento_edad == "Mayores 65+" & linea == "L3" ~ "Tranquilidad, decencia pública, no violencia y no entregar el país a poderes oscuros.",
      linea == "L1" ~ "Tu voto cuida a tus hijos, tu trabajo, tu barrio y la estabilidad de quienes quieres.",
      linea == "L2" ~ "Organizar familia, trabajo y vecinos: tinto con quien duda, llamada a quien se abstiene y salida colectiva a votar.",
      TRUE ~ "Ética, seguridad democrática sin mafia, estabilidad y respeto a la clase trabajadora."
    ),
    segmento_clase = "Afinar por estrato del puesto",
    mensaje_por_clase = "La UPZ orienta territorio; para lucha de clases bajar al puesto/sitio y ajustar: estratos 1-2 derechos materiales, 3-4 estabilidad/movilidad social, 5-6 democracia/institucionalidad.",
    formatos_por_edad = case_when(
      segmento_edad == "Jóvenes 18-28" ~ formatos_jovenes,
      segmento_edad == "Mayores 65+" ~ formatos_mayores,
      TRUE ~ formatos_edades_medias
    ),
    eventos_por_clase = "Escoger con estrato de puesto: popular=comunidad/comercio/perifoneo; media=conjunto/café/foro técnico; alta=conversatorio institucional/pauta sobria."
  ) |>
  arrange(desc(prioridad_score)) |>
  transmute(
    orden_prioridad = row_number(),
    localidad, upz,
    cepeda_pct = cepeda,
    cambio_vs_2022_pts = swing,
    votos_cepeda = votos,
    votos_validos = validos,
    votos_para_50_mas_1,
    puestos,
    jovenes_18_28_pct = joven,
    mayores_65_pct = mayor,
    mujeres_pct = mujeres,
    segmento_edad,
    segmento_clase,
    prioridad_operativa,
    linea, mensaje, objetivo, publico, mensajes_clave, guiones, mensaje_por_edad, mensaje_por_clase, formatos_por_edad, eventos_por_clase, formatos_jovenes, formatos_edades_medias, formatos_mayores, eventos_populares, eventos_clase_media, eventos_clase_alta, pieza_sugerida, lectura,
    prioridad_score = round(prioridad_score, 1)
  )

objetivo_excel <- tibble::tribble(
  ~bloque, ~texto,
  "Objetivo general", "Aportar una herramienta para focalizar mejor esfuerzos e información en Bogotá: dónde moverse, qué priorizar, qué mensaje llevar y cómo convertir datos públicos en acción territorial.",
  "Qué cruza", "Resultados electorales por localidad, UPZ y puesto; cambio frente a 2022; estrato agregado por puesto; perfil etario por localidad; volumen de votos y meta 50% + 1.",
  "Cómo leer L1", "Tu voto es por mí: línea de afecto para centro, clases medias y abstención blanda; convierte el voto en cuidado hacia una persona concreta.",
  "Cómo leer L2", "No estamos dispuestos a renunciar a...: línea para fortalecer voto popular y afín alrededor de salario, universidad, vivienda, tierra, derechos, memoria y futuro.",
  "Cómo leer L3", "Superioridad ética y contraste democrático: línea de contraste para territorios con derecha fuerte o caída reciente; usar archivo y titulares verificables, no afirmaciones sin fuente.",
  "Uso recomendado", "Usar la matriz por UPZ para piezas de redes, pauta geográfica, recorridos, testigos, WhatsApp territorial y conversaciones de barrio. No perfila personas: trabaja con agregados territoriales.",
  "Autor", "Daniel Santiago Roldán."
)

writexl::write_xlsx(
  list(
    Objetivo_y_metodo = objetivo_excel,
    UPZ_priorizadas = upz_excel,
    Localidades = loc_out,
    Puestos = puestos_out,
    Estratos = estrato_out,
    Lineas_mensaje = lineas_excel
  ),
  file.path(out_dir, "bogota_matriz_upz_mensajes.xlsx")
)

writeLines(paste0("window.BOGOTA_CAMPANA=", toJSON(payload, auto_unbox = TRUE, dataframe = "rows", na = "null"), ";"),
  file.path(out_dir, "data.js"))

# Localidades vienen en formato Esri JSON: convertir a GeoJSON simple.
loc_geo_raw <- fromJSON(file.path(geo_dir, "localidades.geojson"), simplifyVector = FALSE)
loc_features <- map(loc_geo_raw$features, \(f) {
  coords <- f$geometry$rings
  list(
    type = "Feature",
    properties = list(key = key(f$attributes$LocNombre), localidad = label(f$attributes$LocNombre)),
    geometry = list(type = "Polygon", coordinates = coords)
  )
})
loc_geo <- list(type = "FeatureCollection", features = loc_features)

upz_geo <- fromJSON(file.path(geo_dir, "upz.geojson"), simplifyVector = FALSE)
upz_geo$features <- map(upz_geo$features, \(f) {
  f$properties <- list(
    upz_key = key(f$properties$UPLNOMBRE),
    key = key(f$properties$LOCNOMBRE),
    upz = label(f$properties$UPLNOMBRE),
    localidad = label(f$properties$LOCNOMBRE)
  )
  f
})

puestos_geo <- fromJSON(file.path(geo_dir, "puestos_votacion.geojson"), simplifyVector = FALSE)
puestos_geo$features <- map(puestos_geo$features, \(f) {
  f$properties <- list(
    cod_puesto = as.character(f$properties$`Código_del_puesto`),
    puesto = f$properties$Nombre_del_puesto,
    localidad = label(f$properties$Nombre_de_localidad),
    key = key(f$properties$Nombre_de_localidad)
  )
  f
})

writeLines(paste0("window.BOGOTA_GEO=", toJSON(list(localidades = loc_geo, upz = upz_geo, puestos = puestos_geo), auto_unbox = TRUE, na = "null"), ";"),
  file.path(out_dir, "geo.js"))

cat("Escrito", file.path(out_dir, "data.js"), "geo.js y bogota_matriz_upz_mensajes.xlsx\n")
