# =====================================================================
# build_municipios_v2.R  — PILOTO Cundinamarca
# Genera datos por municipio con mapa de puntos (puestos), comuna donde
# exista y perfil etario DANE, sin tocar la versión publicada.
# Salida: webapp/cundinamarca/data.js  (window.MUN_DATA)
# =====================================================================
source("R/01_funciones.R")
suppressPackageStartupMessages({library(tidyverse); library(jsonlite); library(readxl)})
norm <- function(x) toupper(stringi::stri_trans_general(as.character(x),"Latin-ASCII"))
key  <- function(x) str_squish(str_replace_all(norm(x), "[^A-Z0-9 ]", " "))
slugify <- function(x) str_replace_all(str_to_lower(norm(x)), "[^a-z0-9]+", "-") |> str_replace_all("^-|-$","")
DEPTO <- "CUNDINAMARCA"; DANE_DP <- "25"

# ---- 1) 2022 por puesto (Cundinamarca) ----
m22 <- readr::read_delim("datos/crudos/MMV_NACIONAL_PRESIDENTE_2022_1v.csv", delim=";",
        locale=locale(encoding="latin1"), col_types=cols(.default="c"), show_col_types=FALSE)
names(m22) <- toupper(names(m22))
pu22 <- m22 |> filter(norm(DEPNOMBRE)==DEPTO) |>
  mutate(cod=paste0(DEP,MUN,ZONA,PUESTO), votos=as.numeric(VOTOS), cn=norm(CANNOMBRE),
         tipo=case_when(str_detect(cn,"NULO|NO MARCAD")~"nv", str_detect(cn,"PETRO")~"izq",
                        str_detect(cn,"GUTIERREZ|HERNANDEZ")~"der", TRUE~"ov")) |>
  group_by(MUNNOMBRE, cod, PUESNOMBRE) |>
  summarise(izq22=sum(votos[tipo=="izq"]), val22=sum(votos[tipo!="nv"]), .groups="drop")

# ---- 2) 2026 por puesto (nacional, se cruza por código) ----
PRECONTEO <- list.files(".", pattern="^PRECONTEO_REGIS_.*\\.csv$")[1]
p26 <- read_csv(PRECONTEO, col_types=cols(.default="c"), show_col_types=FALSE) |>
  mutate(across(c(ivan,abelardo,gustavo,votos_nulos,votos_no_marcados,total_votos_urna), as.numeric),
         cod=paste0(cod_departamento,cod_municipio,zona,puesto)) |>
  group_by(cod) |>
  summarise(cep26=sum(ivan), der26=sum(abelardo+gustavo),
            val26=sum(total_votos_urna-votos_nulos-votos_no_marcados), .groups="drop")

pu <- pu22 |> inner_join(p26, by="cod") |>
  mutate(mk=norm(MUNNOMBRE), pk=key(PUESNOMBRE),
         izq22p=izq22/val22, izq26p=cep26/val26, swing=izq26p-izq22p)

# ---- 3) coordenadas + comuna (georef nacional, por nombre) ----
g <- jsonlite::fromJSON("datos/crudos/puestos_georef.json") |>
  mutate(mk=norm(municipio), pk=key(puesto)) |> group_by(mk,pk) |> slice(1) |> ungroup() |>
  transmute(mk, pk, lat=as.numeric(latitud), lon=as.numeric(longitud), comuna)
pu <- pu |> left_join(g, by=c("mk","pk"))
cat("Puestos Cundinamarca:", nrow(pu), " con coordenadas:", sum(!is.na(pu$lat)),
    sprintf("(%.0f%%)\n", 100*mean(!is.na(pu$lat))))

# ---- 4) etario DANE 2026 (Cundinamarca) por municipio ----
raw <- read_excel("datos/crudos/dane_municipal_edad.xlsx", sheet=3,
                  col_names=FALSE, guess_max=50000, .name_repair="minimal")
hdr <- as.character(unlist(raw[7,])); nm <- ifelse(is.na(hdr)|hdr=="", paste0("c",seq_along(hdr)), hdr)
dd <- raw[-(1:7),]; names(dd) <- make.unique(nm); names(dd)[1:6] <- c("dp","dpnom","cod","muni","anio","area")
dd$anio <- as.numeric(dd$anio); dd$dp <- formatC(as.integer(dd$dp), width=2, flag="0", format="d")
d26 <- dd |> filter(anio==2026, str_detect(area,"Total"), dp==DANE_DP)
ac <- names(d26)[str_detect(names(d26), regex("(hombres|mujeres) [0-9]+ a", ignore_case=TRUE))]
ed <- as.integer(str_extract(ac,"[0-9]+")); sx <- ifelse(str_detect(ac, regex("hombres",TRUE)),"H","M")
M <- matrix(suppressWarnings(as.numeric(as.matrix(d26[ac]))), nrow=nrow(d26)); M[is.na(M)]<-0
edad <- tibble(mk=norm(d26$muni),
  pob18=rowSums(M[, ed>=18, drop=FALSE]),
  j=rowSums(M[, ed>=18 & ed<=28, drop=FALSE]),
  mu=rowSums(M[, ed>=18 & sx=="M", drop=FALSE]),
  v65=rowSums(M[, ed>=65, drop=FALSE])) |>
  mutate(joven=round(100*j/pob18,1), mayor=round(100*v65/pob18,1), mujeres=round(100*mu/pob18,1)) |>
  select(mk, joven, mayor, mujeres)

# ---- 5) armar por municipio ----
pct <- function(x) paste0(format(round(100*x,1), decimal.mark=","),"%")
fmt <- function(x) format(round(x), big.mark=".", decimal.mark=",")
smean <- function(x){ m <- mean(x, na.rm=TRUE); if(is.nan(m)) NA_real_ else round(m,4) }
muni <- pu |> group_by(MUNNOMBRE) |> group_split()
build_one <- function(df){
  cep <- sum(df$cep26)/sum(df$val26); der <- sum(df$der26)/sum(df$val26); pet <- sum(df$izq22)/sum(df$val22)
  sw <- cep-pet; m <- df$MUNNOMBRE[1]; mk <- norm(m)
  estado <- if(cep-der>=.05) "ganada" else if(cep-der>=-.05) "disputa" else "adversa"
  pts_df <- df |> filter(!is.na(lat),!is.na(lon))
  puntos <- pts_df |> transmute(lat=round(lat,5), lon=round(lon,5), sw=round(100*swing,1),
              ap=round(100*izq26p), v=round(cep26), n=str_to_title(tolower(PUESNOMBRE))) |>
    {\(x) pmap(x, function(lat,lon,sw,ap,v,n) list(lat=lat,lon=lon,sw=sw,ap=ap,v=v,n=n))}()
  com <- df |> filter(!is.na(comuna), comuna!="") |> group_by(comuna) |>
    summarise(ap=round(100*sum(cep26)/sum(val26),1), sw=round(100*(sum(cep26)/sum(val26)-sum(izq22)/sum(val22)),1),
              v=round(sum(cep26)), .groups="drop") |> arrange(sw) |>
    {\(x) pmap(x, function(comuna,ap,sw,v) list(comuna=comuna,apoyo=ap,swing=sw,votos=v))}()
  e <- edad[edad$mk==mk,]
  ej <- if(nrow(e)==1) e$joven[1] else NA; em <- if(nrow(e)==1) e$mayor[1] else NA; emu <- if(nrow(e)==1) e$mujeres[1] else NA
  accion <- switch(estado,
    ganada=sprintf("Municipio ganado (%s vs %s). Movilizar el voto afín y blindar la participación.", pct(cep), pct(der)),
    disputa=sprintf("Municipio en disputa (%s vs %s): clave para la segunda vuelta. Recuperar donde cayó y movilizar a fondo.", pct(cep), pct(der)),
    adversa=sprintf("Municipio adverso (%s vs %s). Blindar los puestos afines y recortar diferencia sin dispersar recursos.", pct(cep), pct(der)))
  etario <- if(!is.na(ej)) sprintf(" Perfil etario (DANE 2026): %s%% jóvenes 18–28 y %s%% de 65 o más. %s",
    format(ej,decimal.mark=","), format(em,decimal.mark=","),
    if(ej>=27) "Municipio joven: redes y entornos educativos." else if(ej<=21) "Población más adulta: territorio y medios." else "Perfil mixto.") else ""
  list(slug=slugify(m), municipio=str_to_title(tolower(m)), estado=estado,
       cepeda=round(100*cep,1), derecha=round(100*der,1), swing=round(100*sw,1),
       votos_cepeda=round(sum(df$cep26)), votos_total=round(sum(df$val26)), n_puestos=n_distinct(df$cod),
       lat=smean(df$lat), lon=smean(df$lon),
       joven=ej, mayor=em, mujeres=emu, puntos=puntos, comunas=com,
       texto=paste0(sprintf("En %s, Cepeda obtuvo %s frente a %s del bloque de derecha. Respecto a Petro 2022 (%s) la izquierda %s %s. ",
              str_to_title(tolower(m)), pct(cep), pct(der), pct(pet), ifelse(sw<0,"cayó","subió"),
              gsub("-","",pct(abs(sw)))), accion, etario))
}
det <- lapply(muni, build_one)
names(det) <- sapply(det, \(x) x$slug)
cat("Municipios:", length(det), " con etario:", sum(sapply(det, \(x) !is.na(x$joven))), "\n")

idx <- lapply(det, \(c) c[c("slug","municipio","estado","cepeda","swing","votos_cepeda","joven","lat","lon")])
payload <- list(generado=as.character(Sys.Date()), depto="Cundinamarca", municipios=unname(idx), detalle=det)
dir.create("webapp/cundinamarca", showWarnings=FALSE, recursive=TRUE)
writeLines(paste0("window.MUN_DATA=", toJSON(payload, auto_unbox=TRUE, na="null"), ";"), "webapp/cundinamarca/data.js")
cat("Escrito webapp/cundinamarca/data.js (", round(file.size("webapp/cundinamarca/data.js")/1024), "KB )\n")
