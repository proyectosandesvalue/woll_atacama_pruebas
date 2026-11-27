# Banco de preguntas de análisis profundo — Geodatos Atacama

> **Documento de trabajo · versión 1.0 · 2026-11-27**
>
> **Qué es:** un banco de **121 preguntas de analítica avanzada** y **15
> preguntas de método y gobernanza** que distintos perfiles harían al portal. No
> está limitado por la data o las tools actuales: describe lo que *debería*
> poder preguntarse con el catálogo y qué se necesita para responderlo.
>
> **Para qué sirve:** diseñar análisis multicriterio, índices compuestos,
> proyecciones, modelos predictivos, optimización, sensibilidad, correlación y
> escenarios *what-if*; priorizar datos y tools; y probar si el portal responde,
> guía el análisis o se abstiene.
>
> **Relación con el banco general:** el banco general
> ([`docs/banco-preguntas-perfiles-simulados.md`](banco-preguntas-perfiles-simulados.md))
> cubre consulta, exploración, conteos y comparaciones. Este documento cubre la
> capa analítica que viene después: métodos, modelos y decisiones.
>
> **Análisis de capacidad:** [`docs/analisis-capacidad-chat-ia.md`](analisis-capacidad-chat-ia.md)
> — por qué el chat actual no puede resolver estas preguntas y qué falta.
>
> **Principio:** una pregunta profunda no siempre exige que el portal calcule
> todo. Puede responderse de tres formas:
>
> 1. **Cálculo completo:** el portal tiene los datos y el método.
> 2. **Análisis guiado:** el portal pide pesos, supuestos o datos al usuario y
>    ejecuta el método.
> 3. **Abstención metodológica:** el portal explica qué falta y cómo se haría,
>    sin inventar el resultado.

---

## 1. Cómo leer este banco

### 1.1. Estructura de cada pregunta

Cada bloque tiene una tabla con:

| Campo | Qué significa |
|---|---|
| **ID** | Código del bloque y número (`MC-01`, `IC-01`, etc.) |
| **Pregunta** | La pregunta que haría el usuario |
| **Perfiles** | Códigos del documento base (A1-F6) |
| **Método** | Técnica analítica esperada |
| **Entradas** | Datos, capas o variables necesarias |
| **Salida** | Producto esperado: ranking, índice, mapa, proyección, etc. |
| **Requiere** | Brechas de dato, método, tool o validación |

### 1.2. Códigos de brecha

| Código | Significado |
|---|---|
| `D` | Dato disponible en el catálogo actual |
| `P` | Dato parcial, proxy o con cobertura incompleta |
| `N` | Dato externo que no está en el catálogo |
| `M` | Requiere método, modelo o cálculo nuevo |
| `T` | Requiere tool, RPC, API o pipeline nuevo |
| `V` | Requiere validación con expertos o usuarios |
| `UI` | Requiere dashboard, visualización o informe |

> **Los códigos no limitan la pregunta.** Solo indican qué haría falta para
> responderla. La pregunta se mantiene aunque hoy no se pueda calcular: el
> objetivo es definir la demanda analítica antes de decidir la integración.

### 1.3. Los ocho bloques

| Bloque | Preguntas | Qué resuelve |
|---|---:|---|
| 1. Análisis multicriterio | 16 | Priorizar alternativas con criterios y pesos |
| 2. Índices compuestos | 15 | Medir vulnerabilidad, estrés, atractivo, riesgo |
| 3. Proyecciones tendenciales | 15 | Estimar demanda, población, agua, energía |
| 4. Modelos predictivos | 15 | Predecir y validar con datos históricos |
| 5. Optimización con restricciones | 15 | Asignar recursos, sitios o inspecciones |
| 6. Sensibilidad e incertidumbre | 15 | Saber qué tan robusta es una decisión |
| 7. Correlación entre variables | 15 | Encontrar relaciones y evitar causalidad falsa |
| 8. Escenarios *what-if* | 15 | Comparar base vs intervención |
| **Total** | **121** | |

> Además, el documento incluye **15 preguntas de método y gobernanza** (§10),
> para un total de **136 preguntas de análisis profundo**.

### 1.4. Madurez esperada

| Bloque | Data actual | Esfuerzo | Valor | Fase sugerida |
|---|---|---|---|---|
| Multicriterio | Alta | Medio | Alto | 1 |
| Índices compuestos | Alta | Medio | Alto | 1 |
| Proyecciones | Media | Alto | Alto | 2 |
| Predictivos | Baja | Muy alto | Medio | 4 |
| Optimización | Media | Alto | Alto | 3 |
| Sensibilidad | Alta | Medio | Alto | 1 |
| Correlación | Media | Medio | Medio | 2 |
| What-if | Media | Alto | Alto | 3 |

**Lectura:** los bloques 1, 2 y 6 se pueden construir con buena parte del
catálogo actual. Los bloques 3, 5 y 8 necesitan métodos y datos adicionales.
Los modelos predictivos son los más costosos y los que más riesgo de promesa
exagerada tienen; conviene dejarlos para una fase posterior.

---

## 2. Bloque 1 · Análisis multicriterio con criterios y pesos

### 2.1. Qué es

El análisis multicriterio permite comparar alternativas —comunas, sitios,
proyectos, áreas— usando varios criterios a la vez. La clave no es sumar
variables al azar, sino:

1. Definir las alternativas.
2. Elegir los criterios.
3. Asignar pesos.
4. Normalizar las variables.
5. Calcular un score.
6. Aplicar restricciones.
7. Hacer sensibilidad.
8. Validar con expertos.

### 2.2. Fórmula base

```text
Score_i = Σ (w_j × x'_ij)
```

Donde `x'_ij` es el valor normalizado del criterio `j` para la alternativa `i`
y `w_j` es el peso del criterio. La normalización puede ser min-max, z-score o
ranking percentil. Los pesos deben sumar 1 y deben documentarse.

### 2.3. Ejemplos de criterios y pesos

| Caso | Alternativas | Criterios y pesos sugeridos | Restricciones |
|---|---|---|---|
| Inversión en seguridad hídrica | Comunas | Estrés hídrico 25%, cobertura APR 20%, calidad 15%, escasez 15%, clima futuro 15%, población 10% | Presupuesto, competencia |
| Sitio para desalinización | Sitios costeros | Demanda 25%, energía 20%, sensibilidad ambiental 20%, costa/puerto 15%, costo 10%, aceptación social 10% | Excluir áreas protegidas, zonas de riesgo |
| Sitio para renovables | Sitios | Recurso 30%, red 25%, suelo 15%, ambiente 15%, riesgo 10%, social 5% | Excluir áreas protegidas, límites urbanos |
| Prioridad de conservación | Áreas | Representatividad 30%, amenaza 25%, conectividad 20%, costo 15%, factibilidad 10% | Presupuesto, propiedad |
| Prioridad de fiscalización | Instalaciones | Riesgo 35%, sensibilidad 25%, reincidencia 20%, accesibilidad 10%, queja 10% | Capacidad inspectiva |

### 2.4. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| MC-01 | ¿Qué comunas priorizar para inversión en seguridad hídrica considerando estrés, cobertura APR, calidad, escasez y clima futuro? | B1, A1, B4 | Scoring ponderado + normalización | Derechos, caudal, calidad, APR, decretos, ARClim, población | Ranking comunal y mapa | D/P/N/M/T/V |
| MC-02 | ¿Qué sitios son aptos para una planta desaladora considerando demanda, energía, costa, áreas protegidas, puertos y riesgo? | C5, A7, A8 | Scoring + restricciones | Desaladoras, derechos, costa, puertos, líneas, áreas protegidas, riesgo | Ranking de sitios y mapa de aptitud | P/N/M/T/V |
| MC-03 | ¿Qué instalaciones priorizar para fiscalización ambiental considerando descargas, relaves, sensibilidad y reincidencia? | B7, A2, B4 | Risk scoring | Descargas, PTAS, relaves, áreas protegidas, derechos, denuncias | Lista priorizada | D/P/N/M/T |
| MC-04 | ¿Qué sitios priorizar para un parque solar considerando radiación, red, suelo, ambiente, riesgo y distancia a demanda? | C6, A9, B4 | Scoring + constraints | Potencial, radiación, líneas, subestaciones, áreas protegidas, límites urbanos | Ranking y mapa | D/P/M/T |
| MC-05 | ¿Qué áreas priorizar para conservación considerando glaciares, humedales, áreas protegidas, incendios y presión minera? | A7, D2, B4 | Priorización de conservación | Áreas protegidas, glaciares, humedales, salares, incendios, minería | Ranking de áreas | D/P/M/T |
| MC-06 | ¿Qué comunas priorizar para inversión en riego considerando superficie frutal, estrés hídrico, eficiencia y pobreza? | A4, C1, B4 | Scoring ponderado | Frutales, suelo, canales, derechos, caudal, ARClim, pobreza | Ranking comunal | D/P/N/M/T |
| MC-07 | ¿Qué proyectos mineros priorizar para inspección considerando relaves, proximidad a áreas sensibles, derechos y riesgo? | C4, B7, A7 | Risk scoring | Relaves, yacimientos, derechos, áreas protegidas, riesgo, denuncias | Lista priorizada | D/P/N/M/T |
| MC-08 | ¿Qué sitios priorizar para vivienda considerando zonificación, riesgo, servicios, agua y accesibilidad? | A8, C7, B3 | Scoring + constraints | PRC, riesgos, geomorfología, agua, energía, servicios | Ranking de sitios | D/P/N/M/T |
| MC-09 | ¿Qué comunas priorizar para adaptación al calor considerando días sobre 30 °C, noches tropicales y población vulnerable? | A3, B5, B1 | Índice de vulnerabilidad | ARClim, población, salud, vivienda | Ranking comunal | D/P/N/M/T |
| MC-10 | ¿Qué corredores priorizar para infraestructura energética considerando potencial, red, restricciones y costo? | A9, C6, B1 | Least-cost corridor + scoring | Potencial, líneas, subestaciones, restricciones, costo | Corredores y ranking | D/P/N/M/T |
| MC-11 | ¿Qué comunas priorizar para turismo considerando atractivos, clima, riesgos, accesibilidad y áreas protegidas? | F5, D3, B1 | Scoring ponderado | Destinos, áreas protegidas, clima, riesgos, accesibilidad | Ranking comunal | P/N/M/T |
| MC-12 | ¿Cómo cambia el ranking si se duplica el peso del riesgo climático? | B1, A5 | Sensibilidad de pesos | Ranking base, pesos | Ranking alternativo y tornado | D/M/T |
| MC-13 | ¿Cómo cambia el ranking si se excluyen las áreas protegidas? | C5, A7 | Sensibilidad de restricciones | Ranking, áreas protegidas | Ranking alternativo | D/M/T |
| MC-14 | ¿Qué alternativas son Pareto-eficientes entre costo y beneficio? | C6, B1 | Optimización multiobjetivo | Costo, beneficio, restricciones | Frontera de Pareto | P/N/M/T |
| MC-15 | ¿Qué criterios tienen mayor influencia en el resultado? | A5, B1 | Sensibilidad global | Scores, pesos | Contribución por criterio | D/M/T |
| MC-16 | ¿Cómo se validan los pesos con expertos? | E4, B1 | Delphi / AHP | Ranking, panel de expertos | Pesos validados y acta | V |

### 2.5. Validación del bloque

- **Validez de contenido:** ¿los criterios cubren las dimensiones relevantes?
- **Validez de pesos:** ¿los expertos acuerdan o al menos entienden los pesos?
- **Robustez:** ¿el ranking cambia mucho con pequeños cambios de pesos?
- **Transparencia:** ¿se puede explicar por qué una alternativa quedó arriba?
- **Utilidad:** ¿el decisor cambiaría una decisión con este ranking?

## 3. Bloque 2 · Índices compuestos

### 3.1. Qué es

Un índice compuesto combina varias variables en un solo número para comparar
territorios o monitorear un fenómeno. No reemplaza el análisis detallado: lo
resume y lo hace comunicable. Un buen índice debe declarar:

- qué mide y qué no;
- variables de entrada y dirección;
- método de normalización;
- pesos y su justificación;
- método de agregación;
- incertidumbre;
- validación externa.

### 3.2. Índices propuestos

| Índice | Fórmula conceptual | Variables | Interpretación |
|---|---|---|---|
| Estrés hídrico | Demanda / oferta | Derechos, caudal, precipitación, escasez | >1 indica presión sobre la oferta |
| Vulnerabilidad climática | Exposición + sensibilidad - capacidad adaptativa | ARClim, población, servicios, vivienda | Mayor valor, mayor vulnerabilidad |
| Riesgo territorial | Amenaza × exposición × vulnerabilidad | Volcanes, sismos, incendios, infraestructura, población | Mayor valor, mayor riesgo |
| Atractivo energético | Recurso + red - restricciones | Potencial, líneas, subestaciones, áreas protegidas, riesgo | Mayor valor, mejor atractivo |
| Potencial agrícola | Suelo + agua + clima - limitaciones | Suelo, canales, frutales, ARClim | Mayor valor, mayor aptitud |
| Presión ambiental | Actividades / sensibilidad | Minería, desalación, descargas, incendios, áreas protegidas | Mayor valor, mayor presión |
| Cobertura de datos | Capas y atributos disponibles / esperados | Catálogo, comunas, dimensiones | Mayor valor, mejor cobertura |
| Accesibilidad territorial | Distancia a servicios y infraestructura | Puertos, líneas, caminos, ciudades | Mayor valor, mejor acceso |

### 3.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| IC-01 | ¿Cuál es el índice de estrés hídrico por comuna y cuáles están en situación crítica? | A1, B1 | Demanda/oferta normalizada | Derechos, caudal, precipitación, escasez, APR | Índice y mapa | D/P/M/T |
| IC-02 | ¿Cómo se compone el índice de vulnerabilidad climática por comuna? | A3, B5 | Índice tipo IPCC | ARClim, población, salud, vivienda, servicios | Índice y descomposición | D/P/N/M/T |
| IC-03 | ¿Qué comunas tienen mayor índice de riesgo territorial? | A10, B5 | Amenaza × exposición × vulnerabilidad | Amenazas, infraestructura, población, vulnerabilidad | Índice y mapa | D/P/N/M/T |
| IC-04 | ¿Cuál es el atractivo energético de cada comuna para renovables? | A9, C6 | Índice compuesto | Potencial, red, restricciones, riesgo, demanda | Ranking comunal | D/P/N/M/T |
| IC-05 | ¿Cuál es el potencial agrícola de cada comuna? | A4, C1 | Índice compuesto | Suelo, agua, clima, frutales, canales | Ranking comunal | D/P/M/T |
| IC-06 | ¿Qué comunas tienen mayor presión ambiental por minería, desalación y descargas? | A7, B7 | Índice de presión | Minería, desalación, descargas, incendios, áreas protegidas | Índice y mapa | D/P/M/T |
| IC-07 | ¿Cuál es la cobertura de datos por comuna y dimensión? | E1, A5 | Índice de cobertura | Capas, atributos, comunas | Tablero y mapa | D/M/T |
| IC-08 | ¿Cómo se normalizan variables con unidades distintas? | A5, E4 | Min-max, z-score, percentil | Variables de entrada | Comparación de métodos | D/M |
| IC-09 | ¿Qué variables tienen mayor peso en el índice? | B1, E4 | Contribución de pesos | Índice, variables | Tornado y descomposición | D/M |
| IC-10 | ¿Cómo cambia el índice si se usa agregación aritmética o geométrica? | A5, E4 | Comparación de agregación | Variables normalizadas | Ranking alternativo | D/M |
| IC-11 | ¿Cómo se valida el índice con un benchmark externo? | A11, E4 | Correlación de rangos | Índice, benchmark | Validación | N/M/V |
| IC-12 | ¿Qué comunas son robustas al cambio de pesos? | B1, A5 | Monte Carlo / rank stability | Índice, pesos | Intervalos de ranking | D/M |
| IC-13 | ¿Qué índice es más sensible a datos faltantes? | E4, A5 | Imputación y sensibilidad | Índice, faltantes | Diagnóstico de sesgo | D/M |
| IC-14 | ¿Cómo se comunica un índice sin ocultar su incertidumbre? | D3, B6 | Visualización y ficha | Índice, intervalos | Ficha comunicable | M/UI |
| IC-15 | ¿Qué indicadores son de estado, presión o respuesta? | B6, A11 | Marco DPSIR | Indicadores | Tablero ordenado | D/M |

### 3.4. Validación del bloque

- **Convergencia:** ¿el índice se correlaciona con un benchmark independiente?
- **Discriminación:** ¿distingue comunas o todo lo deja en un rango estrecho?
- **Robustez:** ¿cambia mucho con otro método de normalización o agregación?
- **Transparencia:** ¿se puede explicar qué mide y qué no?
- **Utilidad:** ¿un decisor cambia prioridades con el índice?

---

## 4. Bloque 3 · Proyecciones tendenciales

### 4.1. Qué es

Una proyección extiende una serie o un conjunto de drivers hacia el futuro. No
es una predicción cierta: es un escenario condicionado a supuestos. Debe
declarar horizonte, modelo, supuestos y errores.

### 4.2. Métodos

| Método | Cuándo usarlo | Datos necesarios | Validación |
|---|---|---|---|
| Tendencia lineal | Serie estable | Serie histórica | Backtesting, MAE |
| Tendencia exponencial | Crecimiento acelerado | Serie histórica | Backtesting, MAPE |
| Logística | Saturación | Serie histórica | Backtesting |
| ARIMA | Autocorrelación | Serie larga | Backtesting |
| Driver-based | Cambios de demanda | Población, actividad, clima | Escenarios |
| Cohort-component | Población | Censo, natalidad, mortalidad, migración | Censo |
| Capacity expansion | Energía | Potencial, demanda, red | Escenarios |

### 4.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| PR-01 | ¿Cómo evoluciona la demanda de agua por comuna al 2050 bajo SSP2-4.5? | A1, B1 | Driver-based | Población, agricultura, minería, caudal, ARClim | Demanda por comuna | P/N/M |
| PR-02 | ¿Cómo cambia la disponibilidad hídrica superficial con la precipitación proyectada? | A3, B1 | Rainfall-runoff / tendencia | Precipitación ARClim, caudal histórico, recarga | Disponibilidad | P/M |
| PR-03 | ¿Cómo evoluciona la demanda eléctrica regional al 2050? | A9, B1 | Econométrica / tendencia | Población, minería, PIB, consumo | Demanda | N/M |
| PR-04 | ¿Cómo crece la superficie frutal si se mantiene la tendencia 2018-2024? | A4, C2 | Tendencia / logística | Catastro 2018 y 2024, variedades | Superficie futura | P/M |
| PR-05 | ¿Cómo cambia la población comunal al 2035? | B2, B6 | Cohort-component | Censo, natalidad, mortalidad, migración | Población | N/M |
| PR-06 | ¿Cómo evoluciona la generación renovable si se construyen los proyectos potenciales? | C6, A9 | Capacity expansion | Potencial, factor de planta, proyectos, red | Generación | P/N/M |
| PR-07 | ¿Cómo cambia la superficie urbana al 2040? | A8, B2 | Land-use model | Límites urbanos, permisos, población | Superficie urbana | P/N/M |
| PR-08 | ¿Cómo evoluciona la producción minera regional? | C3, B1 | Tendencia / reservas | Yacimientos, reservas, producción | Producción | N/M |
| PR-09 | ¿Cómo cambia la demanda turística en la próxima década? | F5, B1 | Tendencia / estacionalidad | Destinos, visitantes, clima | Demanda | N/M |
| PR-10 | ¿Cuál es la tendencia de los caudales históricos? | A1, A3 | Mann-Kendall / ARIMA | Serie de caudal | Tendencia y significancia | D/M |
| PR-11 | ¿Cuál es la tendencia de temperatura y precipitación? | A3, A4 | Tendencia / change point | Estaciones, ARClim | Tendencia | D/M |
| PR-12 | ¿Qué comunas crecen más rápido y cuáles se estancan? | B1, B6 | Cluster / tendencia | Población, empleo, vivienda | Ranking | N/M |
| PR-13 | ¿Qué proyección es más incierta y por qué? | B1, E4 | Ensemble / Monte Carlo | Proyecciones | Intervalos | M |
| PR-14 | ¿Cómo se valida una proyección con datos históricos? | A11, E4 | Backtesting | Serie histórica | Error y sesgo | D/M |
| PR-15 | ¿Qué supuestos sostienen la proyección? | B6, E4 | Auditoría de supuestos | Proyección | Matriz de supuestos | M/V |

### 4.4. Validación del bloque

- **Backtesting:** entrenar con datos hasta un año y comparar con los siguientes.
- **Error:** MAE, RMSE, MAPE; no basta un R².
- **Supuestos:** ¿son explícitos y plausibles?
- **Escenarios:** ¿cómo cambia con SSP2-4.5 y SSP5-8.5?
- **Incertidumbre:** ¿se reporta un intervalo, no un número único?

## 5. Bloque 4 · Modelos predictivos y validación

### 5.1. Qué es

Un modelo predictivo estima un valor desconocido a partir de variables
observadas. Puede predecir una variable continua (caudal, rendimiento,
demanda), una categoría (riesgo alto/medio/bajo) o una probabilidad (incendio,
remoción). La calidad no se mide por lo "sofisticado" del modelo, sino por su
desempeño fuera de la muestra y por su utilidad para decidir.

### 5.2. Métodos y validación

| Tipo | Modelos | Métricas | Validación |
|---|---|---|---|
| Regresión | Lineal, GLM, regularizada | MAE, RMSE, R² | Train/test, CV |
| Clasificación | Logística, árboles, boosting | ROC-AUC, precision, recall, calibración | Stratified CV |
| Series | ARIMA, Prophet, state-space | MAPE, RMSE | Backtesting |
| Espacial | Kriging, GWR, random forest espacial | RMSE, Moran's I residual | Spatial CV |
| Ensemble | Random forest, gradient boosting | MAE/RMSE, importancia | Nested CV |

### 5.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| MP-01 | ¿Se puede predecir la calidad del agua en una estación no monitoreada? | A2, B7 | Regresión / ML | Calidad histórica, caudal, descargas, estación | Predicción y intervalo | D/P/M/V |
| MP-02 | ¿Qué variables predicen mejor el rendimiento de un cultivo? | A4, C1 | Regresión / ML | NDVI, clima, suelo, variedad, riego | Rendimiento e importancia | P/N/M/V |
| MP-03 | ¿Se puede predecir el riesgo de incendio por comuna? | A10, B5 | Clasificación | Clima, vegetación, historial, topografía | Probabilidad | P/N/M/V |
| MP-04 | ¿Se puede predecir la probabilidad de una remoción en masa? | A10, B5 | Logística / ML | Geomorfología, pendiente, lluvia, sismos | Susceptibilidad | P/N/M/V |
| MP-05 | ¿Se puede predecir la demanda de agua por comuna? | A1, B1 | Regresión | Población, cultivos, minería, clima | Demanda | N/M/V |
| MP-06 | ¿Se puede predecir la generación solar de un sitio? | C6, A9 | Modelo PV | Radiación, temperatura, panel | Generación | P/M/V |
| MP-07 | ¿Se puede predecir el precio del suelo con datos territoriales? | C7, F6 | Modelo hedónico | Zonificación, riesgo, servicios, accesibilidad | Precio | N/M/V |
| MP-08 | ¿Qué modelo tiene mejor desempeño y por qué? | A12, E4 | Comparación de modelos | Modelos candidatos | Ranking de desempeño | M/V |
| MP-09 | ¿Cómo se valida un modelo con pocos datos? | A11, A12 | Regularización / Bayes | Series cortas | Modelo e intervalo | M/V |
| MP-10 | ¿Cómo se evita el sobreajuste? | A12, E4 | Train/test / CV | Modelo, datos | Diagnóstico | M |
| MP-11 | ¿Cómo se mide la incertidumbre de la predicción? | A12, E4 | Quantile / ensemble | Modelo | Intervalos | M |
| MP-12 | ¿Cómo se explica el modelo a un usuario no técnico? | D3, B6 | SHAP / PDP | Modelo | Explicación | M/UI |
| MP-13 | ¿Cómo se monitorea el deterioro del modelo? | E4, A12 | Drift monitoring | Predicciones, nuevos datos | Alerta | M/T |
| MP-14 | ¿Qué sesgos tiene el modelo? | A11, D2 | Error analysis | Modelo, datos | Diagnóstico | M/V |
| MP-15 | ¿Qué decisión se puede tomar con la predicción? | B1, B6 | Decision analysis | Predicción, costos | Recomendación | M/V |

### 5.4. Validación del bloque

- **Separación train/test:** nunca evaluar con los mismos datos de entrenamiento.
- **Validación cruzada:** especial cuidado con datos espaciales y temporales.
- **Métricas adecuadas:** no usar accuracy si las clases están desbalanceadas.
- **Calibración:** una probabilidad de 70% debe comportarse como 70%.
- **Explicabilidad:** el usuario debe saber qué variables pesan y cuáles no.
- **Gobernanza:** versión del modelo, datos, supuestos y fecha.

---

## 6. Bloque 5 · Optimización con restricciones

### 6.1. Qué es

Optimizar es elegir la mejor solución posible sujeto a restricciones. No es
"elegir el que tiene mejor score": es resolver un problema con objetivos,
variables de decisión y límites.

### 6.2. Tipos de problema

| Problema | Objetivo | Restricciones | Método |
|---|---|---|---|
| Selección de sitios | Maximizar beneficio o minimizar costo | Ambiente, red, suelo, riesgo | Programación entera |
| Asignación de agua | Maximizar beneficio social/económico | Derechos, oferta, calidad | Programación lineal |
| Cobertura de inspecciones | Maximizar riesgo cubierto | Número de inspectores | Set covering / knapsack |
| Portafolio de proyectos | Maximizar retorno ajustado por riesgo | Presupuesto, plazo | Optimización de portafolio |
| Conservación | Maximizar representatividad | Presupuesto, propiedad | Set cover / complementariedad |
| Cobertura de estaciones | Maximizar área o población cubierta | Número de estaciones | Maximum coverage |

### 6.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| OP-01 | ¿Qué conjunto de sitios maximiza la generación renovable con restricciones de red y ambiente? | C6, A9 | Programación entera | Potencial, red, restricciones, costo | Portafolio de sitios | P/N/M/T |
| OP-02 | ¿Cómo asignar inspecciones limitadas para maximizar el riesgo cubierto? | B7, B4 | Knapsack / set covering | Riesgo, costo, capacidad | Plan de inspección | D/P/M/T |
| OP-03 | ¿Cómo asignar agua entre usos con restricciones de derechos y disponibilidad? | A1, B4 | Programación lineal | Derechos, oferta, demanda, prioridades | Asignación | P/N/M/T |
| OP-04 | ¿Qué sitios de desalinización minimizan costo y impacto ambiental? | C5, A7 | Multiobjetivo | Costo, distancia, ambiente, energía | Frontera de Pareto | P/N/M/T |
| OP-05 | ¿Qué áreas priorizar para conservación con presupuesto limitado? | A7, B4 | Set cover | Áreas, costo, representatividad | Portafolio | D/P/M/T |
| OP-06 | ¿Dónde instalar estaciones para maximizar la cobertura territorial? | A1, B5 | Maximum coverage | Cobertura, costo | Sitios | D/M/T |
| OP-07 | ¿Qué proyectos seleccionar para un portafolio de inversión y riesgo? | C7, F6 | Optimización de portafolio | Proyectos, retorno, riesgo | Asignación | N/M/T |
| OP-08 | ¿Cómo distribuir inversión pública entre comunas con brechas y presupuesto? | B1, B6 | Programación lineal | Brechas, costo, beneficio | Distribución | P/N/M/T |
| OP-09 | ¿Cuál es la frontera de Pareto entre costo y beneficio? | B1, C7 | Multiobjetivo | Costo, beneficio, restricciones | Frontera | M/T |
| OP-10 | ¿Qué restricción es la más limitante del sistema? | A5, E4 | Dual / shadow prices | Modelo | Restricción crítica | M/T |
| OP-11 | ¿Qué pasa si se relaja una restricción? | C5, B1 | Sensibilidad de restricciones | Modelo | Delta de beneficio | M/T |
| OP-12 | ¿Cómo se resuelve un problema con varios objetivos? | A9, E4 | Weighted sum / epsilon | Objetivos | Soluciones | M/T |
| OP-13 | ¿Cómo se valida que la solución es factible? | E2, A5 | Constraint check | Solución | Factibilidad | M/T |
| OP-14 | ¿Cómo se explica el trade-off a un decisor? | B1, E4 | Visualización | Pareto | Gráfico y narrativa | M/UI |
| OP-15 | ¿Qué solución es robusta a cambios de demanda? | C6, B1 | Robust optimization | Escenarios | Solución robusta | M/T |

### 6.4. Validación del bloque

- **Factibilidad:** toda solución debe cumplir las restricciones.
- **Optimalidad:** ¿es la mejor o solo una buena solución?
- **Supuestos:** costos, capacidades y demandas deben estar declarados.
- **Trade-offs:** mostrar la frontera, no una sola solución.
- **Robustez:** probar con escenarios de demanda y precios.
- **Aceptabilidad:** la solución debe ser implementable, no solo matemática.

## 7. Bloque 6 · Análisis de sensibilidad e incertidumbre

### 7.1. Qué es

La sensibilidad responde: **¿qué pasa si cambia un supuesto?** La incertidumbre
responde: **¿cuánto no sabemos?** Sin este bloque, un ranking o una proyección
parece más sólido de lo que es.

### 7.2. Métodos

| Método | Qué varía | Salida | Cuándo usarlo |
|---|---|---|---|
| One-at-a-time | Un parámetro a la vez | Tornado | Exploración rápida |
| Scenario analysis | Combinaciones de supuestos | Tabla de escenarios | Decisiones estratégicas |
| Monte Carlo | Distribuciones de parámetros | Intervalos, probabilidades | Incertidumbre cuantitativa |
| Global sensitivity | Todos los parámetros | Ranking de influencia | Modelos complejos |
| Break-even | Umbral crítico | Punto de cambio | Decisiones binarias |

### 7.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| SI-01 | ¿Cómo cambia el ranking si el peso del agua aumenta 20%? | B1, A5 | One-at-a-time | Ranking, pesos | Tornado | D/M |
| SI-02 | ¿Cómo cambia el mapa si el umbral de proximidad pasa de 5 a 10 km? | A7, B7 | Barrido de umbral | Proximidad | Curva de sensibilidad | D/M/T |
| SI-03 | ¿Qué comunas son robustas a distintos pesos? | B1, A5 | Rank stability | Rankings | Intervalos de ranking | D/M |
| SI-04 | ¿Cuál es el intervalo de confianza de la proyección? | A3, B1 | Bootstrap / Monte Carlo | Proyección | Intervalo | M |
| SI-05 | ¿Qué variables aportan más incertidumbre? | A1, A12 | Sensibilidad global | Modelo | Ranking de variables | M |
| SI-06 | ¿Cómo se propaga el error de los datos? | A5, E4 | Monte Carlo | Datos, error | Distribución | D/M |
| SI-07 | ¿Qué pasa si falta el 20% de los datos? | E4, A5 | Imputación y sensibilidad | Dataset | Sesgo | D/M |
| SI-08 | ¿Cómo cambia el resultado entre SSP2-4.5 y SSP5-8.5? | A3, B1 | Escenarios | ARClim | Delta | D/M |
| SI-09 | ¿Qué supuestos son más críticos? | B1, E4 | Auditoría de supuestos | Modelo | Matriz | M/V |
| SI-10 | ¿Cómo se comunica la incertidumbre a un decisor? | D3, B6 | Visualización | Incertidumbre | Ficha | M/UI |
| SI-11 | ¿Qué decisión es robusta en todos los escenarios? | B1, B5 | Minimax / robust | Escenarios | Opción | M |
| SI-12 | ¿Cómo se hace un Monte Carlo con estos datos? | A12, E4 | Simulación | Distribuciones | Distribución de salida | M |
| SI-13 | ¿Cómo se valida la sensibilidad? | A11, E4 | Revisión experta | Resultados | Informe | V |
| SI-14 | ¿Qué umbral cambia la decisión? | B1, B7 | Break-even | Modelo | Umbral | M |
| SI-15 | ¿Qué pasa si se usan pesos iguales? | B1, A5 | Comparación | Variables | Ranking alternativo | D/M |

### 7.4. Validación del bloque

- **Rango:** los parámetros deben tener límites plausibles.
- **Distribuciones:** no todo es normal; usar datos o expertos.
- **Correlación:** no simular variables independientes si están correlacionadas.
- **Comunicación:** mostrar intervalos, no solo promedios.
- **Decisión:** la sensibilidad debe cambiar o reforzar una decisión.

---

## 8. Bloque 7 · Correlación entre variables

### 8.1. Qué es

La correlación mide si dos variables se mueven juntas. No prueba causalidad.
Sirve para generar hipótesis, detectar anomalías y priorizar análisis, no para
afirmar que una cosa causa otra.

### 8.2. Métodos

| Método | Tipo de relación | Advertencia |
|---|---|---|
| Pearson | Lineal | Sensible a outliers |
| Spearman | Monótona | No lineal |
| Moran's I | Autocorrelación espacial | Requiere vecindad |
| Regresión | Asociación ajustada | No prueba causalidad |
| DAG | Hipótesis causal | Requiere teoría |

### 8.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| CV-01 | ¿Existe relación entre derechos de agua y disponibilidad hídrica? | A1, B4 | Spearman / regresión | Derechos, caudal, precipitación | Correlación | D/M |
| CV-02 | ¿La superficie frutal se correlaciona con el NDVI? | A4, C1 | Regresión espacial | Superficie, NDVI | Correlación | P/M |
| CV-03 | ¿Los incendios se correlacionan con días de calor? | A10, B5 | Logística | Incendios, ARClim | Asociación | D/M |
| CV-04 | ¿La presencia de relaves se correlaciona con áreas protegidas? | A7, C4 | Point pattern | Relaves, áreas protegidas | Asociación | D/M |
| CV-05 | ¿El potencial renovable se correlaciona con la red de transmisión? | A9, C6 | Correlación espacial | Potencial, líneas | Asociación | D/M |
| CV-06 | ¿La calidad del agua se correlaciona con las descargas? | A2, B7 | Regresión | Calidad, descargas | Asociación | D/M |
| CV-07 | ¿Las comunas con más derechos tienen más escasez? | A1, B1 | Comparación | Derechos, decretos | Asociación | D/M |
| CV-08 | ¿La inversión en desalación se correlaciona con estrés hídrico? | C5, B1 | Regresión | Plantas, estrés | Asociación | D/M |
| CV-09 | ¿La superficie protegida se correlaciona con conflictos mineros? | A7, D2 | Point pattern | Áreas, minas | Asociación | D/M |
| CV-10 | ¿La temperatura se correlaciona con la altitud? | A6, A3 | Regresión | Estaciones, DEM | Relación | D/N/M |
| CV-11 | ¿Cómo se mide la autocorrelación espacial? | A5, A11 | Moran's I | Variable | Índice | D/M |
| CV-12 | ¿Correlación implica causalidad? | A11, D3 | Inferencia causal | Correlación | Advertencia | M/V |
| CV-13 | ¿Qué confusores pueden explicar la relación? | A11, E4 | DAG / regresión | Variables | Lista | M/V |
| CV-14 | ¿Cómo se valida una correlación? | A11, A5 | Holdout | Correlación | Robustez | D/M |
| CV-15 | ¿Qué correlación es espuria? | D3, E4 | Detrend / control | Series | Diagnóstico | D/M |

### 8.4. Validación del bloque

- **Significancia:** no confundir p-valor con tamaño del efecto.
- **Tamaño del efecto:** reportar coeficiente e intervalo.
- **Confusores:** controlar por variables relevantes.
- **Autocorrelación:** los datos espaciales no son independientes.
- **Causalidad:** no afirmarla sin diseño causal.
- **Comunicación:** decir "asociación", no "causa".

---

## 9. Bloque 8 · Escenarios *what-if* de proyectos o políticas

### 9.1. Qué es

Un escenario *what-if* compara una situación base con una intervención:
una planta, una política, un proyecto, un cambio climático o una restricción.
No predice el futuro: estima el delta entre dos configuraciones.

### 9.2. Estructura

1. **Línea base:** situación actual.
2. **Intervención:** qué cambia.
3. **Variables afectadas:** agua, energía, riesgo, ambiente, territorio.
4. **Delta:** diferencia entre base e intervención.
5. **Incertidumbre:** rango del delta.
6. **Decisión:** ¿el delta justifica la intervención?

### 9.3. Preguntas

| ID | Pregunta | Perfiles | Método | Entradas | Salida | Requiere |
|---|---|---|---|---|---|---|
| WI-01 | ¿Qué pasa si se instala una desaladora en la comuna X? | C5, A7, B1 | Scenario delta | Planta, demanda, energía, ambiente | Impacto | P/N/M/T |
| WI-02 | ¿Qué pasa si se duplica la superficie frutal? | A4, C1, B1 | Scenario | Superficie, agua, clima | Demanda e impacto | P/N/M/T |
| WI-03 | ¿Qué pasa si se crea un área protegida? | A7, D2, B4 | Constraint scenario | Áreas, proyectos | Restricciones | D/M/T |
| WI-04 | ¿Qué pasa si se construye una línea de transmisión? | C6, A9, B1 | Scenario | Línea, potencial, ambiente | Potencial conectado | P/N/M/T |
| WI-05 | ¿Qué pasa si se aprueba un proyecto minero? | C3, C4, B7 | Scenario | Mina, agua, relaves, áreas | Impacto | P/N/M/T |
| WI-06 | ¿Qué pasa si se aplica un decreto de escasez? | A1, B4, D1 | Scenario | Decreto, derechos, caudal | Afectados | D/M/T |
| WI-07 | ¿Qué pasa si la población crece 20%? | B2, B6, A8 | Scenario | Población, demanda | Brecha | N/M |
| WI-08 | ¿Qué pasa si la demanda energética crece 30%? | A9, C6, B1 | Scenario | Demanda, generación | Brecha | N/M |
| WI-09 | ¿Qué pasa si se prohíbe la expansión urbana? | A8, B3, C7 | Scenario | Límites, PRC | Superficie | D/M |
| WI-10 | ¿Qué pasa si se cambia el escenario climático? | A3, B1, B5 | Scenario comparison | SSP | Delta | D/M |
| WI-11 | ¿Qué pasa si se reasigna agua entre usos? | A1, B4, C1 | Scenario / LP | Derechos, usos | Asignación | P/N/M/T |
| WI-12 | ¿Qué pasa si se reduce la inversión pública? | B1, B6 | Scenario | Proyectos, presupuesto | Prioridad | N/M |
| WI-13 | ¿Qué pasa si se implementan restricciones de riego? | A4, C1, B4 | Scenario | Cultivos, agua | Impacto | P/N/M |
| WI-14 | ¿Qué pasa si se prioriza la conservación? | A7, B4 | Scenario | Áreas, presión | Prioridad | D/M |
| WI-15 | ¿Cómo se compara el escenario base con el escenario de intervención? | B1, E4 | Difference-in-differences | Base, intervención | Efecto | N/M/V |

### 9.4. Validación del bloque

- **Línea base:** debe ser explícita y reproducible.
- **Intervención:** debe estar bien definida.
- **Supuestos:** demanda, costos y comportamiento deben declararse.
- **Delta:** mostrar diferencia absoluta y relativa.
- **Incertidumbre:** no presentar un solo número.
- **Decisión:** el escenario debe informar una decisión, no solo entretener.

## 10. Preguntas de método y gobernanza

Estas preguntas no pertenecen a un bloque, pero cualquier análisis profundo
debería poder responderlas. Son las que separan un resultado presentable de un
resultado defendible.

| ID | Pregunta | Perfiles | Requiere |
|---|---|---|---|
| MG-01 | ¿Qué método usaste y por qué? | Todos | M |
| MG-02 | ¿Qué criterios, variables y pesos usaste? | B1, E4 | M/UI |
| MG-03 | ¿Qué supuestos sostienen el resultado? | B6, E4 | M/V |
| MG-04 | ¿Qué datos faltan y cómo afectan? | E4, A5 | M/UI |
| MG-05 | ¿Cómo se valida el resultado? | A11, E4 | M/V |
| MG-06 | ¿Cuál es la incertidumbre del resultado? | B1, A5 | M/UI |
| MG-07 | ¿Puedo cambiar los pesos y ver el efecto? | B1, A5 | M/T |
| MG-08 | ¿Puedo descargar el modelo y reproducirlo? | A11, E2 | M/T |
| MG-09 | ¿Quién validó el método? | E4, B6 | V |
| MG-10 | ¿Qué versión del modelo y de los datos se usó? | E1, E4 | M/T |
| MG-11 | ¿Cómo se actualiza el análisis? | E1, E4 | M/T |
| MG-12 | ¿Qué no mide este índice o modelo? | D3, B6 | M/UI |
| MG-13 | ¿Cómo se comunica sin falsa precisión? | D3, B6 | M/UI |
| MG-14 | ¿Qué decisión habilita y cuál no? | B1, E4 | M/V |
| MG-15 | ¿El resultado es robusto a cambios razonables? | B1, A5 | M |

---

## 11. Cómo usar este banco

### 11.1. Tres formas de responder

| Forma | Cuándo | Ejemplo |
|---|---|---|
| **Cálculo completo** | Hay datos, método y tool | Índice de cobertura de datos con el catálogo actual |
| **Análisis guiado** | Hay datos parciales; el usuario aporta pesos o supuestos | Ranking de comunas con pesos definidos por el usuario |
| **Abstención metodológica** | Faltan datos o el método no es válido | Predicción de precio del suelo sin datos de mercado |

La tercera forma no es un fracaso. Es una respuesta honesta y útil: dice qué
falta, por qué y cómo se resolvería.

### 11.2. Flujo para convertir una pregunta en producto

1. **Decisión:** ¿qué se quiere decidir?
2. **Alternativas:** comunas, sitios, proyectos, áreas.
3. **Criterios:** variables que importan y su dirección.
4. **Pesos:** quién los define y cómo se validan.
5. **Datos:** disponibles, parciales, faltantes.
6. **Método:** scoring, índice, proyección, modelo, optimización.
7. **Salida:** ranking, mapa, serie, escenario, Pareto.
8. **Validación:** sensibilidad, expertos, benchmark.
9. **Comunicación:** ficha, dashboard, informe.
10. **Gobernanza:** versión, fuente, fecha, responsable.

### 11.3. Plantilla de ficha analítica

```text
Pregunta:
Perfil:
Decisión:
Alternativas:
Criterios y pesos:
Datos de entrada:
Método:
Salida:
Supuestos:
Incertidumbre:
Validación:
Limitaciones:
Responsable:
Versión:
```

---

## 12. Roadmap de implementación

| Fase | Bloques | Producto mínimo | Datos | Esfuerzo | Valor |
|---|---|---|---|---|---|
| 1 | Multicriterio, índices, sensibilidad | Ranking builder + índice + tornado | Catálogo actual | Medio | Alto |
| 2 | Proyecciones, correlación | Serie tendencial + matriz de correlación | Catálogo + ARClim | Medio-alto | Alto |
| 3 | Optimización, what-if | Solver simple + escenario base/intervención | Catálogo + supuestos | Alto | Alto |
| 4 | Predictivos | Modelo validado + monitoreo | Datos históricos + externos | Muy alto | Medio |
| 5 | Gobernanza | Fichas, versiones, API, dashboard | Todo lo anterior | Medio | Alto |

**Recomendación:** empezar por la fase 1. Un ranking transparente con
sensibilidad y un índice compuesto bien documentado generan más confianza que
un modelo predictivo prematuro.

### 12.1. Datos que más se repiten

| Dato o variable | Bloques | Para qué |
|---|---|---|
| Población y vulnerabilidad | MC, IC, PR, WI | Estrés, exposición, demanda, beneficiarios |
| Demanda de agua y energía | PR, OP, WI | Proyecciones, asignación, brechas |
| Precios y costos | MC, MP, OP, WI | Sitios, portafolios, priorización |
| Series históricas | PR, MP, SI | Tendencias, modelos, validación |
| Huella de proyectos | OP, WI | Escenarios, restricciones, impactos |
| Cobertura de servicios | MC, IC, WI | Vulnerabilidad, accesibilidad, equidad |
| Pesos y validación experta | MC, IC, SI | Ranking, índices, gobernanza |
| Geometrías de sitios | MC, OP, WI | Aptitud, optimización, escenarios |

**Lectura:** si se quiere avanzar rápido, conviene priorizar **población,
demanda, series históricas y geometrías de proyectos**. Esos cuatro grupos
desbloquean la mayor cantidad de preguntas de varios bloques a la vez.

---

## 13. Prueba rápida de 24 preguntas

Si no se pueden ejecutar las 136, empezar por estas 24: tres por bloque.

| # | ID | Pregunta | Bloque |
|---|---|---|---|
| 1 | MC-01 | ¿Qué comunas priorizar para inversión en seguridad hídrica? | Multicriterio |
| 2 | MC-02 | ¿Qué sitios son aptos para una desaladora? | Multicriterio |
| 3 | MC-12 | ¿Cómo cambia el ranking si se duplica el peso del riesgo? | Multicriterio |
| 4 | IC-01 | ¿Cuál es el índice de estrés hídrico por comuna? | Índices |
| 5 | IC-03 | ¿Qué comunas tienen mayor riesgo territorial? | Índices |
| 6 | IC-11 | ¿Cómo se valida el índice con un benchmark? | Índices |
| 7 | PR-01 | ¿Cómo evoluciona la demanda de agua al 2050? | Proyecciones |
| 8 | PR-10 | ¿Cuál es la tendencia de los caudales históricos? | Proyecciones |
| 9 | PR-14 | ¿Cómo se valida una proyección? | Proyecciones |
| 10 | MP-01 | ¿Se puede predecir la calidad del agua? | Predictivos |
| 11 | MP-08 | ¿Qué modelo tiene mejor desempeño? | Predictivos |
| 12 | MP-10 | ¿Cómo se evita el sobreajuste? | Predictivos |
| 13 | OP-01 | ¿Qué sitios maximizan generación renovable con restricciones? | Optimización |
| 14 | OP-02 | ¿Cómo asignar inspecciones limitadas? | Optimización |
| 15 | OP-09 | ¿Cuál es la frontera de Pareto costo-beneficio? | Optimización |
| 16 | SI-01 | ¿Cómo cambia el ranking si cambia un peso? | Sensibilidad |
| 17 | SI-04 | ¿Cuál es el intervalo de confianza de la proyección? | Sensibilidad |
| 18 | SI-11 | ¿Qué decisión es robusta en todos los escenarios? | Sensibilidad |
| 19 | CV-01 | ¿Derechos de agua y disponibilidad están correlacionados? | Correlación |
| 20 | CV-03 | ¿Incendios y calor están correlacionados? | Correlación |
| 21 | CV-12 | ¿Correlación implica causalidad? | Correlación |
| 22 | WI-01 | ¿Qué pasa si se instala una desaladora? | What-if |
| 23 | WI-05 | ¿Qué pasa si se aprueba un proyecto minero? | What-if |
| 24 | WI-15 | ¿Cómo se compara base vs intervención? | What-if |

---

## 14. Guardrails metodológicos

1. **No falsa precisión.** Un ranking con pesos subjetivos no es una verdad
   objetiva; es una herramienta de conversación.
2. **Supuestos explícitos.** Todo análisis debe declarar qué asume.
3. **Normalización documentada.** Las variables con unidades distintas no se
   suman sin transformación.
4. **Sensibilidad obligatoria.** Todo ranking o índice debe mostrar qué pasa si
   cambian los pesos o umbrales.
5. **Correlación no es causalidad.** El portal debe hablar de asociación.
6. **Validación con expertos.** Los métodos y pesos deben revisarse con quienes
   deciden.
7. **Datos faltantes declarados.** No imputar sin decir cómo y por qué.
8. **Fuera de rango.** No extrapolar un modelo fuera del rango de los datos
   que lo sustentan.
9. **Versión y reproducibilidad.** Guardar datos, método, parámetros y fecha.
10. **Utilidad antes que sofisticación.** Un método simple y transparente suele
    ser mejor que uno complejo e inexplicable.

---

## 15. Anexo · Relación con el banco general

| Documento | Preguntas | Enfoque |
|---|---:|---|
| `docs/banco-preguntas-perfiles-simulados.md` | 547 | Consulta, exploración, conteos, comparaciones |
| `docs/banco-preguntas-analisis-profundo.md` | 136 | 121 de bloques + 15 de método y gobernanza |
| **Total** | **683** | Dos capas complementarias |

**Cómo combinarlos:** usar el banco general para probar la interfaz, las tools
básicas y la abstención; usar este banco para probar la capacidad analítica y
la gobernanza del resultado. Una pregunta profunda puede empezar con una
consulta simple del banco general y terminar en un ranking o escenario de este
documento.

**Estado:** banco inicial de análisis profundo. No todos los métodos están
implementados ni todos los datos existen. El objetivo es definir la demanda
analítica antes de construir.

---

**Fecha:** 2026-11-27.
**Documento complementario:** [`docs/banco-preguntas-perfiles-simulados.md`](banco-preguntas-perfiles-simulados.md).
**Estado:** hipótesis de trabajo; validar con expertos y usuarios antes de
convertir cada bloque en producto.

