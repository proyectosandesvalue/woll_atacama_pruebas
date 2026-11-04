// scripts/ingest-dga-control-nivel.mjs
// Ejecución: node --env-file=.env.staging scripts/ingest-dga-control-nivel.mjs

import fs from "fs";
import csv from "csv-parser";
import { getDB } from "../server/db/pool.js";

async function main() {
  const db = await getDB();
  const results = [];
  const filePath = "./data/niveles_estaticos_pozos_historico_3.txt"; 

  console.log("Leyendo archivo CSV...");

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      console.log(`Archivo leído. Total de registros: ${results.length}`);
      
      let cargados = 0;
      let omitidos = 0;
      let errores = 0;

      for (const row of results) {
        try {
          // Limpiamos los datos
          const codigoEstacion = row["CODIGO ESTACION"].trim();
          const nombreEstacion = row["NOMBRE ESTACION"].trim();
          const fechaOriginal = row["Fecha"].trim();
          const nivelStr = row["Nivel"].trim();

          // Validamos que existan los datos mínimos
          if (!codigoEstacion || !fechaOriginal || !nivelStr) {
            omitidos++;
            continue;
          }

          // Convertir el nivel a número (por si viene con coma decimal)
          const valorNivel = parseFloat(nivelStr.replace(",", "."));
          if (isNaN(valorNivel)) {
            omitidos++;
            continue;
          }

          // Formatear fecha de DD/MM/YYYY a YYYY-MM-DD
          // Ejemplo: 06/04/1976 -> 1976-04-06
          const [dia, mes, anio] = fechaOriginal.split("/");
          if (!dia || !mes || !anio) {
            omitidos++;
            continue;
          }
          const fechaFormateada = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;

          // Insertar en Supabase
          await db.rpc("ingest_upsert_value", {
            p_indicator_id: "nivel_estatico_pozo",
            p_source_id: "dga",
            p_entity_id: `estacion:${codigoEstacion}`,
            p_entity_type: "estacion",
            p_entity_name: nombreEstacion,
            p_period_start: fechaFormateada,
            p_period_end: fechaFormateada,
            p_value: valorNivel,
            p_unit: "m",
            p_scenario: null,
            p_metadata: null,
          });
          
          cargados++;
          if (cargados % 500 === 0) {
            console.log(`  ✓ ${cargados} registros cargados...`);
          }

        } catch (err) {
          console.error(`❌ Error en estación ${row["CODIGO ESTACION"]}:`, err.message);
          errores++;
        }
      }

      console.log("\n=== RESUMEN DE INGESTA ===");
      console.log(`✅ Cargados con éxito: ${cargados}`);
      console.log(`⚠️  Omitidos (datos faltantes/nulos): ${omitidos}`);
      console.log(`❌ Errores: ${errores}`);
      
      // Refrescar la vista materializada para que las APIs lo detecten rápido
      try {
        console.log("Refrescando variable_availability...");
        await db.rpc("refresh_variable_availability");
        console.log("✓ Vista actualizada.");
      } catch (e) {
        console.warn("No se pudo refrescar la vista:", e.message);
      }

      process.exit(0);
    });
}
main();