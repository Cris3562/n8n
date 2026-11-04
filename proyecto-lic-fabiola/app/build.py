#!/usr/bin/env python3
"""Arma la app en un solo archivo HTML (funciona sin internet).
Uso: python3 build.py  ->  dist/Unificacion_Bases_NSVS.html
"""
import base64, pathlib
R = pathlib.Path(__file__).parent
def js(p): return (R / p).read_text(encoding="utf-8").replace("</script", "<\\/script")
html = (R / "src/template.html").read_text(encoding="utf-8")
logo = "data:image/png;base64," + base64.b64encode((R / "vendor/logo-nacional-seguros.png").read_bytes()).decode()
for marca, archivo in [("/*LIB_XLSX*/", "vendor/xlsx-js-style-1.2.0.min.js"), ("/*LIB_CHART*/", "vendor/chart-4.4.1.umd.js"),
                       ("/*LIB_PPTX*/", "vendor/pptxgenjs-3.12.0.bundle.js"), ("/*LIB_JSPDF*/", "vendor/jspdf-2.5.1.umd.min.js"), ("/*LIB_H2C*/", "vendor/html2canvas-1.4.1.min.js"), ("/*CORE*/", "src/core.js")]:
    assert marca in html, marca
    html = html.replace(marca, js(archivo), 1)
html = html.replace("{{LOGO}}", logo)
out = R / "dist/Unificacion_Bases_NSVS.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(out, round(out.stat().st_size / 1e6, 2), "MB")
