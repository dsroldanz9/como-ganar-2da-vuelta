# Une los polígonos de municipios (TopoJSON) con los datos del tablero nacional
# y exporta regiones-y-exterior/municipios.geojson (para el choropleth).
suppressPackageStartupMessages({library(sf); library(tidyverse)})
sf::sf_use_s2(FALSE)
norm <- function(x) toupper(stringi::stri_trans_general(as.character(x), "Latin-ASCII")) |> str_squish()
deptkey <- function(x){ k <- norm(x)
  k <- gsub("VALLE DEL CAUCA", "VALLE", k)
  k <- ifelse(grepl("BOGOTA", k), "BOGOTA", k)
  k <- ifelse(grepl("SAN ANDRES", k), "SAN ANDRES", k)
  str_squish(k) }
namekey <- function(x) gsub("[^A-Z0-9 ]", " ", norm(x)) |> str_squish()

# polígonos
geo <- st_read("datos/geo/co_municipios.topojson", quiet=TRUE) |> st_make_valid()
st_crs(geo) <- 4326
geo <- geo |> mutate(dk = deptkey(dpt), nk = namekey(name))

# datos del tablero
s <- paste(readLines("webapp/regiones-y-exterior/data.js"), collapse="")
j <- jsonlite::fromJSON(substr(s, regexpr("[{]", s)[1], tail(gregexpr("[}]", s)[[1]],1)), simplifyVector=TRUE)
dat <- j$municipios |> as_tibble() |>
  filter(depto != "Exterior") |>
  transmute(slug, municipio, depto, estado, cepeda, swing, votos=votos_total,
            dk = deptkey(depto), nk = namekey(municipio))

# join polígono <- dato (por dept+nombre)
m <- geo |> left_join(dat, by = c("dk","nk"))
cat("Polígonos:", nrow(geo), " | con dato:", sum(!is.na(m$slug)),
    sprintf("(%.0f%%)\n", 100*mean(!is.na(m$slug))))
cat("Datos sin polígono:", sum(!(dat$slug %in% m$slug)), "de", nrow(dat), "\n")

out <- m |> filter(!is.na(slug)) |>
  transmute(slug, municipio, depto, estado, cepeda, swing, votos) |>
  st_simplify(dTolerance = 0.008, preserveTopology = TRUE)

dsn <- "webapp/regiones-y-exterior/municipios.geojson"
suppressWarnings(st_write(out, dsn, quiet=TRUE, delete_dsn=TRUE,
  layer_options = "COORDINATE_PRECISION=4"))
cat("Escrito", dsn, "(", round(file.size(dsn)/1024), "KB ) con", nrow(out), "municipios\n")
