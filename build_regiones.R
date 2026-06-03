# =====================================================================
# build_regiones.R - Version pais por departamentos/regiones
# Genera webapp/cundinamarca/data.js con municipios, puestos y perfil etario
# para navegar el pais por departamento sobre la ruta del piloto.
# Ejecutar desde la carpeta madre del proyecto.
# =====================================================================
suppressPackageStartupMessages({
  library(tidyverse)
  library(readxl)
  library(jsonlite)
})

fix_chars <- function(x) {
  x <- as.character(x)
  x <- stringi::stri_replace_all_fixed(x, intToUtf8(0x0143), "Ñ")
  x <- stringi::stri_replace_all_fixed(x, intToUtf8(0x0144), "ñ")
  x <- stringi::stri_replace_all_fixed(x, intToUtf8(0xFFFD), "Ñ")
  x
}
norm <- function(x) toupper(stringi::stri_trans_general(fix_chars(x), "Latin-ASCII"))
key <- function(x) str_squish(str_replace_all(norm(x), "[^A-Z0-9 ]", " "))
slugify <- function(x) str_replace_all(str_to_lower(norm(x)), "[^a-z0-9]+", "-") |> str_replace_all("^-|-$", "")
dept_alias <- function(x) case_when(
  x == "VALLE DEL CAUCA" ~ "VALLE",
  x == "NORTE DE SANTANDER" ~ "NORTE DE SAN",
  str_detect(x, "^ARCHIPIELAGO DE SAN ANDRES") ~ "SAN ANDRES",
  TRUE ~ x
)
mun_alias <- function(x) case_when(
  x == "SAN JOSE DE CUCUTA" ~ "CUCUTA",
  x == "CARTAGENA DE INDIAS" ~ "CARTAGENA",
  x == "SAN JUAN DE PASTO" ~ "PASTO",
  TRUE ~ x
)
label_name <- function(x) case_when(
  key(x) == "BOGOTA D C" ~ "Bogota D.C.",
  TRUE ~ str_to_title(str_to_lower(fix_chars(x)))
)
label_depto <- function(x) case_when(
  key(x) == "BOGOTA D C" ~ "Bogota D.C.",
  key(x) == "NORTE DE SAN" ~ "Norte de Santander",
  TRUE ~ label_name(x)
)
pct_txt <- function(x) paste0(format(round(100 * x, 1), decimal.mark = ","), "%")
pts_txt <- function(x) paste0(format(round(100 * x, 1), decimal.mark = ","), " pts")
smean <- function(x) {
  m <- median(x, na.rm = TRUE)
  if (is.nan(m)) NA_real_ else round(m, 5)
}

PRECONTEO <- list.files(".", pattern = "^PRECONTEO_REGIS_.*\\.csv$")[1]

cat("Leyendo 2022 por puesto...\n")
m22 <- read_delim("datos/crudos/MMV_NACIONAL_PRESIDENTE_2022_1v.csv", delim = ";",
  locale = locale(encoding = "latin1"), col_types = cols(.default = "c"), show_col_types = FALSE)
names(m22) <- toupper(names(m22))

pu22 <- m22 |>
  filter(DEP != "88") |>
  mutate(cod = paste0(DEP, MUN, ZONA, PUESTO),
         votos = as.numeric(VOTOS),
         cn = norm(CANNOMBRE),
         tipo = case_when(
           str_detect(cn, "NULO|NO MARCAD") ~ "nv",
           str_detect(cn, "PETRO") ~ "izq",
           str_detect(cn, "GUTIERREZ|HERNANDEZ") ~ "der",
           TRUE ~ "ov"
         )) |>
  group_by(DEP, DEPNOMBRE, MUN, MUNNOMBRE, cod, PUESNOMBRE) |>
  summarise(izq22 = sum(votos[tipo == "izq"], na.rm = TRUE),
            val22 = sum(votos[tipo != "nv"], na.rm = TRUE),
            .groups = "drop")

cat("Leyendo 2026 por puesto...\n")
p26 <- read_csv(PRECONTEO, col_types = cols(.default = "c"), show_col_types = FALSE) |>
  filter(cod_departamento != "88") |>
  mutate(across(c(ivan, abelardo, gustavo, votos_nulos, votos_no_marcados, total_votos_urna), as.numeric),
         cod = paste0(cod_departamento, cod_municipio, zona, puesto)) |>
  group_by(cod) |>
  summarise(cep26 = sum(ivan, na.rm = TRUE),
            der26 = sum(abelardo + gustavo, na.rm = TRUE),
            val26 = sum(total_votos_urna - votos_nulos - votos_no_marcados, na.rm = TRUE),
            .groups = "drop")

pu <- pu22 |>
  inner_join(p26, by = "cod") |>
  mutate(depto_k = dept_alias(key(DEPNOMBRE)),
         mk = mun_alias(key(MUNNOMBRE)),
         pk = key(PUESNOMBRE),
         izq22p = izq22 / val22,
         izq26p = cep26 / val26,
         swing = izq26p - izq22p) |>
  filter(val22 > 0, val26 > 0)

cat("Leyendo coordenadas de puestos...\n")
geo <- fromJSON("datos/crudos/puestos_georef.json") |>
  mutate(depto_k = dept_alias(key(departamento)),
         mk = mun_alias(key(municipio)),
         pk = key(puesto),
         lat = as.numeric(latitud),
         lon = as.numeric(longitud)) |>
  filter(!is.na(lat), !is.na(lon), between(lat, -5, 15), between(lon, -82, -66)) |>
  group_by(depto_k, mk, pk) |>
  slice(1) |>
  ungroup() |>
  transmute(depto_k, mk, pk, lat, lon, comuna)

pu <- pu |> left_join(geo, by = c("depto_k", "mk", "pk"))
cat("Puestos pais:", nrow(pu), "con coordenadas:", sum(!is.na(pu$lat)),
    sprintf("(%.0f%%)\n", 100 * mean(!is.na(pu$lat))))

cat("Extrayendo perfil etario municipal DANE 2026...\n")
raw <- read_excel("datos/crudos/dane_municipal_edad.xlsx", sheet = 3,
  col_names = FALSE, guess_max = 50000, .name_repair = "minimal")
hdr <- as.character(unlist(raw[7, ]))
nm <- ifelse(is.na(hdr) | hdr == "", paste0("c", seq_along(hdr)), hdr)
dd <- raw[-(1:7), ]
names(dd) <- make.unique(nm)
names(dd)[1:6] <- c("dp", "dpnom", "cod", "muni", "anio", "area")
dd$anio <- suppressWarnings(as.numeric(dd$anio))
d26 <- dd |> filter(anio == 2026, str_detect(area, "Total"))
agecols <- names(d26)[str_detect(names(d26), regex("(hombres|mujeres) [0-9]+ a", ignore_case = TRUE))]
edad_num <- as.integer(str_extract(agecols, "[0-9]+"))
sexo <- ifelse(str_detect(agecols, regex("hombres", ignore_case = TRUE)), "H", "M")
M <- matrix(suppressWarnings(as.numeric(as.matrix(d26[agecols]))), nrow = nrow(d26))
M[is.na(M)] <- 0
edad <- tibble(
  depto_k = dept_alias(key(d26$dpnom)),
  mk = mun_alias(key(d26$muni)),
  pob18 = rowSums(M[, edad_num >= 18, drop = FALSE]),
  j = rowSums(M[, edad_num >= 18 & edad_num <= 28, drop = FALSE]),
  mu = rowSums(M[, edad_num >= 18 & sexo == "M", drop = FALSE]),
  v65 = rowSums(M[, edad_num >= 65, drop = FALSE])
) |>
  mutate(joven = round(100 * j / pob18, 1),
         mayor = round(100 * v65 / pob18, 1),
         mujeres = round(100 * mu / pob18, 1)) |>
  select(depto_k, mk, joven, mayor, mujeres, pob18)

cat("Armando municipios...\n")
build_one <- function(df) {
  cep <- sum(df$cep26, na.rm = TRUE) / sum(df$val26, na.rm = TRUE)
  der <- sum(df$der26, na.rm = TRUE) / sum(df$val26, na.rm = TRUE)
  pet <- sum(df$izq22, na.rm = TRUE) / sum(df$val22, na.rm = TRUE)
  sw <- cep - pet
  margen <- cep - der
  estado <- if (margen >= .05) "ganada" else if (margen >= -.05) "disputa" else "adversa"
  e <- edad |> filter(depto_k == df$depto_k[1], mk == df$mk[1]) |> slice(1)
  ej <- if (nrow(e) == 1) e$joven[1] else NA_real_
  em <- if (nrow(e) == 1) e$mayor[1] else NA_real_
  emu <- if (nrow(e) == 1) e$mujeres[1] else NA_real_
  pts_df <- df |> filter(!is.na(lat), !is.na(lon))
  puntos <- pts_df |>
    transmute(lat = round(lat, 5), lon = round(lon, 5),
              sw = round(100 * swing, 1), ap = round(100 * izq26p, 1),
              v = round(cep26), n = label_name(PUESNOMBRE)) |>
    pmap(function(lat, lon, sw, ap, v, n) list(lat = lat, lon = lon, sw = sw, ap = ap, v = v, n = n))
  zonas <- df |>
    filter(!is.na(comuna), comuna != "") |>
    group_by(comuna) |>
    summarise(ap = round(100 * sum(cep26, na.rm = TRUE) / sum(val26, na.rm = TRUE), 1),
              sw = round(100 * (sum(cep26, na.rm = TRUE) / sum(val26, na.rm = TRUE) - sum(izq22, na.rm = TRUE) / sum(val22, na.rm = TRUE)), 1),
              v = round(sum(cep26, na.rm = TRUE)),
              .groups = "drop") |>
    arrange(sw) |>
    pmap(function(comuna, ap, sw, v) list(comuna = comuna, apoyo = ap, swing = sw, votos = v))
  accion <- switch(estado,
    ganada = sprintf("Municipio ganado (%s vs %s). Prioridad: movilizar el voto afin, blindar testigos y no confiarse.", pct_txt(cep), pct_txt(der)),
    disputa = sprintf("Municipio en disputa (%s vs %s). Prioridad: recuperar donde cayo, persuadir y movilizar a fondo.", pct_txt(cep), pct_txt(der)),
    adversa = sprintf("Municipio adverso (%s vs %s). Prioridad: focalizar, cuidar puestos afines y recortar diferencia sin dispersar recursos.", pct_txt(cep), pct_txt(der))
  )
  etario <- if (!is.na(ej)) {
    sprintf(" Perfil etario DANE 2026: %s%% jovenes 18-28 y %s%% de 65 o mas. %s",
      format(ej, decimal.mark = ","), format(em, decimal.mark = ","),
      if (ej >= 27) "Territorio joven: redes, educacion, empleo y brigadas culturales."
      else if (ej <= 21) "Territorio mas adulto: calle, voz a voz, cuidado y economia familiar."
      else "Perfil mixto: combinar calle, redes y organizacion electoral.")
  } else {
    " Sin cruce etario municipal DANE enlazado."
  }
  list(
    slug = paste0(df$DEP[1], "-", df$MUN[1]),
    municipio = label_name(df$MUNNOMBRE[1]),
    dep = df$DEP[1],
    depto = label_depto(df$DEPNOMBRE[1]),
    depto_slug = slugify(df$DEPNOMBRE[1]),
    estado = estado,
    cepeda = round(100 * cep, 1),
    derecha = round(100 * der, 1),
    petro22 = round(100 * pet, 1),
    swing = round(100 * sw, 1),
    margen = round(100 * margen, 1),
    votos_cepeda = round(sum(df$cep26, na.rm = TRUE)),
    votos_total = round(sum(df$val26, na.rm = TRUE)),
    n_puestos = n_distinct(df$cod),
    lat = smean(df$lat),
    lon = smean(df$lon),
    joven = ej,
    mayor = em,
    mujeres = emu,
    puntos = puntos,
    zonas = zonas,
    texto = paste0(sprintf("En %s, Cepeda obtuvo %s frente a %s del bloque de derecha. Respecto a Petro 2022 (%s), la izquierda %s %s. ",
      label_name(df$MUNNOMBRE[1]), pct_txt(cep), pct_txt(der), pct_txt(pet),
      ifelse(sw < 0, "cayo", "subio"), pts_txt(abs(sw))), accion, etario)
  )
}

det <- pu |> group_by(DEP, MUN) |> group_split() |> map(build_one)
names(det) <- map_chr(det, "slug")
idx <- map(det, \(x) x[c("slug", "municipio", "dep", "depto", "depto_slug", "estado", "cepeda", "derecha", "swing", "margen", "votos_cepeda", "votos_total", "n_puestos", "joven", "mayor", "lat", "lon")]) |> bind_rows()

deptos <- idx |>
  group_by(dep, depto, depto_slug) |>
  summarise(municipios = n(),
            ganadas = sum(estado == "ganada"),
            disputa = sum(estado == "disputa"),
            adversas = sum(estado == "adversa"),
            votos_cepeda = sum(votos_cepeda, na.rm = TRUE),
            votos_total_region = sum(votos_total, na.rm = TRUE),
            cepeda = round(100 * votos_cepeda / votos_total_region, 1),
            joven = round(weighted.mean(joven, .data$votos_total, na.rm = TRUE), 1),
            lat = smean(lat),
            lon = smean(lon),
            .groups = "drop") |>
  rename(votos_total = votos_total_region) |>
  arrange(desc(votos_total))

payload <- list(
  generado = as.character(Sys.Date()),
  resumen = list(
    departamentos = nrow(deptos),
    municipios = nrow(idx),
    votos_cepeda = sum(idx$votos_cepeda, na.rm = TRUE),
    votos_total = sum(idx$votos_total, na.rm = TRUE),
    cepeda = round(100 * sum(idx$votos_cepeda, na.rm = TRUE) / sum(idx$votos_total, na.rm = TRUE), 1)
  ),
  departamentos = deptos,
  municipios = idx,
  detalle = det
)

dir.create("webapp/cundinamarca", recursive = TRUE, showWarnings = FALSE)
writeLines(paste0("window.REGIONES_DATA=", toJSON(payload, auto_unbox = TRUE, na = "null"), ";"),
  "webapp/cundinamarca/data.js")
cat("Escrito webapp/cundinamarca/data.js con", nrow(idx), "municipios en", nrow(deptos), "departamentos\n")
