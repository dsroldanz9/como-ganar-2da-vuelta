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
      titulo = "No podemos ser gobernados por el testaferro de testaferros",
      tono = "Contraste etico y seguridad democratica",
      publico = "clases medias, aspiracionales y votantes de derecha blanda",
      accion = "Mostrar riesgos, escándalos, incoherencias y costos de entregar el país a una derecha mafiosa. Cerrar con llamado a votar."
    ))
  }
  if (izq >= 0.48) {
    return(list(
      linea = "L2",
      titulo = "No estamos dispuestos a renunciar a...",
      tono = "Defensa de derechos y movilizacion popular",
      publico = "sectores populares y clases medias que ya votaron por la izquierda",
      accion = "Recordar salario, educación, vida, tierra y derechos. Convertir apoyo en campaña activa: familia, vecindario y puesto de votación."
    ))
  }
  list(
    linea = "L1",
    titulo = "Tu voto también es por ti",
    tono = "Esperanza responsable para centro persuadible",
    publico = "centro, clase media establecida y voto que teme el ruido politico",
    accion = "Hablar de tranquilidad, futuro, respeto, cuidado y responsabilidad democrática. Bajar el miedo y abrir permiso para votar por Cepeda."
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
    list(id = "L1", titulo = "Tu voto también es por ti", foco = "Centro persuadible y clase media establecida", pieza = "Video sobrio + carrusel de confianza + copy de futuro"),
    list(id = "L2", titulo = "No estamos dispuestos a renunciar a...", foco = "Sectores populares y voto afín por fortalecer", pieza = "Voz en off con naturaleza, aulas, barrios, campo, salario, universidad y derechos"),
    list(id = "L3", titulo = "No podemos ser gobernados por el testaferro de testaferros", foco = "Clase media aspiracional y territorios donde creció derecha", pieza = "Video de contraste con archivo, titulares, denuncias y llamado ético a votar")
  ),
  localidades = loc_out,
  upz = upz_out,
  puestos = puestos_out,
  estratos = estrato_out
)

lineas_excel <- tibble::tribble(
  ~linea, ~mensaje, ~objetivo, ~publico, ~pieza_sugerida,
  "L1", "Tu voto también es por ti",
  "Persuadir a centro y clases medias que pueden votar por Cepeda si se baja el miedo y se habla de futuro.",
  "Centro, clase media establecida y voto que teme el ruido político.",
  "Video sobrio, carrusel de confianza, vocerías ciudadanas y piezas de futuro.",
  "L2", "No estamos dispuestos a renunciar a...",
  "Fortalecer el voto popular y afín, convirtiendo simpatía en participación electoral y trabajo de barrio.",
  "Sectores populares y clases medias que ya votaron por la izquierda.",
  "Voz en off con barrios, aulas, naturaleza, campo, salario vital, universidad, tierra y derechos.",
  "L3", "No podemos ser gobernados por el testaferro de testaferros",
  "Recuperar voto donde avanzó la derecha con contraste ético, denuncia y cierre democrático.",
  "Clases medias aspiracionales, derecha blanda y territorios donde creció la derecha.",
  "Video de archivo, titulares, contraste de trayectorias y piezas cortas para redes y pauta geográfica."
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
    )
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
    prioridad_operativa,
    linea, mensaje, objetivo, publico, pieza_sugerida, lectura,
    prioridad_score = round(prioridad_score, 1)
  )

objetivo_excel <- tibble::tribble(
  ~bloque, ~texto,
  "Objetivo general", "Aportar una herramienta para focalizar mejor esfuerzos e información en Bogotá: dónde moverse, qué priorizar, qué mensaje llevar y cómo convertir datos públicos en acción territorial.",
  "Qué cruza", "Resultados electorales por localidad, UPZ y puesto; cambio frente a 2022; estrato agregado por puesto; perfil etario por localidad; volumen de votos y meta 50% + 1.",
  "Cómo leer L1", "Tu voto también es por ti: línea para centro persuadible y clases medias que necesitan tranquilidad, futuro, respeto y confianza.",
  "Cómo leer L2", "No estamos dispuestos a renunciar a...: línea para fortalecer voto popular y afín alrededor de salario, educación, vida, tierra, derechos y Estado presente.",
  "Cómo leer L3", "No podemos ser gobernados por el testaferro de testaferros: línea de contraste ético para territorios con derecha fuerte o caída reciente del voto progresista.",
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
