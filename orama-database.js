#!/usr/bin/env node
/**
 * Orama Database Operations Module
 * 
 * This module handles all Orama database operations for the Penpot embeddings pipeline:
 * - Database initialization with schema
 * - Adding chunks to the database
 * - Performing test searches
 * - Database configuration and management
 */

import { create, insert, search } from '@orama/orama'
import { persist } from '@orama/plugin-data-persistence'

// -----------------------------
// Database Configuration
// -----------------------------
const VEC_DIM = 1536  // ada-002 output dimension

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
 * Perform test searches to validate the database
 * @param {Function} getEmbedding - Function to get embeddings for search queries
 * @returns {Promise<void>}
 */
async function performTestSearches(getEmbedding) {
  console.log('\n🔍 Performing test searches...')
  
  const testQueries = [
    'how to create a triangle',
    'how to create a component',
    'interface elements',
    'design components',
    'user interface',
    'penpot basics',
    'getting started'
  ]
  
  for (const query of testQueries) {
    console.log(`\n🔎 Searching for: "${query}"`)
    
    try {
      const results = await search(oramaDB, {
        mode: 'vector',
        vector: {
          value: await getEmbedding(query),
          property: 'embedding'
        },
        term: query,
        limit: 5,
        tolerance: 0.8
      })
      
      console.log(`   Found ${results.count} results:`)
      results.hits.forEach((hit, index) => {
        console.log(`   ${index + 1}. ${hit.document.heading} (${hit.score.toFixed(3)})`)
        console.log(`      Path: ${hit.document.sourcePath}`)
        console.log(`      Summary: ${hit.document.summary.substring(0, 100)}...`)
      })
    } catch (error) {
      console.error(`   ❌ Error searching for "${query}":`, error.message)
    }
  }
  
  console.log('\n✅ Test searches completed')
}

/**
 * Get the current database instance
 * @returns {Object|null} The Orama database instance
 */
function getDatabase() {
  return oramaDB
}

/**
 * Check if the database is initialized
 * @returns {boolean} True if database is initialized
 */
function isDatabaseInitialized() {
  return oramaDB !== null
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

// -----------------------------
// Export Functions
// -----------------------------
export {
  initializeOramaDB,
  addChunkToOrama,
  performTestSearches,
  getDatabase,
  isDatabaseInitialized,
  generatePersistJson,
  VEC_DIM,
  ORAMA_SCHEMA
}
