# =====================================================================
# build_municipios.R - Version nacional municipal
# Genera webapp/municipios/data.js con todos los municipios disponibles:
# resultados 2022/2026, segunda vuelta 2022, perfil etario DANE 2026
# y coordenadas aproximadas desde puestos georreferenciados.
# =====================================================================
source("R/01_funciones.R")
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
key <- function(x) stringr::str_squish(stringr::str_replace_all(norm(x), "[^A-Z0-9 ]", " "))
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
  TRUE ~ stringr::str_to_title(stringr::str_to_lower(fix_chars(x)))
)
label_depto <- function(x) case_when(
  key(x) == "BOGOTA D C" ~ "Bogota D.C.",
  key(x) == "NORTE DE SAN" ~ "Norte de Santander",
  TRUE ~ label_name(x)
)
PRECONTEO <- list.files(".", pattern = "^PRECONTEO_REGIS_.*\\.csv$")[1]

fmt <- function(x) format(round(x), big.mark = ".", decimal.mark = ",")
pct <- function(x) paste0(format(round(100 * x, 1), decimal.mark = ","), "%")
pts <- function(x) paste0(ifelse(x >= 0, "+", ""), format(round(100 * x, 1), decimal.mark = ","), " pts")
jn <- function(x) if (length(x) && any(!is.na(x))) paste(head(na.omit(x), 3), collapse = ", ") else "sin dato"

cat("Leyendo 2022...\n")
m22 <- readr::read_delim("datos/crudos/MMV_NACIONAL_PRESIDENTE_2022_1v.csv", delim = ";",
  locale = locale(encoding = "latin1"), col_types = cols(.default = "c"), show_col_types = FALSE)
names(m22) <- toupper(names(m22))
m22 <- m22 |>
  mutate(votos = as.numeric(VOTOS), cn = norm(CANNOMBRE),
         tipo = case_when(str_detect(cn, "NULO|NO MARCAD") ~ "nv",
                          str_detect(cn, "PETRO") ~ "izq",
                          str_detect(cn, "GUTIERREZ|HERNANDEZ") ~ "der",
                          TRUE ~ "ov"))
xwalk <- m22 |>
  distinct(dep = DEP, mun = MUN, depto = DEPNOMBRE, municipio = MUNNOMBRE) |>
  mutate(depto_k = key(depto), municipio_k = key(municipio))
v22 <- m22 |>
  group_by(dep = DEP, mun = MUN) |>
  summarise(izq22 = sum(votos[tipo == "izq"], na.rm = TRUE),
            val22 = sum(votos[tipo != "nv"], na.rm = TRUE), .groups = "drop")

cat("Leyendo 2022 segunda vuelta...\n")
m2v <- readr::read_delim("datos/crudos/MMV_NACIONAL_PRESIDENTE_2022_2v.csv", delim = ";",
  locale = locale(encoding = "latin1"), col_types = cols(.default = "c"), show_col_types = FALSE)
names(m2v) <- toupper(names(m2v))
v2v <- m2v |>
  mutate(votos = as.numeric(VOTOS), cn = norm(CANNOMBRE),
         tipo = case_when(str_detect(cn, "NULO|NO MARCAD") ~ "nv",
                          str_detect(cn, "PETRO") ~ "izq",
                          TRUE ~ "ov")) |>
  group_by(dep = DEP, mun = MUN) |>
  summarise(izq2v = sum(votos[tipo == "izq"], na.rm = TRUE),
            val2v = sum(votos[tipo != "nv"], na.rm = TRUE), .groups = "drop")

cat("Leyendo 2026...\n")
p26 <- read_csv(PRECONTEO, col_types = cols(.default = "c"), show_col_types = FALSE) |>
  mutate(across(c(ivan, abelardo, gustavo, votos_nulos, votos_no_marcados, total_votos_urna), as.numeric)) |>
  group_by(dep = cod_departamento, mun = cod_municipio) |>
  summarise(cep26 = sum(ivan, na.rm = TRUE),
            der26 = sum(abelardo + gustavo, na.rm = TRUE),
            val26 = sum(total_votos_urna - votos_nulos - votos_no_marcados, na.rm = TRUE),
            puestos = n_distinct(paste(zona, puesto)), .groups = "drop")

cat("Leyendo georreferenciacion de puestos...\n")
geo <- jsonlite::fromJSON("datos/crudos/puestos_georef.json") |>
  mutate(depto_k = key(departamento), municipio_k = key(municipio),
         latitud = as.numeric(latitud), longitud = as.numeric(longitud)) |>
  filter(!is.na(latitud), !is.na(longitud),
         dplyr::between(latitud, -5, 15),
         dplyr::between(longitud, -82, -66)) |>
  group_by(depto_k, municipio_k) |>
  summarise(lat = median(latitud, na.rm = TRUE), lon = median(longitud, na.rm = TRUE),
            puestos_geo = n(), .groups = "drop")

cat("Extrayendo edad municipal DANE 2026...\n")
raw <- read_excel("datos/crudos/dane_municipal_edad.xlsx",
  sheet = 3, col_names = FALSE,
  guess_max = 50000, .name_repair = "minimal")
hdr <- as.character(unlist(raw[7, ]))
nm <- ifelse(is.na(hdr) | hdr == "", paste0("c", seq_along(hdr)), hdr)
ed <- raw[-(1:7), ]
names(ed) <- make.unique(nm)
names(ed)[1:6] <- c("dp", "dpnom", "cod", "municipio", "anio", "area")
ed$anio <- suppressWarnings(as.numeric(ed$anio))
ed <- ed |> filter(anio == 2026, str_detect(area, "Total"))
agecols <- names(ed)[str_detect(names(ed), regex("hombres|mujeres", ignore_case = TRUE)) &
                       str_detect(names(ed), "[0-9]")]
edad <- as.integer(str_extract(agecols, "[0-9]+"))
sexo <- ifelse(str_detect(agecols, regex("hombres", ignore_case = TRUE)), "Hombres", "Mujeres")
M <- matrix(suppressWarnings(as.numeric(as.matrix(ed[agecols]))), nrow = nrow(ed))
M[is.na(M)] <- 0
edad_mun <- tibble(
  depto_k = dept_alias(key(ed$dpnom)),
  municipio_k = mun_alias(key(ed$municipio)),
  pob18 = rowSums(M[, edad >= 18, drop = FALSE]),
  j1828 = rowSums(M[, edad >= 18 & edad <= 28, drop = FALSE]),
  muj18 = rowSums(M[, edad >= 18 & sexo == "Mujeres", drop = FALSE]),
  v65 = rowSums(M[, edad >= 65, drop = FALSE])
) |>
  mutate(pct_18_28 = round(100 * j1828 / pob18, 1),
         pct_65mas = round(100 * v65 / pob18, 1),
         pct_mujeres = round(100 * muj18 / pob18, 1)) |>
  select(depto_k, municipio_k, pct_18_28, pct_65mas, pct_mujeres, pob18)

estado_de <- function(margen) ifelse(margen >= .05, "ganada", ifelse(margen >= -.05, "disputa", "adversa"))
tipo_edad <- function(j) ifelse(is.na(j), "sin edad", ifelse(j >= 27, "joven", ifelse(j <= 21, "adulta", "mixta")))

cat("Integrando municipios...\n")
mun <- p26 |>
  inner_join(v22, by = c("dep", "mun")) |>
  left_join(v2v, by = c("dep", "mun")) |>
  left_join(xwalk, by = c("dep", "mun")) |>
  mutate(depto_k2 = depto_k, municipio_k2 = municipio_k) |>
  left_join(geo, by = c("depto_k", "municipio_k")) |>
  left_join(edad_mun, by = c("depto_k" = "depto_k", "municipio_k" = "municipio_k")) |>
  mutate(cepeda = cep26 / val26, derecha = der26 / val26, petro22 = izq22 / val22,
         swing = cepeda - petro22,
         petro2v = ifelse(!is.na(val2v) & val2v > 0, izq2v / val2v, NA_real_),
         crecimiento22 = petro2v - petro22,
         margen = cepeda - derecha,
         estado = estado_de(margen),
         edad_tipo = tipo_edad(pct_18_28),
         slug = paste0(dep, "-", mun),
         municipio = label_name(municipio),
         depto = label_depto(depto)) |>
  filter(val26 > 0, val22 > 0) |>
  arrange(desc(val26))

top_young <- mun |> arrange(desc(pct_18_28)) |> slice_head(n = 20)
top_adult <- mun |> arrange(desc(pct_65mas)) |> slice_head(n = 20)
top_recover <- mun |> filter(cepeda >= .35, cepeda <= .56, swing < 0) |> arrange(swing, desc(val26)) |> slice_head(n = 30)
top_mobilize <- mun |> filter(cepeda >= .50) |> arrange(desc(cep26)) |> slice_head(n = 30)
top_dispute <- mun |> filter(abs(margen) <= .05) |> arrange(desc(val26)) |> slice_head(n = 30)

make_text <- function(r) {
  unidad <- "municipio"
  base <- sprintf("%s (%s) tiene Cepeda en %s y la derecha en %s. Frente a Petro 2022 (%s), la izquierda %s %s.",
    r$municipio, r$depto, pct(r$cepeda), pct(r$derecha), pct(r$petro22),
    ifelse(r$swing < 0, "cayo", "subio"), pts(r$swing))
  accion <- if (r$estado == "ganada") {
    "Prioridad: movilizar y cuidar participacion. Es territorio favorable; el reto es sacar voto y no confiarse."
  } else if (r$estado == "disputa") {
    "Prioridad: persuadir y movilizar al mismo tiempo. Una mejora pequena puede cambiar el resultado municipal."
  } else {
    "Prioridad: focalizar. No dispersar recursos: proteger voto existente y buscar recortes donde haya volumen."
  }
  edad_txt <- if (!is.na(r$pct_18_28)) {
    sprintf(" Perfil etario: %s%% jovenes 18-28, %s%% mayores de 65. %s.",
      format(r$pct_18_28, decimal.mark = ","), format(r$pct_65mas, decimal.mark = ","),
      ifelse(r$pct_18_28 >= 27, "Conviene combinar territorio con pauta digital fuerte",
        ifelse(r$pct_65mas >= 18, "Conviene reforzar presencia territorial y mensajes de cuidado/economia", "Conviene equilibrio entre calle y redes")))
  } else " Sin dato etario municipal DANE enlazado."
  paste(base, accion, edad_txt)
}

detail <- mun |>
  rowwise() |>
  mutate(texto = make_text(pick(everything()))) |>
  ungroup() |>
  transmute(slug, municipio, depto, estado,
            cepeda = round(100 * cepeda, 1), derecha = round(100 * derecha, 1),
            petro22 = round(100 * petro22, 1), swing = round(100 * swing, 1),
            margen = round(100 * margen, 1),
            petro2v = round(100 * petro2v, 1), crecimiento22 = round(100 * crecimiento22, 1),
            votos_cepeda = round(cep26), votos_derecha = round(der26), votos_total = round(val26),
            puestos, lat = round(lat, 5), lon = round(lon, 5),
            pct_18_28, pct_65mas, pct_mujeres, pob18, edad_tipo, texto)

idx <- detail |>
  select(slug, municipio, depto, estado, cepeda, derecha, swing, margen,
         votos_cepeda, votos_total, pct_18_28, pct_65mas, edad_tipo, lat, lon)

summary <- list(
  municipios = nrow(idx),
  votos_cepeda = sum(mun$cep26, na.rm = TRUE),
  votos_total = sum(mun$val26, na.rm = TRUE),
  cepeda = round(100 * sum(mun$cep26, na.rm = TRUE) / sum(mun$val26, na.rm = TRUE), 1),
  derecha = round(100 * sum(mun$der26, na.rm = TRUE) / sum(mun$val26, na.rm = TRUE), 1),
  joven_prom = round(weighted.mean(mun$pct_18_28, mun$val26, na.rm = TRUE), 1),
  mayor_prom = round(weighted.mean(mun$pct_65mas, mun$val26, na.rm = TRUE), 1)
)

payload <- list(
  generado = as.character(Sys.Date()),
  resumen = summary,
  municipios = idx,
  detalle = detail,
  rankings = list(
    jovenes = top_young |> transmute(slug = paste0(dep, "-", mun), municipio, depto, pct_18_28, cepeda = round(100 * cepeda, 1), votos_total = round(val26)),
    mayores = top_adult |> transmute(slug = paste0(dep, "-", mun), municipio, depto, pct_65mas, cepeda = round(100 * cepeda, 1), votos_total = round(val26)),
    recuperar = top_recover |> transmute(slug = paste0(dep, "-", mun), municipio, depto, swing = round(100 * swing, 1), cepeda = round(100 * cepeda, 1), votos_total = round(val26)),
    movilizar = top_mobilize |> transmute(slug = paste0(dep, "-", mun), municipio, depto, cepeda = round(100 * cepeda, 1), votos_cepeda = round(cep26), votos_total = round(val26)),
    disputa = top_dispute |> transmute(slug = paste0(dep, "-", mun), municipio, depto, margen = round(100 * margen, 1), cepeda = round(100 * cepeda, 1), votos_total = round(val26))
  )
)

dir.create("webapp/municipios", recursive = TRUE, showWarnings = FALSE)
writeLines(paste0("window.MUNI_DATA=", toJSON(payload, auto_unbox = TRUE, dataframe = "rows", na = "null", pretty = FALSE), ";"),
  "webapp/municipios/data.js")
cat("Escrito webapp/municipios/data.js con", nrow(idx), "municipios\n")
