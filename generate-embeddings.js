#!/usr/bin/env node
/**
 * Script wrapper to generate embeddings and create Orama persistence files
 * 
 * This script:
 * 1. Generates embeddings from local documentation files
 * 2. Saves them in the public directory as designRagToolContents.zip
 * 3. Automatically configures paths and parameters
 */

import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'
import { runEmbeddingsPipeline, getEmbedding, EMBEDDING_MODEL, OPENAI_MODEL } from './embeddings-service.js'
import { restore } from '@orama/plugin-data-persistence'
import { search } from '@orama/orama'

// Configure dotenv to load from the correct directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

const DOCS_PATH = process.env.DOCS_PATH || './test-docs'
const OUTPUT_DIR = process.env.OUTPUT_DIR || './public'
const OUTPUT_FILENAME = process.env.OUTPUT_FILENAME || 'designRagToolContents.zip'
const OUTPUT_FILE = path.join(OUTPUT_DIR, OUTPUT_FILENAME)
const PATTERN = process.env.DOCS_PATTERN || '**/*.html'

const OPTIONS = {
  baseUrl: 'https://example.com/user-guide/',
  lang: process.env.LANG || 'en',
  version: process.env.VERSION || 'local'
}

// Promisify compression functions
const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/**
 * Perform test searches using a restored Orama database instance
 * @param {string} persistFilePath - Path to the persisted JSON file
 * @returns {Promise<void>}
 */
async function performTestSearches(persistFilePath) {
  console.log('\n🔍 Performing test searches with restored database...')
  
  try {
    // Read the compressed persisted data
    console.log('📖 Reading compressed file...')
    const compressedData = await fs.readFile(persistFilePath)
    
    // Decompress the data
    console.log('🔄 Decompressing data...')
    const decompressedData = await gunzipAsync(compressedData)
    const persistData = JSON.parse(decompressedData.toString('utf8'))
    console.log('✅ Data decompressed successfully')
    
    // Restore the database from persisted data
    console.log('🔄 Restoring database from persisted data...')
    const restoredDB = await restore('binary', persistData)
    console.log('✅ Database restored successfully')
    
    const testQueries = [
      {
        query: 'tactile maximalism soft rounded bounce gel',
        expectedPath: 'tactile-maximalism.md'
      },
      {
        query: 'apothecary botanical vintage serif labels',
        expectedPath: 'apothecary-aesthetic.md'
      },
      {
        query: 'neobrutalism bold contrast oversized type',
        expectedPath: 'neobrutalism.md'
      },
      {
        query: 'glassmorphism translucent blur layers',
        expectedPath: 'glassmorphism.md'
      },
      {
        query: 'anti-ai crafting handmade texture paper',
        expectedPath: 'anti-ai-crafting.md'
      },
      {
        query: 'multi-device ux continuity responsive systems',
        expectedPath: 'multi-device-ux.md'
      },
      {
        query: 'kinetic typography animated text motion',
        expectedPath: 'kinetic-typography.md'
      },
      {
        query: 'organic minimalism earthy calm natural',
        expectedPath: 'organic-minimalism.md'
      },
      {
        query: 'pure steel metallic neon technical',
        expectedPath: 'pure-steel.md'
      },
      {
        query: 'narrative pop editorial storytelling',
        expectedPath: 'narrative-pop.md'
      }
    ]
    
    let hasFailures = false
    
    for (const test of testQueries) {
      console.log(`\n🔎 Searching for: "${test.query}"`)
      
      try {
        const results = await search(restoredDB, {
          mode: 'vector',
          vector: {
            value: await getEmbedding(test.query),
            property: 'embedding'
          },
          term: test.query,
          limit: 5,
          tolerance: 0.8
        })
        
        console.log(`   Found ${results.count} results:`)
        results.hits.forEach((hit, index) => {
          console.log(`   ${index + 1}. ${hit.document.heading} (${hit.score.toFixed(3)})`)
          console.log(`      Path: ${hit.document.sourcePath}`)
          console.log(`      Summary: ${hit.document.summary.substring(0, 100)}...`)
        })

        const matched = results.hits.some(hit => hit.document.sourcePath === test.expectedPath)
        if (!matched) {
          hasFailures = true
          console.warn(`   ⚠️ Expected top results to include: ${test.expectedPath}`)
        }
      } catch (error) {
        hasFailures = true
        console.error(`   ❌ Error searching for "${test.query}":`, error.message)
      }
    }

    if (hasFailures) {
      throw new Error('One or more test searches did not return the expected content.')
    }

    console.log('\n✅ Test searches completed')
  } catch (error) {
    console.error('❌ Error performing test searches:', error.message)
    throw error
  }
}

async function main() {
  console.log('🚀 Generando embeddings de la documentación de Penpot...')
  
  // Verificar que existe la documentación
  try {
    await fs.access(DOCS_PATH)
    console.log(`✅ Documentación encontrada en: ${DOCS_PATH}`)
  } catch (error) {
    console.error(`❌ No se encontró la documentación en: ${DOCS_PATH}`)
    console.error('Asegúrate de que la documentación de Penpot esté clonada en ../penpot/')
    process.exit(1)
  }

  // Verificar que existe la API key de OpenAI solo si es necesaria
  if (EMBEDDING_MODEL === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error('❌ Falta la variable de entorno OPENAI_API_KEY')
    console.error('Configúrala con: export OPENAI_API_KEY="tu-api-key"')
    process.exit(1)
  }

  // Crear directorio de salida si no existe
  const outputDir = path.dirname(OUTPUT_FILE)
  try {
    await fs.mkdir(outputDir, { recursive: true })
    console.log(`✅ Directorio de salida: ${outputDir}`)
  } catch (error) {
    console.error(`❌ Error creando directorio ${outputDir}:`, error.message)
    process.exit(1)
  }

  // Ejecutar el pipeline completo de embeddings
  try {
    const persistData = await runEmbeddingsPipeline(DOCS_PATH, PATTERN, OPTIONS)
    console.log('✅ Embeddings generados exitosamente!')
    
    // Guardar el archivo JSON persistido comprimido
    console.log('💾 Guardando archivo JSON persistido comprimido...')
    const jsonString = JSON.stringify(persistData, null, 2)
    const compressedData = await gzipAsync(jsonString)
    await fs.writeFile(OUTPUT_FILE, compressedData)
    console.log(`✅ Archivo comprimido guardado: ${OUTPUT_FILE}`)
    
    // Mostrar estadísticas del archivo
    const stats = await fs.stat(OUTPUT_FILE)
    const originalSize = Buffer.byteLength(jsonString, 'utf8')
    const compressionRatio = ((originalSize - stats.size) / originalSize * 100).toFixed(1)
    console.log(`📄 designRagToolContents.json: ${stats.size} bytes (comprimido)`)
    console.log(`📊 Tamaño original: ${originalSize} bytes`)
    console.log(`📊 Ratio de compresión: ${compressionRatio}%`)
    
    // Realizar búsquedas de prueba con la base de datos restaurada
    await performTestSearches(OUTPUT_FILE)
    
  } catch (error) {
    console.error('❌ Error ejecutando el pipeline de embeddings:', error.message)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})