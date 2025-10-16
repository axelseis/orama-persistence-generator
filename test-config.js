#!/usr/bin/env node
/**
 * Script de prueba para verificar la configuración del generador de embeddings
 * Este script verifica que todo esté configurado correctamente sin ejecutar la generación real
 */

import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'

const DOCS_PATH = '../penpot/docs/user-guide'
const OUTPUT_DIR = './public'

async function testConfiguration() {
  console.log('🧪 Probando configuración del generador de embeddings...\n')
  
  // 1. Verificar documentación
  try {
    await fs.access(DOCS_PATH)
    console.log(`✅ Documentación encontrada en: ${DOCS_PATH}`)
    
    // Contar archivos .njk
    const files = await glob('**/*.njk', { cwd: DOCS_PATH, nodir: true })
    console.log(`✅ Encontrados ${files.length} archivos .njk`)
    
    if (files.length === 0) {
      console.log('⚠️  No se encontraron archivos .njk en la documentación')
    } else {
      console.log(`📄 Primeros archivos encontrados:`)
      files.slice(0, 5).forEach(file => console.log(`   - ${file}`))
      if (files.length > 5) {
        console.log(`   ... y ${files.length - 5} más`)
      }
    }
  } catch (error) {
    console.error(`❌ No se encontró la documentación en: ${DOCS_PATH}`)
    console.error('Asegúrate de que la documentación de Penpot esté clonada en ../penpot/')
    return false
  }

  // 2. Verificar dependencias
  console.log('\n📦 Verificando dependencias...')
  const dependencies = [
    'openai', 'cheerio', 'gray-matter', 'glob', 
    'slugify', 'p-limit', 'mkdirp', 'dotenv'
  ]
  
  try {
    const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'))
    const devDeps = packageJson.devDependencies || {}
    
    for (const dep of dependencies) {
      if (devDeps[dep]) {
        console.log(`✅ ${dep}: ${devDeps[dep]}`)
      } else {
        console.log(`❌ ${dep}: No instalado`)
        return false
      }
    }
  } catch (error) {
    console.error('❌ Error leyendo package.json:', error.message)
    return false
  }

  // 3. Verificar directorio de salida
  console.log('\n📁 Verificando directorio de salida...')
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true })
    console.log(`✅ Directorio de salida creado: ${OUTPUT_DIR}`)
  } catch (error) {
    console.error(`❌ Error creando directorio ${OUTPUT_DIR}:`, error.message)
    return false
  }

  // 4. Verificar API key
  console.log('\n🔑 Verificando configuración de API key...')
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY no está configurada')
    console.log('   Para generar embeddings reales, configura:')
    console.log('   export OPENAI_API_KEY="tu-api-key"')
    console.log('   O crea un archivo .env con: OPENAI_API_KEY=tu-api-key')
  } else {
    console.log('✅ OPENAI_API_KEY está configurada')
  }

  // 5. Verificar scripts
  console.log('\n📜 Verificando scripts...')
  try {
    await fs.access('./embeddings-generator/penpot_embeddings_pipeline_node.js')
    console.log('✅ Script principal encontrado')
    
    await fs.access('./embeddings-generator/generate-embeddings.js')
    console.log('✅ Script wrapper encontrado')
  } catch (error) {
    console.error('❌ Scripts no encontrados:', error.message)
    return false
  }

  console.log('\n🎉 ¡Configuración verificada exitosamente!')
  console.log('\n📋 Próximos pasos:')
  console.log('1. Configura tu API key de OpenAI:')
  console.log('   export OPENAI_API_KEY="tu-api-key"')
  console.log('2. Ejecuta la generación de embeddings:')
  console.log('   npm run generate-embeddings')
  
  return true
}

testConfiguration().catch(err => {
  console.error('❌ Error en la prueba:', err)
  process.exit(1)
})
