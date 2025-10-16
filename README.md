# Orama Persistence Generator

A tool for generating compressed persistence files for Orama databases with vector embeddings, designed to be used with the `@orama/plugin-data-persistence` plugin in browser environments.

## Overview

This project generates a `.zip` file containing a complete Orama database with vector embeddings that can be restored using Orama's data persistence plugin. The generated persistence file uses binary format (Orama's default) for optimal compression, reducing file size from ~12MB (JSON) to ~7MB (binary).

## Features

- **Configurable Embedding Models**: Support for OpenAI embedding models and Orama's built-in embeddings
- **Binary Persistence**: Generates compressed binary files for optimal browser performance
- **Flexible Input**: Processes HTML or NJK files from configurable local directories
- **Browser-Ready**: Generated files are optimized for browser environments

## Installation

### 1. Install dependencies
```bash
npm install
```

### 2. Configure API Keys
```bash
# Copy the example file
cp env.example .env

# Edit .env and configure your API keys
OPENAI_API_KEY=your-openai-api-key-here
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# OpenAI API Key (required for OpenAI embeddings)
OPENAI_API_KEY=your-api-key-here

# Embedding Model Configuration
EMBEDDING_MODEL=openai  # Options: 'openai' or 'orama'
OPENAI_MODEL=text-embedding-ada-002  # OpenAI model for embeddings

# Processing Configuration
LANG=en
VERSION=local
```

### Embedding Model Options

- **OpenAI Models**: Uses OpenAI's embedding API with configurable models
- **Orama Built-in**: Uses Orama's native embedding capabilities

## Usage

### Generate Persistence File (Recommended)
```bash
npm run generate-embeddings
```

### Run Directly
```bash
node generate-embeddings.js
```

### Run with Custom Parameters
```bash
node penpot_chunks_generator.js ../docs/user-guide "**/*.{html,njk}" --out ./public --lang en --version local
```

## Generated Files

The script generates a compressed persistence file in the `public/` directory:

- **`penpotRagToolContents.zip`**: Binary persistence file containing the complete Orama database with embeddings

## Data Structure

The generated persistence file contains:

### Pages Metadata
```json
{
  "id": "page-slug",
  "path": "relative/path/to/file.html",
  "url": "https://example.com/page/",
  "title": "Page Title",
  "description": "Page description",
  "lang": "en",
  "version": "local",
  "sectionCount": 5,
  "headings": ["H2", "H3", ...],
  "kind": "guide|tutorial|reference",
  "searchableText": "full text for search"
}
```

### Chunks with Embeddings
```json
{
  "id": "page-slug#section-id",
  "pageId": "page-slug",
  "url": "https://example.com/page/#section",
  "sourcePath": "relative/path/to/file.html",
  "lang": "en",
  "version": "local",
  "breadcrumbs": ["Page", "H2 Section", "H3 Section"],
  "sectionLevel": 2,
  "sectionId": "section-id",
  "heading": "Section title",
  "text": "Section content",
  "summary": "Section summary",
  "hasCode": true,
  "codeLangs": ["javascript", "css"],
  "links": [{"text": "Link", "href": "/url"}],
  "images": [{"alt": "Description", "src": "/image.png"}],
  "tokens": 150,
  "embedding": [0.1, 0.2, ...], // Vector of configurable dimensions
  "vectorDim": 1536,
  "searchableText": "full text for embeddings"
}
```

## Advanced Configuration

### Script Parameters

- `docsRoot`: Root directory of documentation (default: `../docs/user-guide`)
- `pattern`: File pattern to process (default: `**/*.{html,njk}`)
- `--out`: Output directory (default: `./public`)
- `--lang`: Language (default: `en`)
- `--version`: Version (default: `local`)
- `--baseUrl`: Base URL for links (default: `https://example.com/`)

### Embedding Model Configuration

#### OpenAI Models
```bash
EMBEDDING_MODEL=openai
OPENAI_MODEL=text-embedding-ada-002  # or text-embedding-3-small, text-embedding-3-large
```

#### Orama Built-in Embeddings
```bash
EMBEDDING_MODEL=orama
```

## Browser Integration

To use the generated persistence file in a browser environment:

```javascript
import { create, insertMultiple } from '@orama/orama'
import { restore } from '@orama/plugin-data-persistence'

// Load the persistence file
const response = await fetch('./penpotRagToolContents.zip')
const arrayBuffer = await response.arrayBuffer()

// Restore the database
const db = await restore(arrayBuffer)

// Search the restored database
const results = await search(db, {
  term: 'your search query',
  limit: 10
})
```

## Troubleshooting

### Error: "Missing OPENAI_API_KEY"
Configure the environment variable:
```bash
export OPENAI_API_KEY="your-api-key"
```

### Error: "Documentation not found"
Verify that the documentation is available in `../docs/user-guide/`

### Dependency Errors
Reinstall dependencies:
```bash
npm install
```

### Large File Sizes
The binary format significantly reduces file size compared to JSON. If you need even smaller files, consider:
- Reducing the number of processed files
- Adjusting chunk sizes
- Using different embedding models

## Performance Notes

- **Binary Format**: Reduces file size by ~40% compared to JSON
- **Browser Optimization**: Generated files are optimized for browser environments
- **Memory Efficient**: Uses streaming for large file processing
- **Configurable Compression**: Supports different compression levels

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details