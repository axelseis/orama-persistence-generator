# Penpot Embeddings Generator

Este repositorio contiene herramientas para generar embeddings vectoriales de la documentación de Penpot usando OpenAI, diseñado para alimentar sistemas RAG (Retrieval-Augmented Generation) locales.

## Configuración

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar API Key de OpenAI
```bash
# Copia el archivo de ejemplo
cp env.example .env

# Edita .env y configura tu API key
OPENAI_API_KEY=tu-api-key-real-aqui
```

### 3. Verificar documentación local
Asegúrate de que la documentación de Penpot esté disponible en:
```
../penpot/docs/user-guide/
```

## Uso

### Generar embeddings (método recomendado)
```bash
npm run generate-embeddings
```

### Ejecutar directamente
```bash
node generate-embeddings.js
```

### Ejecutar el script base con parámetros personalizados
```bash
node penpot_chunks_generator.js ../penpot/docs/user-guide "**/*.njk" --out ./public --lang es --version local
```

## Archivos generados

El script genera dos archivos en el directorio `public/`:

- **`pages.json`**: Metadatos de todas las páginas procesadas
- **`chunks.json`**: Chunks de texto con sus embeddings vectoriales

## Estructura de datos

### pages.json
```json
{
  "id": "page-slug",
  "path": "relative/path/to/file.njk",
  "url": "https://help.penpot.app/user-guide/page/",
  "title": "Título de la página",
  "description": "Descripción de la página",
  "lang": "es",
  "version": "local",
  "sectionCount": 5,
  "headings": ["H2", "H3", ...],
  "kind": "guide|tutorial|reference",
  "searchableText": "texto completo para búsqueda"
}
```

### chunks.json
```json
{
  "id": "page-slug#section-id",
  "pageId": "page-slug",
  "url": "https://help.penpot.app/user-guide/page/#section",
  "sourcePath": "relative/path/to/file.njk",
  "lang": "es",
  "version": "local",
  "breadcrumbs": ["Página", "Sección H2", "Sección H3"],
  "sectionLevel": 2,
  "sectionId": "section-id",
  "heading": "Título de la sección",
  "text": "Contenido de la sección",
  "summary": "Resumen de la sección",
  "hasCode": true,
  "codeLangs": ["javascript", "css"],
  "links": [{"text": "Enlace", "href": "/url"}],
  "images": [{"alt": "Descripción", "src": "/image.png"}],
  "tokens": 150,
  "embedding": [0.1, 0.2, ...], // Vector de 1536 dimensiones
  "vectorDim": 1536,
  "searchableText": "texto completo para embeddings"
}
```

## Configuración avanzada

### Parámetros del script base

- `docsRoot`: Directorio raíz de la documentación (default: `../penpot/docs/user-guide`)
- `pattern`: Patrón de archivos a procesar (default: `**/*.njk`)
- `--out`: Directorio de salida (default: `./public`)
- `--lang`: Idioma (default: `es`)
- `--version`: Versión (default: `local`)
- `--baseUrl`: URL base para enlaces (default: `https://help.penpot.app/user-guide/`)

### Variables de entorno

- `OPENAI_API_KEY`: API key de OpenAI (requerida)
- `OPENAI_MODEL`: Modelo de embeddings (default: `text-embedding-ada-002`)

## Troubleshooting

### Error: "Missing OPENAI_API_KEY"
Configura la variable de entorno:
```bash
export OPENAI_API_KEY="tu-api-key"
```

### Error: "No se encontró la documentación"
Verifica que la documentación esté en `../penpot/docs/user-guide/`

### Error de dependencias
Reinstala las dependencias:
```bash
npm install
```
