# Creador de árboles de decisión

Aplicación web estática para armar árboles de decisión de un nivel (una decisión, varias alternativas, escenarios con probabilidad) y exportarlos como imagen para pegar en Word.

## Formatos del diagrama

El mismo ejercicio se puede dibujar de dos maneras, y ambas llevan la firma "powered by AG" al pie.

**Detallado (columnas con el paso a paso):** cada escenario recorre las columnas que definas (por ejemplo producción, ingresos y costos) hasta la columna del resultado; a la derecha va el valor esperado de cada alternativa y, abajo, el cuadro de comparación y decisión. Las columnas, sus títulos y el texto de cada celda son libres. Una celda con una cuenta de una sola línea (`35.000 × 250`) agrega sola su resultado.

**Compacto (formato de la cátedra):**

- Nodo de decisión cuadrado a la izquierda, con una rama por alternativa.
- Cada alternativa termina en un nodo de probabilidad circular con su valor esperado adentro: `E(A) = C + 13`.
- Los escenarios salen en paralelo del círculo, con su nombre y probabilidad: `1% (0,8)`.
- Al final de cada rama va el cálculo ponderado: `0,80(C+10) = 0,8C + 8` o `0,80 × 3.300.000 = 2.640.000 €`.

Debajo del árbol se muestra la resolución analítica y la alternativa elegida según el criterio (minimizar costos o maximizar beneficios).

## Valores admitidos

- **Resultado:** números (`3.300.000`, `1.234,5`) o expresiones lineales (`C+10`, `C-100+10`, `2(C+5)`).
- **Probabilidad:** `0,8`, `0.8`, `80%` o `4/5`.

Si los valores esperados no comparten la misma parte algebraica (por ejemplo `C + 13` y `2C - 81`), la app avisa que la decisión depende del valor de las variables.

## Uso local

No hay paso de compilación. Abrí `index.html` en el navegador o serví la carpeta:

```bash
python -m http.server 8000
```

## Publicar en Cloudflare Pages

Conectá el repositorio y dejá la configuración de build así:

- Framework preset: `None`
- Build command: (vacío)
- Build output directory: `/`

## Estructura

- `src/expr.js`: parser y formato de expresiones lineales.
- `src/tree.js`: cálculo de valores ponderados y esperados, y dibujo del SVG.
- `src/app.js`: formulario, vista previa y exportación (PNG, SVG, portapapeles).
