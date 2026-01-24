#!/usr/bin/env node
/**
 * Penpot Chunks Generator
 * 
 * This module generates chunks from Penpot documentation:
 * 1) Scans a docs folder for .njk files (configurable directory filtering)
 * 2) Extracts front-matter (title/desc) and parses HTML body
 * 3) Cleans boilerplate (nav/header/footer/script/style/TOC)
 * 4) Splits per H1→H3 sections and chunks long sections with overlap
 * 5) Builds PageDoc[] and ChunkDoc[] with rich metadata
 * 6) Generates embeddings for each chunk
 * 
 * Usage
 *  - Set env: OPENAI_API_KEY=...
 *  - import { generateChunks } from './penpot_chunks_generator.js'
 *  - const { pages, chunks } = await generateChunks(docsRoot, pattern, options)
 *
 * Requires (install):
 *  npm i openai cheerio gray-matter glob slugify p-limit
 */

import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { load } from 'cheerio'
import { glob } from 'glob'
import slugify from 'slugify'
import pLimit from 'p-limit'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import { getEmbedding, EMBEDDING_MODEL, OPENAI_MODEL, VEC_DIM } from './embeddings-service.js'

// Configurar dotenv para cargar desde el directorio correcto
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

// -----------------------------
// Config (tune as needed)
// -----------------------------
const MAX_TOKENS_PER_CHUNK = 360     // target ~200–400 tokens (HTML → text)
const OVERLAP_TOKENS = 60            // 10–20% overlap
// VEC_DIM, EMBEDDING_MODEL, and OPENAI_MODEL imported from modules
const CONCURRENCY = 2                // API concurrency

// Configurable directory filtering - set to true to process only specific directories
const PROCESS_ONLY_SPECIFIC_DIRS = false
const ALLOWED_DIRECTORIES = ['components']

// Quick token estimator (rough). You can swap for tiktoken if you prefer.
function estimateTokens(s) {
  if (!s) return 0
  // Simple heuristic: ~4 chars per token on average for English docs
  return Math.ceil(s.length / 4)
}

function splitIntoSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z¡¿\d\[\(])/)
    .filter(Boolean)
}

function chunkByTokens(text, maxTokens = MAX_TOKENS_PER_CHUNK, overlapTokens = OVERLAP_TOKENS) {
  const sentences = splitIntoSentences(text)
  const chunks = []
  let buffer = []
  let tokens = 0

  const flush = () => {
    if (!buffer.length) return
    chunks.push(buffer.join(' ').trim())
    buffer = []
    tokens = 0
  }

  for (const s of sentences) {
    const t = estimateTokens(s)
    if (tokens + t > maxTokens) {
      flush()
      // Start new buffer with overlap from previous chunk
      // We rebuild overlap by taking tail sentences until we reach overlapTokens
      let backTokens = 0
      let i = chunks.length ? Math.max(0, buffer.length - 1) : 0
      // buffer is empty here; we need overlap from last emitted chunk
      if (chunks.length) {
        const prev = chunks[chunks.length - 1]
        const prevSentences = splitIntoSentences(prev)
        const overlap = []
        for (let j = prevSentences.length - 1; j >= 0; j--) {
          const st = prevSentences[j]
          const tt = estimateTokens(st)
          if (backTokens + tt > overlapTokens) break
          overlap.unshift(st)
          backTokens += tt
        }
        if (overlap.length) {
          buffer.push(overlap.join(' '))
          tokens = estimateTokens(buffer.join(' '))
        }
      }
    }
    buffer.push(s)
    tokens += t
  }
  flush()
  return chunks
}

function normalizeWhitespace(text) {
  return text
    .replace(/\u00A0/g, ' ') // nbsp → space
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toSlug(str) {
  return slugify(str || '', {
    lower: true,
    strict: true
  })
}

function cleanHtml($) {
  // remove boilerplate-ish areas
  $('nav, header, footer, script, style, aside.toc, .toc, .breadcrumb').remove()
  return $
}

function htmlToText($, root) {
  const textNodes = []
  const walker = (el) => {
    const $el = $(el)
    const tag = $el.prop('tagName')?.toLowerCase() || ''
    if (tag === 'script' || tag === 'style' || tag === 'nav' || tag === 'header' || tag === 'footer') return

    if (tag === 'pre') {
      // keep code blocks but mark them as code; do not include huge blobs if unnecessary
      const code = $el.text().replace(/\s+$/,'')
      if (code) textNodes.push('```\n' + code + '\n```')
      return
    }

    if ($el.children().length === 0) {
      const t = $el.text()
      if (t && t.trim()) textNodes.push(t.trim())
      return
    }

    $el.contents().each((_, child) => walker(child))
  }
  walker(root)
  const out = textNodes.join('\n')
  return normalizeWhitespace(out)
}

function collectSections($) {
  // Collect H1/H2/H3 with their content until next header of same/higher level
  const headers = $('h1, h2, h3').toArray().map(el => ({
    el,
    level: Number($(el).prop('tagName').substring(1)),
    id: $(el).attr('id') || toSlug($(el).text()),
    text: $(el).text().trim()
  }))
  const sections = []
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    const next = headers.slice(i + 1).find(x => x.level <= h.level)
    const start = h.el
    let nodes = []
    let n = $(start).next()
    while (n.length && (!next || n[0] !== next.el)) {
      nodes.push(n[0])
      n = n.next()
    }
    sections.push({
      level: h.level,
      id: h.id,
      heading: h.text,
      nodes
    })
  }
  return sections
}

function makeUrl(baseUrl, pagePathRel, sectionId) {
  if (!baseUrl) return ''
  const noExt = pagePathRel.replace(/\.(njk|html?)$/i, '')
  const parts = noExt.split(/[\/]+/).filter(Boolean)
  const filename = parts.pop() || ''
  const dir = parts.join('/')
  // If filename is index -> use the directory URL, else use filename as a leaf with trailing slash
  const pagePath = filename.toLowerCase() === 'index'
    ? (dir ? `${dir}/` : '')
    : (dir ? `${dir}/${filename}/` : `${filename}/`)
  const base = baseUrl.replace(/\/?$/, '/') + pagePath
  return sectionId ? `${base}#${sectionId}` : base
}

// OpenAI client and getEmbedding function moved to embeddings-service.js module

// Orama database operations moved to orama-database.js module

// -----------------------------
// Main
// -----------------------------
/**
 * Generate chunks from Penpot documentation
 * @param {string} docsRoot - Path to the documentation root directory
 * @param {string} pattern - Glob pattern for files to process
 * @param {Object} options - Configuration options
 * @param {string|null} options.baseUrl - Base URL for generated links
 * @returns {Promise<{pages: Array, chunks: Array}>} Generated pages and chunks
 */
async function generateChunks(docsRoot = '../penpot/docs/user-guide', pattern = '**/*.njk', options = {}) {
  const { baseUrl = 'https://help.penpot.app/user-guide/' } = options

  // Only require OpenAI API key if using OpenAI embeddings
  if (EMBEDDING_MODEL === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY env var')
  }

  let files = await glob(pattern, { cwd: docsRoot, nodir: true })
  
  // Apply directory filtering if enabled
  if (PROCESS_ONLY_SPECIFIC_DIRS) {
    console.log(`🔍 Filtering files to only process directories: ${ALLOWED_DIRECTORIES.join(', ')}`)
    const originalCount = files.length
    files = files.filter(file => {
      return ALLOWED_DIRECTORIES.some(dir => file.includes(dir))
    })
    console.log(`📁 Filtered from ${originalCount} to ${files.length} files`)
  }

  console.log(`📁 Found ${files.length} files to process`)
  console.log(`📂 Source: ${docsRoot}`)
  console.log(`🔧 Concurrency: ${CONCURRENCY}`)
  console.log(`🎯 Max tokens per chunk: ${MAX_TOKENS_PER_CHUNK}`)
  console.log(`🗄️ Using Orama database for storage`)
  console.log('📚 Starting document processing...\n')

  const pages = []
  const chunks = []

  const limit = pLimit(CONCURRENCY)

  for (let i = 0; i < files.length; i++) {
    const rel = files[i]
    const progress = `[${i + 1}/${files.length}]`
    console.log(`${progress} 📄 Processing: ${rel}`)
    const full = path.join(docsRoot, rel)
    const raw = await fs.readFile(full, 'utf8')
    const fm = matter(raw)
    const front = fm.data || {}
    const ext = path.extname(rel).toLowerCase()
    const html = (ext === '.md' || ext === '.markdown')
      ? marked.parse(fm.content || '')
      : (fm.content || '')

    const $ = cleanHtml(load(html))

    // PAGE
    const pageTitle = front.title?.toString().trim() || $('h1').first().text().trim() || path.basename(rel, path.extname(rel))
    const pageDesc = front.desc?.toString().trim() || ''
    const pageId = toSlug(pageTitle || rel)
    const pageUrl = (front.url || '').toString() || makeUrl(baseUrl, rel, '')

    const headings = $('h2, h3').map((_, el) => $(el).text().trim()).get().filter(Boolean)
    
    console.log(`  📝 Title: ${pageTitle}`)
    console.log(`  🏷️  Sections: ${headings.length}`)

    const pageDoc = {
      id: pageId,
      path: rel,
      url: pageUrl,
      title: pageTitle,
      description: pageDesc || undefined,
      sectionCount: 0,
      headings,
      keywords: undefined,
      updatedAt: front.updatedAt || undefined
    }

    // SECTIONS → CHUNKS
    const sections = collectSections($)
    console.log(`  🔄 Processing ${sections.length} sections...`)

    // Derive hierarchy context (H1 content used as pageTitle)
    let chunkCount = 0
    for (const sec of sections) {
      const $frag = load('<div></div>')
      const container = $frag('div')
      sec.nodes.forEach(node => container.append($(node)))

      const text = htmlToText($frag, container)
      if (!text) continue

      const baseChunk = {
        pageId: pageId,
        url: makeUrl(baseUrl, rel, sec.id)
      }

      const tokenCount = estimateTokens(text)

      if (tokenCount <= MAX_TOKENS_PER_CHUNK) {
        const id = `${pageId}#${sec.id}`
        const tokens = estimateTokens(text)

        console.log(`    🔗 Generating embedding for: ${sec.heading} (${tokens} tokens)`)
        
        // Only generate embeddings manually for OpenAI model
        let embedding = null
        if (EMBEDDING_MODEL === 'openai') {
          embedding = await limit(() => getEmbedding(text))
        }
        // For Orama, embeddings will be generated automatically by the plugin

        const chunk = {
          id,
          ...baseChunk,
          text,
          embedding
        }
        
        // Add chunk to chunks array
        chunks.push(chunk)
        chunkCount++
      } else {
        // Need to subdivide by tokens with overlap
        const parts = chunkByTokens(text)
        console.log(`    ✂️  Splitting large section "${sec.heading}" into ${parts.length} parts`)
        
        for (let idx = 0; idx < parts.length; idx++) {
          const pText = parts[idx]
          const headingPart = sec.heading + ` (part ${idx + 1})`
          
          console.log(`    🔗 Generating embedding for: ${headingPart} (${estimateTokens(pText)} tokens)`)
          
          // Only generate embeddings manually for OpenAI model
          let embedding = null
          if (EMBEDDING_MODEL === 'openai') {
            embedding = await limit(() => getEmbedding(pText))
          }
          // For Orama, embeddings will be generated automatically by the plugin

          const chunk = {
            id: `${pageId}#${sec.id}__${idx + 1}`,
            ...baseChunk,
            text: pText,
            embedding
          }
          
          // Add chunk to chunks array
          chunks.push(chunk)
          chunkCount++
        }
      }
    }

    pageDoc.sectionCount = chunks.filter(c => c.pageId === pageId).length
    pages.push(pageDoc)
    
    console.log(`  ✅ Completed: ${pageTitle} → ${chunkCount} chunks generated\n`)
  }

  console.log('\n🎉 Document processing completed successfully!')
  console.log(`📄 Pages processed: ${pages.length}`)
  console.log(`🧩 Chunks created: ${chunks.length}`)
  console.log(`🔢 Vector dimensions: ${VEC_DIM}`)
  console.log(`📊 Average chunks per page: ${Math.round(chunks.length / pages.length)}`)
  
  return { pages, chunks }
}

// -----------------------------
// Export Functions
// -----------------------------
export { generateChunks }
