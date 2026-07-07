const axios = require('axios');

/**
 * embeddingService — optional dense-vector layer for semantic matching. When
 * EMBEDDINGS_ENABLED=true it computes embeddings via Jina AI's FREE embeddings
 * API and matchingService blends cosine similarity into the score. Default OFF,
 * so the MVP stays on lexical `$text` with no extra credential; this is the
 * drop-in slot for Atlas Vector Search later.
 *
 * Config (only needed when EMBEDDINGS_ENABLED=true):
 *   JINA_API_KEY  free key from https://jina.ai/embeddings
 *   EMBED_MODEL   default 'jina-embeddings-v3'
 */
const isEnabled = () =>
  process.env.EMBEDDINGS_ENABLED === 'true' && !!process.env.JINA_API_KEY;

/** Compute an embedding for text, or null if disabled/unavailable. */
const embed = async (text) => {
  if (!isEnabled() || !text) return null;
  try {
    const res = await axios.post(
      'https://api.jina.ai/v1/embeddings',
      {
        model: process.env.EMBED_MODEL || 'jina-embeddings-v3',
        task: 'text-matching',
        input: [String(text).slice(0, 2000)],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.JINA_API_KEY}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        timeout: 20000,
      }
    );
    const v = res.data?.data?.[0]?.embedding;
    return Array.isArray(v) && v.length ? v : null;
  } catch (err) {
    console.error('[embed] Jina failed:', err.response?.status || err.message);
    return null;
  }
};

/** Cosine similarity in [0,1] (clamped) for two equal-length vectors. */
const cosine = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.max(0, Math.min(1, (sim + 1) / 2)); // map [-1,1] → [0,1]
};

module.exports = { isEnabled, embed, cosine };
