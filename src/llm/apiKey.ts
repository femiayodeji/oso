import * as SecureStore from 'expo-secure-store';

import { getSettings } from '../db/settings';
import type { Provider } from '../types';
import { PROVIDERS } from './providers';

// One key per provider, so switching providers never asks for a key again.
const LEGACY_KEY_NAME = 'oso_llm_api_key';

function keyName(provider: Provider): string {
  return `${LEGACY_KEY_NAME}_${provider}`;
}

// The single key from before per-provider keys belongs to the provider that was active.
async function moveLegacyKey(): Promise<void> {
  const legacy = await SecureStore.getItemAsync(LEGACY_KEY_NAME);
  if (legacy === null) return;
  const { provider } = await getSettings();
  if ((await SecureStore.getItemAsync(keyName(provider))) === null) {
    await SecureStore.setItemAsync(keyName(provider), legacy);
  }
  await SecureStore.deleteItemAsync(LEGACY_KEY_NAME);
}

let legacyMoved: Promise<void> | null = null;

function ensureLegacyMoved(): Promise<void> {
  legacyMoved ??= moveLegacyKey().catch(() => {
    legacyMoved = null;
  });
  return legacyMoved;
}

async function activeProvider(): Promise<Provider> {
  return (await getSettings()).provider;
}

// Without a provider, these act on the active one.
export async function getApiKey(provider?: Provider): Promise<string | null> {
  await ensureLegacyMoved();
  const value = await SecureStore.getItemAsync(keyName(provider ?? (await activeProvider())));
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function setApiKey(key: string, provider?: Provider): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await deleteApiKey(provider);
    return;
  }
  await ensureLegacyMoved();
  await SecureStore.setItemAsync(keyName(provider ?? (await activeProvider())), trimmed);
}

export async function deleteApiKey(provider?: Provider): Promise<void> {
  await ensureLegacyMoved();
  await SecureStore.deleteItemAsync(keyName(provider ?? (await activeProvider())));
}

export async function hasApiKey(provider?: Provider): Promise<boolean> {
  return (await getApiKey(provider)) !== null;
}

export async function providersWithKey(): Promise<Provider[]> {
  const all = Object.keys(PROVIDERS) as Provider[];
  const has = await Promise.all(all.map((p) => hasApiKey(p)));
  return all.filter((_, i) => has[i]);
}
