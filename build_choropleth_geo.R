# Une polígonos de municipios (geoBoundaries ADM2, WGS84) con los datos del
# tablero nacional por CRUCE ESPACIAL (cada municipio tiene lat/lon -> punto dentro
# del polígono). Exporta regiones-y-exterior/municipios.geojson para el choropleth.
suppressPackageStartupMessages({library(sf); library(tidyverse)})
sf::sf_use_s2(FALSE)

# polígonos oficiales (WGS84 lon/lat)
poly <- st_read("datos/geo/co_adm2.geojson", quiet=TRUE) |> st_make_valid() |>
  mutate(pid = row_number()) |> select(pid, shapeName)
cat("Polígonos:", nrow(poly), " | bbox:", paste(round(st_bbox(poly),2), collapse=" "), "\n")

# datos del tablero (con lat/lon por municipio)
s <- paste(readLines("webapp/regiones-y-exterior/data.js"), collapse="")
j <- jsonlite::fromJSON(substr(s, regexpr("[{]", s)[1], tail(gregexpr("[}]", s)[[1]],1)), simplifyVector=TRUE)
dat <- j$municipios |> as_tibble() |>
  filter(depto != "Exterior", !is.na(lat), !is.na(lon)) |>
  transmute(slug, municipio, depto, estado, cepeda, swing, votos=votos_total, lat, lon)
pts <- st_as_sf(dat, coords=c("lon","lat"), crs=4326)

# cada punto -> polígono que lo contiene (si no, el más cercano)
within <- st_join(pts, poly, join=st_within)
faltan <- is.na(within$pid)
if (any(faltan)) {
  nn <- st_nearest_feature(pts[faltan,], poly)
  within$pid[faltan] <- poly$pid[nn]
}
cat("Municipios con polígono:", sum(!is.na(within$pid)), "de", nrow(dat), "\n")

# adjuntar geometría del polígono a cada municipio (1 polígono por municipio)
asign <- within |> st_drop_geometry() |> select(pid, slug, municipio, depto, estado, cepeda, swing, votos) |>
  filter(!is.na(pid)) |> distinct(slug, .keep_all=TRUE)
out <- poly |> inner_join(asign, by="pid") |>
  select(slug, municipio, depto, estado, cepeda, swing, votos) |>
  st_simplify(dTolerance = 0.004, preserveTopology = TRUE)

dsn <- "webapp/regiones-y-exterior/municipios.geojson"
suppressWarnings(st_write(out, dsn, quiet=TRUE, delete_dsn=TRUE, layer_options="COORDINATE_PRECISION=4"))
cat("Escrito", dsn, "(", round(file.size(dsn)/1024), "KB ) con", nrow(out), "municipios\n")
cat("bbox salida:", paste(round(st_bbox(out),2), collapse=" "), " (Colombia ~ -79 -4 -67 13)\n")
