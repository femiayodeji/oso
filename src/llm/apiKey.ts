import * as SecureStore from 'expo-secure-store';

const KEY_NAME = 'oso_llm_api_key';

export async function getApiKey(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(KEY_NAME);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await deleteApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEY_NAME, trimmed);
}

export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME);
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}
