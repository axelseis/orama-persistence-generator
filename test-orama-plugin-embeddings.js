#!/usr/bin/env node
import { create, insert, search } from '@orama/orama'
import { pluginEmbeddings } from '@orama/plugin-embeddings'
import '@tensorflow/tfjs-node' // Or any other appropriate TensorflowJS backend

async function main() {
  const plugin = await pluginEmbeddings({
    embeddings: {
      // Property used to store generated embeddings. Must be defined in the schema.
      defaultProperty: 'embeddings',
      onInsert: {
        // Generate embeddings at insert-time.
        // Turn off if you're inserting documents with embeddings already generated.
        generate: true,
        // Properties to use for generating embeddings at insert time.
        // These properties will be concatenated and used to generate embeddings.
        properties: ['description'],
        verbose: true,
      }
    }
  })
  // Wrap hooks to ensure Orama awaits them (compiled functions are not AsyncFunction)
  if (typeof plugin.beforeSearch === 'function') {
    const originalBeforeSearch = plugin.beforeSearch
    plugin.beforeSearch = async (...args) => originalBeforeSearch(...args)
  }
  if (typeof plugin.beforeInsert === 'function') {
    const originalBeforeInsert = plugin.beforeInsert
    plugin.beforeInsert = async (...args) => originalBeforeInsert(...args)
  }

  const db = create({
    schema: {
      description: 'string',
      // Orama generates 512-dimensions vectors.
      // When using this plugin, use `vector[512]` as a type.
      embeddings: 'vector[512]'
    },
    plugins: [plugin]
  })

  console.log('Plugin hooks:', Object.keys(plugin))
  console.log('beforeSearch hooks:', db.beforeSearch?.length, db.beforeSearch?.map((fn) => fn.name))

  // When using this plugin, document insertion becomes async
  await insert(db, { description: 'The quick brown fox jumps over the lazy dog' })
  await insert(db, { description: "I've seen a lazy dog dreaming of jumping over a quick brown fox" })

  // Sanity-check beforeSearch hook wiring
  const probeParams = { term: 'Dreaming of a quick brown fox', mode: 'vector' }
  if (db.beforeSearch?.[0]) {
    await db.beforeSearch[0](db, probeParams, 'english')
    console.log('Probe vector keys:', Object.keys(probeParams.vector || {}))
  } else {
    console.warn('No beforeSearch hook registered on db')
  }

  // When using this plugin, search becomes async
  const results = await search(db, {
    term: 'Dreaming of a quick brown fox',
    mode: 'vector',
    similarity: 0.7
  })

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error('❌ Plugin embeddings test failed:', error)
  process.exit(1)
})
