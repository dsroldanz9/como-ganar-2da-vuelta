# =====================================================================
# build_data.R  — Motor de datos de la "Caja de Herramientas"
# Calcula, para las 13 capitales, el swing 2022->2026 por puesto de votación,
# dónde se perdió, fortines y un TEXTO automático de recomendación.
# Exporta webapp/data.js (window.APP_DATA) para el sitio estático.
# =====================================================================
source("R/01_funciones.R")
suppressPackageStartupMessages({library(tidyverse); library(jsonlite); library(sf)})
sf::sf_use_s2(FALSE)
GEO_OUT <- list()   # choropleth por comuna (geojson) por ciudad
norm <- function(x) toupper(stringi::stri_trans_general(as.character(x),"Latin-ASCII"))
key  <- function(x) str_squish(str_replace_all(norm(x), "[^A-Z0-9 ]", " "))
PREF <- "\\b(IE|INST|INSTITUTO|INSTITUCION|EDUCATIVO|EDUCATIVA|ESCUELA|ESC|COLEGIO|COL|CENTRO|CTRO|HOGAR|JARDIN|IES|GIMNASIO|LICEO|UNIDAD|SEDE|DISTRITAL|DEPARTAMENTAL|MUNICIPAL|RURAL|URBANA|URBANO|MIXTA|SECCION|SEC|PRINCIPAL)\\b"
core <- function(x){ k <- str_remove_all(key(x), PREF)
  vapply(str_split(str_squish(k), " "), function(t){ t <- t[nchar(t)>=3 | grepl("[0-9]",t)]
    paste(sort(unique(t)), collapse=" ") }, character(1)) }
PRECONTEO <- list.files(".", pattern="^PRECONTEO_REGIS_.*\\.csv$")[1]

# georreferenciación nacional de puestos (coordenadas + comuna) — Datos Abiertos
GEO <- jsonlite::fromJSON("datos/crudos/puestos_georef.json") |>
  dplyr::mutate(mk=norm(municipio), dk=norm(departamento), pk=key(puesto), pk2=core(puesto),
                latitud=as.numeric(latitud), longitud=as.numeric(longitud),
                comuna_lbl=str_to_title(str_squish(str_replace(comuna, "^[0-9]+", " "))),
                comuna_lbl=str_replace(comuna_lbl, "^Localidad +[0-9]+ +", ""))

# perfil etario municipal (DANE 2026) — generado por webapp/extraer_edad_dane.R
EDADM <- if(file.exists("datos/crudos/edad_municipal.csv"))
  readr::read_csv("datos/crudos/edad_municipal.csv", show_col_types=FALSE) else NULL

# ---- 1) 2022 nacional: crosswalk de nombres + voto izq/der por puesto ----
m22 <- readr::read_delim("datos/crudos/MMV_NACIONAL_PRESIDENTE_2022_1v.csv", delim=";",
          locale=locale(encoding="latin1"), col_types=cols(.default="c"), show_col_types=FALSE)
names(m22) <- toupper(names(m22))
m22 <- m22 |>
  mutate(cod_puesto = paste0(DEP,MUN,ZONA,PUESTO),
         votos=as.numeric(VOTOS), cn=norm(CANNOMBRE),
         tipo=case_when(str_detect(cn,"NULO|NO MARCAD")~"nv",
                        str_detect(cn,"PETRO")~"izq",
                        str_detect(cn,"GUTIERREZ|HERNANDEZ")~"der", TRUE~"ov"))
xwalk <- m22 |> distinct(DEP,MUN,DEPNOMBRE,MUNNOMBRE) |>
  mutate(dep=DEP, mun=MUN, depn=norm(DEPNOMBRE), munn=norm(MUNNOMBRE))
pnom <- m22 |> distinct(cod_puesto, PUESNOMBRE) |> rename(puesto_nom=PUESNOMBRE)
v22 <- m22 |> group_by(dep=DEP, mun=MUN, cod_puesto) |>
  summarise(izq22=sum(votos[tipo=="izq"]), val22=sum(votos[tipo!="nv"]), .groups="drop")

# 2022 SEGUNDA vuelta (para "cómo se ganó hace 4 años")
m2v <- readr::read_delim("datos/crudos/MMV_NACIONAL_PRESIDENTE_2022_2v.csv", delim=";",
          locale=locale(encoding="latin1"), col_types=cols(.default="c"), show_col_types=FALSE)
names(m2v) <- toupper(names(m2v))
v2v <- m2v |> mutate(votos=as.numeric(VOTOS), cn=norm(CANNOMBRE),
          tipo=case_when(str_detect(cn,"NULO|NO MARCAD")~"nv", str_detect(cn,"PETRO")~"izq", TRUE~"ov")) |>
  group_by(dep=DEP, mun=MUN) |>
  summarise(izq2v=sum(votos[tipo=="izq"]), val2v=sum(votos[tipo!="nv"]), .groups="drop")

# ---- 2) 2026 nacional por puesto (mapeo verificado de columnas) ----
p26 <- read_csv(PRECONTEO, col_types=cols(.default="c"), show_col_types=FALSE) |>
  mutate(across(c(ivan,abelardo,gustavo,votos_nulos,votos_no_marcados,total_votos_urna), as.numeric),
         cod_puesto=paste0(cod_departamento,cod_municipio,zona,puesto)) |>
  group_by(dep=cod_departamento, mun=cod_municipio, cod_puesto) |>
  summarise(cep26=sum(ivan), der26=sum(abelardo+gustavo),
            val26=sum(total_votos_urna-votos_nulos-votos_no_marcados), .groups="drop")

# ---- 3) Definir 13 capitales (nombre, depto, coords) ----
caps <- tribble(
  ~slug,~ciudad,~depn,~lat,~lon,
  "bogota","Bogotá","BOGOTA",4.61,-74.08,
  "medellin","Medellín","ANTIOQUIA",6.25,-75.57,
  "cali","Cali","VALLE",3.44,-76.52,
  "barranquilla","Barranquilla","ATLANTICO",10.96,-74.80,
  "cartagena","Cartagena","BOLIVAR",10.39,-75.51,
  "cucuta","Cúcuta","NORTE DE SAN",7.89,-72.50,
  "bucaramanga","Bucaramanga","SANTANDER",7.12,-73.12,
  "ibague","Ibagué","TOLIMA",4.44,-75.23,
  "pereira","Pereira","RISARALDA",4.81,-75.69,
  "santamarta","Santa Marta","MAGDALENA",11.24,-74.20,
  "villavicencio","Villavicencio","META",4.14,-73.63,
  "manizales","Manizales","CALDAS",5.07,-75.52,
  "pasto","Pasto","NARIÑO",1.21,-77.28)

# patrón de nombre de municipio capital (para emparejar munn)
patron <- c(bogota="BOGOTA", medellin="MEDELLIN", cali="CALI", barranquilla="BARRANQUILLA",
  cartagena="CARTAGENA", cucuta="CUCUTA", bucaramanga="BUCARAMANGA", ibague="IBAGUE",
  pereira="PEREIRA", santamarta="SANTA MARTA", villavicencio="VILLAVICENCIO",
  manizales="MANIZALES", pasto="PASTO")

# resolver (dep,mun) de cada capital: el match con mayor electorado 2026
resolver <- function(slug){
  dn <- norm(caps$depn[caps$slug==slug]); pt <- patron[[slug]]
  cand <- xwalk |> filter(str_detect(depn, fixed(dn)), str_detect(munn, pt))
  if(nrow(cand)==0) return(NULL)
  cand |> left_join(v22 |> group_by(dep,mun) |> summarise(v=sum(val22),.groups="drop"), by=c("dep","mun")) |>
    arrange(desc(v)) |> slice(1)
}

# ---- 4) función de análisis + texto por ciudad ----
fmt <- function(x) format(round(x), big.mark=".", decimal.mark=",")
pct <- function(x) paste0(format(round(100*x,1), decimal.mark=","),"%")
pts <- function(x) paste0(ifelse(x>=0,"+",""), format(round(x,1), decimal.mark=","), " pts")

analizar <- function(slug){
  r <- resolver(slug); if(is.null(r)) return(NULL)
  d <- r$dep; mu <- r$mun
  a26 <- p26 |> filter(dep==d, mun==mu)
  a22 <- v22 |> filter(dep==d, mun==mu)
  pu <- a26 |> inner_join(a22, by=c("dep","mun","cod_puesto")) |>
    left_join(pnom, by="cod_puesto") |>
    mutate(izq22p=izq22/val22, izq26p=cep26/val26, swing=izq26p-izq22p,
           votos_perdidos = pmax(0, izq22p-izq26p)*val26)
  if(nrow(pu)<3) return(NULL)
  # coordenadas + comuna por puesto (join por nombre dentro del municipio)
  gm <- GEO |> filter(str_detect(mk, patron[[slug]]),
                      str_detect(dk, norm(caps$depn[caps$slug==slug])))
  xy1 <- gm |> group_by(pk)  |> slice(1) |> ungroup() |> select(pk, comuna_lbl, latitud, longitud)
  xy2 <- gm |> filter(pk2!="") |> group_by(pk2) |> slice(1) |> ungroup() |>
    select(pk2, c2=comuna_lbl, la2=latitud, lo2=longitud)
  pu <- pu |> mutate(pk=key(puesto_nom), pk2=core(puesto_nom)) |>
    left_join(xy1, by="pk") |> left_join(xy2, by="pk2") |>
    mutate(comuna_lbl=coalesce(comuna_lbl, c2), latitud=coalesce(latitud, la2),
           longitud=coalesce(longitud, lo2)) |>
    select(-c2, -la2, -lo2, -pk2)
  cep <- sum(pu$cep26)/sum(pu$val26); pet <- sum(pu$izq22)/sum(pu$val22)
  sw <- cep-pet; der <- sum(pu$der26)/sum(pu$val26)
  ciu <- caps$ciudad[caps$slug==slug]

  # --- 2022 segunda vuelta (cómo se ganó / consolidó) ---
  a2v <- v2v |> filter(dep==d, mun==mu)
  pet2 <- if(nrow(a2v)>0 && sum(a2v$val2v)>0) sum(a2v$izq2v)/sum(a2v$val2v) else NA
  crec22 <- if(!is.na(pet2)) pet2-pet else NA
  ganados22 <- if(!is.na(pet2)) round(sum(a2v$izq2v) - sum(pu$izq22)) else NA

  unidad  <- if(slug=="bogota") "localidades" else "comunas"; unidadS <- if(slug=="bogota") "localidad" else "comuna"
  # --- AGREGACIÓN POR COMUNA/LOCALIDAD (la unidad que la gente reconoce) ---
  comT <- pu |> filter(!is.na(comuna_lbl), comuna_lbl!="") |>
    group_by(comuna=comuna_lbl) |>
    summarise(c26=sum(cep26), i22=sum(izq22), v26=sum(val26), v22=sum(val22), .groups="drop") |>
    mutate(apoyo=c26/v26, swing=apoyo - i22/v22, votos=round(c26), total=round(v26)) |>
    filter(v26 >= 200)
  mklist <- function(df) df |> transmute(comuna, apoyo=round(100*apoyo,1), swing=round(100*swing,1), votos, total) |>
    {\(x) pmap(x, function(comuna,apoyo,swing,votos,total) list(comuna=comuna,apoyo=apoyo,swing=swing,votos=votos,total=total))}()
  # tres listas de estrategia
  recuperarT  <- comT |> filter(apoyo>=.40, apoyo<=.56, swing < 0) |> arrange(swing) |> slice_head(n=6)   # competitivas que cayeron
  fortalecerT <- comT |> filter(apoyo>=.50) |> arrange(desc(votos)) |> slice_head(n=6)          # ganamos, mucho voto -> movilizar
  decisivasT  <- comT |> filter(apoyo>=.42, apoyo<=.58) |> arrange(desc(votos)) |> slice_head(n=6) # parejas y grandes
  comuna_fall <- comT |> arrange(swing) |> slice_head(n=10) |>
    transmute(comuna, swing=round(100*swing,1), votos, total) |>
    {\(x) pmap(x, function(comuna,swing,votos,total) list(comuna=comuna,swing=swing,votos=votos,total=total))}()
  topfall <- head(comT |> arrange(swing) |> pull(comuna), 3)
  nom_rec <- head(recuperarT$comuna,3); nom_for <- head(fortalecerT$comuna,3); nom_dec <- head(decisivasT$comuna,3)
  jn <- function(x) if(length(x)) paste(x, collapse=", ") else "—"

  margen <- cep - der
  estado <- if(margen >= .05) "ganada" else if(margen >= -.05) "disputa" else "adversa"

  diag <- sprintf("En %s, Cepeda obtuvo %s frente a %s del bloque de derecha (Abelardo + Paloma). Respecto a Petro 2022 (%s), la izquierda %s %s puntos. El análisis va por %s, no por puesto, para que sea accionable en territorio.",
                  ciu, pct(cep), pct(der), pct(pet), ifelse(sw<0,"cayó","subió"),
                  format(round(100*abs(sw),1), decimal.mark=","), unidad)
  donde <- sprintf("Frente a 2022, la caída se concentró en %s: %s. Ahí está el voto a recuperar.", unidad, jn(topfall))
  gano22 <- if(!is.na(pet2))
    sprintf("Hace 4 años Petro pasó de %s (1ª vuelta) a %s en la 2ª (%s, +%s votos en la ciudad). La remontada vino de movilizar el voto afín y sumar el centro: esa es la ruta a repetir.",
            pct(pet), pct(pet2), pts(100*crec22), fmt(ganados22))
  else "Sin dato de 2ª vuelta 2022 para esta ciudad."
  quehacer <- switch(estado,
    ganada =sprintf("Ciudad ganada (%s vs %s). MOVILIZAR: blindar y sacar el voto en %s (%s); recuperar donde más cayó (%s).", pct(cep), pct(der), unidad, jn(nom_for), jn(nom_rec)),
    disputa=sprintf("Ciudad EN DISPUTA (%s vs %s): aquí se define. Recuperar las %s que cayeron y son competitivas (%s) y exprimir la participación en los fortines (%s).", pct(cep), pct(der), unidad, jn(nom_rec), jn(nom_for)),
    adversa=sprintf("Ciudad adversa (%s vs %s). Blindar y movilizar los fortines (%s) y recortar en las %s decisivas (%s) sin dispersar recursos.", pct(cep), pct(der), jn(nom_for), unidad, jn(nom_dec)))
  publico <- switch(estado,
    ganada = sprintf("La tarea principal es participación: no basta con ganar la ciudad, hay que subir asistencia en %s donde ya existe voto afín (%s). La persuasión debe concentrarse en %s con caída reciente (%s), con mensaje de costo de vida, servicios públicos, empleo y seguridad cotidiana.",
                     unidad, jn(nom_for), unidad, jn(nom_rec)),
    disputa = sprintf("La ciudad está partida: aquí el esfuerzo debe combinar recuperación y movilización. En %s competitivas que cayeron (%s) conviene persuadir voto blando con empleo, costo de vida y seguridad; en los fortines (%s) la meta es operación electoral, testigos y recordación del día de votación.",
                      unidad, jn(nom_rec), jn(nom_for)),
    adversa = sprintf("La ciudad es cuesta arriba: la estrategia debe evitar dispersión. Primero proteger y sacar el voto existente en %s afines (%s); segundo recortar diferencia en %s decisivas (%s), donde una mejora pequeña mueve más votos que una campaña genérica en toda la ciudad.",
                      unidad, jn(nom_for), unidad, jn(nom_dec)))
  # --- ETARIO INTEGRAL (lectura territorial, orientada a estrategia) ---
  er <- if(!is.null(EDADM)) EDADM[EDADM$slug==slug, ] else NULL
  edad_joven <- NA; edad_mayor <- NA; edad_mujeres <- NA; etario_txt <- NA
  if(!is.null(er) && nrow(er)==1){
    edad_joven <- er$pct_18_28[1]; edad_mayor <- er$pct_65mas[1]; edad_mujeres <- er$pct_mujeres[1]
    perfil <- if(edad_joven>=25) "una ciudad joven" else if(edad_joven<=22) "una ciudad con población comparativamente más adulta" else "una ciudad con perfil etario mixto"
    bog_extra <- if(slug=="bogota") " En Bogotá lo confirmamos con datos: a más jóvenes en una localidad, más voto por Cepeda (correlación +0,65); la población mayor y de estratos altos del norte se inclina a la derecha." else ""
    etario_txt <- sprintf("%s es %s: el %s%% tiene 18–28 años, el %s%% 65 o más y el %s%% son mujeres (DANE 2026). Como el voto es secreto, no hay 'voto por edad', pero el patrón territorial es consistente: las zonas más jóvenes votan más a la izquierda y las más envejecidas a la derecha.%s Estrategia: en las %s afines y jóvenes, movilizar con pauta digital (TikTok, Instagram), universidades y SENA; en las %s competidas o decisivas (%s), persuadir con empleo, costo de vida y seguridad; con la población mayor, no dispersar recursos.",
      ciu, perfil,
      format(edad_joven, decimal.mark=","), format(edad_mayor, decimal.mark=","), format(edad_mujeres, decimal.mark=","),
      bog_extra, unidad, unidad, jn(nom_dec))
    publico <- paste0(publico, sprintf(" Lectura etaria: %s%% jóvenes 18–28; %s.",
               format(edad_joven, decimal.mark=","),
               if(edad_joven>=25) "fuerte apuesta digital" else if(edad_joven<=22) "combinar territorio y medios con lo digital" else "equilibrio calle/redes"))
  }

  # --- choropleth por comuna (Voronoi de puestos disuelto por comuna) ---
  thumb <- NA
  ptsf <- pu |> filter(!is.na(latitud), !is.na(longitud), !is.na(comuna_lbl), comuna_lbl!="") |>
    distinct(longitud, latitud, .keep_all=TRUE)
  if(nrow(ptsf) >= 10 && n_distinct(ptsf$comuna_lbl) >= 2){
    sfp <- st_as_sf(ptsf, coords=c("longitud","latitud"), crs=4326)
    vor <- st_collection_extract(st_voronoi(st_union(sfp)), "POLYGON") |> st_sf(geometry=_) |> st_set_crs(4326)
    vor <- st_join(vor, sfp["comuna_lbl"], join=st_intersects, left=FALSE)
    hull <- st_buffer(st_convex_hull(st_union(sfp)), 0.004)
    vor <- suppressWarnings(st_intersection(vor, hull))
    com <- vor |> group_by(comuna_lbl) |> summarise(.groups="drop") |>
      st_simplify(dTolerance=0.0006, preserveTopology=TRUE)
    stats <- pu |> filter(!is.na(comuna_lbl), comuna_lbl!="") |> group_by(comuna_lbl) |>
      summarise(swing=round(100*(sum(cep26)/sum(val26)-sum(izq22)/sum(val22)),1),
                apoyo=round(100*sum(cep26)/sum(val26),1), votos=round(sum(cep26)),
                total=round(sum(val26)), .groups="drop")
    com <- com |> left_join(stats, by="comuna_lbl") |> rename(comuna=comuna_lbl)
    tmpf <- tempfile(fileext=".geojson")
    suppressWarnings(st_write(com, tmpf, quiet=TRUE, delete_dsn=TRUE))
    GEO_OUT[[slug]] <<- paste(readLines(tmpf, warn=FALSE), collapse="")
    unlink(tmpf)
    # miniatura (mapa por comuna) para la tarjeta del landing
    dir.create("webapp/img/maps", showWarnings=FALSE, recursive=TRUE)
    th <- ggplot2::ggplot(com) +
      ggplot2::geom_sf(ggplot2::aes(fill=swing), color="white", linewidth=.12) +
      ggplot2::scale_fill_gradient2(low="#F4501E", mid="#eef0fb", high="#2B37D6", midpoint=0, guide="none") +
      ggplot2::theme_void() + ggplot2::theme(plot.margin=ggplot2::margin(2,2,2,2))
    suppressWarnings(ggplot2::ggsave(sprintf("webapp/img/maps/%s.png", slug), th, width=3.4, height=3, dpi=80, bg="white"))
    thumb <- sprintf("img/maps/%s.png", slug)
  }

  # puntos georreferenciados (para el mapa interactivo de la ciudad)
  puntos <- pu |> filter(!is.na(latitud), !is.na(longitud)) |>
    transmute(lat=round(latitud,5), lon=round(longitud,5), sw=round(100*swing,1),
              v=round(cep26), ap=round(100*izq26p), n=str_to_title(tolower(puesto_nom))) |>
    {\(x) pmap(x, function(lat,lon,sw,v,ap,n) list(lat=lat,lon=lon,sw=sw,v=v,ap=ap,n=n))}()
  list(slug=slug, ciudad=ciu, depto=r$DEPNOMBRE |> str_to_title(), unidad=unidadS, thumb=thumb,
       puntos=puntos, n_geo=length(puntos),
       comuna_fall=comuna_fall, recuperar=mklist(recuperarT), fortalecer=mklist(fortalecerT), decisivas=mklist(decisivasT),
       edad_joven=edad_joven, edad_mayor=edad_mayor, edad_mujeres=edad_mujeres,
       lat=caps$lat[caps$slug==slug], lon=caps$lon[caps$slug==slug],
       estado=estado, cepeda=round(100*cep,1), derecha=round(100*der,1),
       petro22=round(100*pet,1), swing=round(100*sw,1),
       petro2v=if(!is.na(pet2)) round(100*pet2,1) else NA,
       crecimiento22=if(!is.na(crec22)) round(100*crec22,1) else NA,
       ganados22=ganados22,
       votos_cepeda=round(sum(pu$cep26)), votos_total=round(sum(pu$val26)),
       n_puestos=nrow(pu),
       galeria=if(slug=="bogota") list(
         list(t="Apoyo a Cepeda por localidad", img="img/mapa_apoyo_real.png",
              a="La izquierda gana todo el sur y suroccidente (Usme, Ciudad Bolívar, Bosa, San Cristóbal, Rafael Uribe) y pierde en el norte (Usaquén, Chapinero, Suba). La franja media —Kennedy, Engativá, Fontibón— concentra muchísimos votos y está en disputa."),
         list(t="Dónde se perdieron votos vs 2022", img="img/mapa_swing_real.png",
              a="La caída no fue pareja: golpeó más fuerte en localidades de clase media (estrato 3): Antonio Nariño (-7,0), Puente Aranda (-6,7), Tunjuelito (-6,5), Fontibón (-6,3), Engativá (-6,2) y Kennedy (-5,7). Esas son las zonas a recuperar."),
         list(t="El voto según el estrato", img="img/grafico_estrato.png",
              a="El apoyo a la izquierda baja a medida que sube el estrato, y el mayor retroceso frente a 2022 ocurrió en la clase media. En estratos 1 y 2 hay que MOVILIZAR; el estrato 3 es el terreno a persuadir."),
         list(t="Caída por UPZ (barrios)", img="img/mapa_upz_swing.png",
              a="Al bajar a UPZ se ve el detalle barrio a barrio: las mayores caídas se concentran en UPZ de estrato medio del occidente y centro, que son el objetivo fino de la campaña territorial."),
         list(t="A qué público: edad", img="img/grafico_edad_voto.png",
              a="A mayor proporción de jóvenes (18-28) en la localidad, mayor voto por Cepeda (correlación +0,65). Los jóvenes son el motor del voto afín: prioridad de redes y entornos educativos."),
         list(t="La remontada de 2022 (1ª→2ª vuelta)", img="img/grafico_rondas_2022.png",
              a="Hace 4 años Petro creció +11,5 puntos entre la primera y la segunda vuelta en Bogotá y ganó con holgura. Esa consolidación —centro + movilización— es la ruta a repetir el 21 de junio.")) else list(),
       texto=list(diagnostico=diag, donde=donde, gano22=gano22, quehacer=quehacer, publico=publico, etario=etario_txt))
}

res <- map(caps$slug, analizar) |> compact()
names(res) <- map_chr(res, "slug")
cat("Ciudades procesadas:", length(res), "\n")
for(c in res) cat(sprintf("  %-14s Cepeda %4.1f%%  swing %+.1f  (%s puestos)\n",
                          c$ciudad, c$cepeda, c$swing, c$n_puestos))

# index liviano para el mapa
idx <- map(res, \(c) c[c("slug","ciudad","depto","lat","lon","estado","cepeda","derecha","swing","votos_cepeda","votos_total","edad_joven","thumb")])
payload <- list(generado=as.character(Sys.Date()), ciudades=unname(idx), detalle=res)
js <- paste0("window.APP_DATA=", toJSON(payload, auto_unbox=TRUE, pretty=FALSE), ";")
writeLines(js, "webapp/data.js")
cat("\nEscrito webapp/data.js (", round(file.size('webapp/data.js')/1024), "KB )\n")

# choropleth por comuna -> geo.js
geo_js <- paste0("window.APP_GEO={",
  paste(sprintf('"%s":%s', names(GEO_OUT), GEO_OUT), collapse=","), "};")
writeLines(geo_js, "webapp/geo.js")
cat("Escrito webapp/geo.js (", round(file.size('webapp/geo.js')/1024), "KB ) con",
    length(GEO_OUT), "ciudades con choropleth\n")
