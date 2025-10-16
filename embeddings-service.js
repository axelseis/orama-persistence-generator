#!/usr/bin/env node
/**
 * Embeddings Service Module
 * 
 * This module handles all embeddings and database operations:
 * - OpenAI client initialization
 * - Text embedding generation
 * - Orama database operations
 * - Database persistence and test searches
 * - Complete embeddings pipeline orchestration
 */

import OpenAI from 'openai'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import { create, insert, search } from '@orama/orama'
import { persist } from '@orama/plugin-data-persistence'
import { generateChunks } from './penpot_chunks_generator.js'

// Configurar dotenv para cargar desde el directorio correcto
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

// -----------------------------
// Database Configuration
// -----------------------------
const VEC_DIM = 1536  // ada-002 output dimension
const EMBEDDINGS_MODEL = 'text-embedding-ada-002'

// -----------------------------
// Database Schema
// -----------------------------
const ORAMA_SCHEMA = {
  id: 'string',
  pageId: 'string',
  url: 'string',
  sourcePath: 'string',
  lang: 'string',
  version: 'string',
  breadcrumbs: 'string',
  sectionLevel: 'number',
  sectionId: 'string',
  heading: 'string',
  hasCode: 'boolean',
  codeLangs: 'string',
  text: 'string',
  summary: 'string',
  isDefinition: 'boolean',
  tokens: 'number',
  embedding: 'vector[1536]',
  vectorDim: 'number',
  searchableText: 'string',
  links: 'string',
  images: 'string'
}

// -----------------------------
// Database Instance
// -----------------------------
let oramaDB = null

// -----------------------------
// OpenAI Client
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// -----------------------------
// Embeddings Operations
// -----------------------------

/**
 * Generate embeddings for the given text using OpenAI's ada-002 model
 * @param {string} text - The text to generate embeddings for
 * @returns {Promise<number[]>} The embedding vector
 */
async function getEmbedding(text) {
  const input = text.replace(/\s+/g, ' ').trim()
  if (!input) return new Array(VEC_DIM).fill(0)
  
  const resp = await openai.embeddings.create({
    model: EMBEDDINGS_MODEL,
    input
  })
  
  const v = resp.data?.[0]?.embedding
  if (!v) throw new Error('No embedding returned')
  return v
}

/**
 * Check if OpenAI API key is configured
 * @returns {boolean} True if API key is available
 */
function isApiKeyConfigured() {
  return !!process.env.OPENAI_API_KEY
}

/**
 * Get the vector dimension used by the embeddings model
 * @returns {number} The vector dimension
 */
function getVectorDimension() {
  return VEC_DIM
}

/**
 * Get the embeddings model name
 * @returns {string} The model name
 */
function getEmbeddingsModel() {
  return EMBEDDINGS_MODEL
}

// -----------------------------
// Database Operations
// -----------------------------

/**
 * Initialize the Orama database with the configured schema
 * @returns {Promise<void>}
 */
async function initializeOramaDB() {
  console.log('🗄️ Initializing Orama database...')
  
  oramaDB = await create({
    schema: ORAMA_SCHEMA
  })
  
  console.log('✅ Orama database initialized successfully')
}

/**
 * Add a chunk to the Orama database
 * @param {Object} chunk - The chunk data to add
 * @returns {Promise<void>}
 */
async function addChunkToOrama(chunk) {
  if (!oramaDB) {
    throw new Error('Orama database not initialized')
  }
  
  // Convert arrays to strings for Orama storage
  const chunkForOrama = {
    ...chunk,
    breadcrumbs: JSON.stringify(chunk.breadcrumbs),
    codeLangs: JSON.stringify(chunk.codeLangs),
    links: JSON.stringify(chunk.links),
    images: JSON.stringify(chunk.images)
  }
  
  try {
    await insert(oramaDB, chunkForOrama)
    console.log(`📝 Added chunk to Orama: ${chunk.heading}`)
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`⚠️  Chunk already exists, skipping: ${chunk.heading} (ID: ${chunk.id})`)
    } else {
      throw error
    }
  }
}


/**
 * Generate a JSON representation of the database using Orama's persist function
 * @returns {Promise<Object>} The persisted database data as JSON
 */
async function generatePersistJson() {
  if (!oramaDB) {
    throw new Error('Orama database not initialized')
  }
  
  console.log('💾 Generating persist JSON from Orama database...')
  
  try {
    const persistedData = await persist(oramaDB)
    console.log('✅ Persist JSON generated successfully')
    return persistedData
  } catch (error) {
    console.error('❌ Error generating persist JSON:', error.message)
    throw error
  }
}

/**
 * Complete embeddings pipeline: generate chunks, add to database, and generate persist JSON
 * @param {string} docsRoot - Path to the documentation root directory
 * @param {string} pattern - Glob pattern for files to process
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} The persisted database data
 */
async function runEmbeddingsPipeline(docsRoot, pattern, options) {
  console.log('🚀 Starting complete embeddings pipeline...')
  
  // Initialize database
  await initializeOramaDB()
  
  // Generate chunks
  console.log('📚 Generating chunks from documentation...')
  const { pages, chunks } = await generateChunks(docsRoot, pattern, options)
  
  // Add chunks to database
  console.log('💾 Adding chunks to database...')
  for (const chunk of chunks) {
    await addChunkToOrama(chunk)
  }
  
  // Generate persist JSON
  console.log('💾 Generating persist JSON...')
  const persistData = await generatePersistJson()
  
  // Show persist data statistics
  if (persistData && persistData.data) {
    const dataLength = Object.keys(persistData.data).length
    console.log(`📊 Database statistics:`)
    console.log(`   - Documents in database: ${dataLength}`)
    console.log(`   - Vector dimensions: ${persistData.schema?.embedding?.dimension || 'N/A'}`)
  }
  
  console.log('🎉 Embeddings pipeline completed successfully!')
  
  return persistData
}

// -----------------------------
// Export Functions
// -----------------------------
export {
  getEmbedding,
  isApiKeyConfigured,
  getVectorDimension,
  getEmbeddingsModel,
  initializeOramaDB,
  addChunkToOrama,
  generatePersistJson,
  runEmbeddingsPipeline,
  VEC_DIM,
  EMBEDDINGS_MODEL,
  ORAMA_SCHEMA
}
