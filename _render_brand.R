suppressPackageStartupMessages({library(pdftools); library(png)})
pdf <- Sys.glob("C:/Users/LENOVO/Downloads/*nea gr*Cepeda*2026*.pdf")[1]
n <- pdf_info(pdf)$pages
cat("PDF:", basename(pdf), "| páginas:", n, "\n")
dir.create("webapp/img/brand", showWarnings=FALSE, recursive=TRUE)
np <- min(n, 12)
for(i in 1:np){
  bm <- pdf_render_page(pdf, page=i, dpi=110)
  png::writePNG(bm, sprintf("webapp/img/brand/p%02d.png", i))
}
cat("Renderizadas", np, "páginas en webapp/img/brand/\n")
