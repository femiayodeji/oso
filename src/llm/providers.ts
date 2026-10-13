import type { AppSettings, Provider } from '../types';

// The only place default model ids live. Users can override the model in Settings.
// Defaults are the free option where the provider has one, otherwise its low-cost model.
export const PROVIDERS: Record<Provider, { label: string; baseUrl: string; defaultModel: string }> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-flash-latest',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-5-5',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6.1-sol',
  },
};

export function resolveModel(settings: AppSettings): string {
  return settings.model.trim() || PROVIDERS[settings.provider].defaultModel;
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

// An empty base URL, or one left over from another provider, falls back to the provider's own.
export function resolveBaseUrl(settings: AppSettings): string {
  const own = PROVIDERS[settings.provider].baseUrl;
  if (settings.provider === 'anthropic') return own;
  const custom = normalize(settings.baseUrl);
  if (!custom) return own;
  const belongsToOther = (Object.keys(PROVIDERS) as Provider[]).some(
    (p) => p !== settings.provider && PROVIDERS[p].baseUrl === custom,
  );
  return belongsToOther ? own : custom;
}
