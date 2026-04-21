/**
 * Pre-download the embedding model for offline/air-gapped use.
 * Usage: npx tsx scripts/download-model.ts [model-name]
 */

import { EmbeddingModel } from '../src/embeddings/model';

async function main() {
  const modelName = process.argv[2] || 'nomic-ai/nomic-embed-text-v1.5';

  console.log(`Downloading embedding model: ${modelName}`);
  console.log('This may take a few minutes (model is ~130MB)...');

  const embedder = new EmbeddingModel({ model: modelName });

  try {
    await embedder.load();
    // Run a dummy embedding to force full model download
    await embedder.embedOne('hello world');
    console.log('Model downloaded and verified successfully.');
  } catch (err) {
    console.error('Failed to download model:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
