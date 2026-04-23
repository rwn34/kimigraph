/**
 * Embedding model wrapper using @huggingface/transformers.
 * Lazy-loads nomic-embed-text-v1.5 and caches it in memory.
 */

import * as path from 'path';
import * as os from 'os';

let transformersLib: any = null;

function loadTransformers(): { pipeline: any; env: any } {
  if (transformersLib) return transformersLib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    transformersLib = require('@huggingface/transformers');
  } catch {
    throw new Error(
      '@huggingface/transformers is not installed. ' +
      'Install it with: npm install @huggingface/transformers ' +
      'Or disable embeddings in your KimiGraph config.'
    );
  }
  return transformersLib;
}

const DEFAULT_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const EMBEDDING_DIM = 768;
const DEFAULT_BATCH_SIZE = 32;

/** Configure Transformers.js to use local cache. */
function setupCacheDir(): void {
  const cacheDir = path.join(os.homedir(), '.kimigraph', 'models');
  const { env } = loadTransformers();
  env.cacheDir = cacheDir;
}

export interface EmbedderOptions {
  model?: string;
  batchSize?: number;
}

export class EmbeddingModel {
  private embedder: any | null = null;
  private modelName: string;
  private batchSize: number;
  private loading: Promise<void> | null = null;

  constructor(opts: EmbedderOptions = {}) {
    this.modelName = opts.model ?? DEFAULT_MODEL;
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    setupCacheDir();
  }

  /** Ensure the model is loaded. */
  async load(): Promise<void> {
    if (this.embedder) return;
    if (this.loading) return this.loading;

    this.loading = this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    try {
      const { pipeline } = loadTransformers();
      this.embedder = await pipeline('feature-extraction', this.modelName, {
        dtype: 'fp32',
      });
    } catch (err) {
      this.loading = null;
      throw new Error(
        `Failed to load embedding model "${this.modelName}". ` +
        `Run "npm run download-model" to pre-download it. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Embed a single text string. */
  async embedOne(text: string): Promise<Float32Array> {
    await this.load();
    const result = await this.embedder(text, { pooling: 'mean', normalize: true });
    return new Float32Array(result.data);
  }

  /** Embed multiple texts in batches for efficiency. */
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    await this.load();
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const tensor = await this.embedder(batch, { pooling: 'mean', normalize: true });

      // Transformers.js returns a single tensor with shape [batchSize, 768]
      const data = new Float32Array(tensor.data);
      const dims = tensor.dims; // e.g. [2, 768]
      const batchSize = dims[0];
      const dimSize = dims[1];

      for (let b = 0; b < batchSize; b++) {
        const start = b * dimSize;
        results.push(data.slice(start, start + dimSize));
      }
    }

    return results;
  }

  get dimension(): number {
    return EMBEDDING_DIM;
  }

  get model(): string {
    return this.modelName;
  }
}

/** Global singleton embedder instance. */
let globalEmbedder: EmbeddingModel | null = null;

export function getEmbedder(opts?: EmbedderOptions): EmbeddingModel {
  if (!globalEmbedder) {
    globalEmbedder = new EmbeddingModel(opts);
  }
  return globalEmbedder;
}

export function resetEmbedder(): void {
  globalEmbedder = null;
}
