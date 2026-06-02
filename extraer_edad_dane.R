# Extrae % de población joven (18-28) y adulta (18+) por ciudad, 2026, del anexo DANE municipal.
suppressPackageStartupMessages({library(readxl); library(tidyverse)})
f <- "datos/crudos/dane_municipal_edad.xlsx"; SH <- "PobMunicipalxÁreaSexoEdad"
cat("leyendo hoja completa (puede tardar)...\n")
raw <- read_excel(f, sheet=SH, col_names=FALSE, guess_max=50000, .name_repair="minimal")
hdr <- as.character(unlist(raw[7, ]))                 # fila 7 del sheet = subencabezado con edades
nm  <- ifelse(is.na(hdr)|hdr=="", paste0("c", seq_along(hdr)), hdr)
d <- raw[-(1:7), ]                                    # datos desde la fila 8
names(d) <- make.unique(nm)
names(d)[1:6] <- c("dp","dpnom","cod","municipio","anio","area")
d$anio <- suppressWarnings(as.numeric(d$anio))
d$cod  <- formatC(suppressWarnings(as.integer(d$cod)), width=5, flag="0", format="d")

codes <- c(bogota="11001", medellin="05001", cali="76001", barranquilla="08001",
  cartagena="13001", cucuta="54001", bucaramanga="68001", ibague="73001",
  pereira="66001", santamarta="47001", villavicencio="50001", manizales="17001", pasto="52001")

cat("areas únicas:", paste(unique(d$area), collapse=" | "), "\n")
d26 <- d |> filter(anio==2026, str_detect(area,"Total"), cod %in% codes)
cat("nrow d26:", nrow(d26), " cods:", paste(d26$cod, collapse=","), "\n")
cat("nombres 7-15:", paste(names(d)[7:15], collapse=" || "), "\n")
agecols <- names(d26)[str_detect(names(d26), regex("hombres|mujeres", ignore_case=TRUE)) &
                      str_detect(names(d26), "[0-9]")]
cat("agecols:", length(agecols), "\n")
edad <- as.integer(str_extract(agecols, "[0-9]+"))
sexo <- ifelse(str_detect(agecols, regex("hombres", ignore_case=TRUE)), "Hombres", "Mujeres")
M <- matrix(suppressWarnings(as.numeric(as.matrix(d26[agecols]))), nrow=nrow(d26))
M[is.na(M)] <- 0

out <- tibble(cod=d26$cod, municipio=d26$municipio,
  pob18 = rowSums(M[, edad>=18, drop=FALSE]),
  j1828 = rowSums(M[, edad>=18 & edad<=28, drop=FALSE]),
  muj18 = rowSums(M[, edad>=18 & sexo=="Mujeres", drop=FALSE]),
  v65   = rowSums(M[, edad>=65, drop=FALSE])) |>
  mutate(slug=names(codes)[match(cod,codes)],
         pct_18_28=round(100*j1828/pob18,1),
         pct_65mas=round(100*v65/pob18,1),
         pct_mujeres=round(100*muj18/pob18,1)) |>
  select(slug, municipio, pct_18_28, pct_65mas, pct_mujeres) |> arrange(desc(pct_18_28))
print(as.data.frame(out))
write_csv(out, "datos/crudos/edad_municipal.csv")
cat("\nGuardado datos/crudos/edad_municipal.csv\n")
