import { parseModelList } from '../models';

describe('parseModelList', () => {
  it('puts free models first, then cheapest, and labels prices', () => {
    const models = parseModelList({
      data: [
        { id: 'big/model', pricing: { prompt: '0.000003', completion: '0.000015' } },
        { id: 'small/model', pricing: { prompt: '0.00000005', completion: '0.0000004' } },
        { id: 'some/model:free', pricing: { prompt: '0', completion: '0' } },
      ],
    });
    expect(models.map((m) => m.id)).toEqual(['some/model:free', 'small/model', 'big/model']);
    expect(models[0]).toMatchObject({ free: true, note: 'Free' });
    expect(models[1].note).toBe('$0.05 in, $0.4 out per 1M tokens');
    expect(models[2].note).toBe('$3 in, $15 out per 1M tokens');
  });

  it('sorts alphabetically and adds no note when the provider reports no prices', () => {
    const models = parseModelList({ data: [{ id: 'models/gemini-b' }, { id: 'models/gemini-a' }] });
    expect(models).toEqual([
      { id: 'gemini-a', free: false, note: null, cost: null },
      { id: 'gemini-b', free: false, note: null, cost: null },
    ]);
  });

  it('does not treat a missing or dynamic price as free', () => {
    const models = parseModelList({
      data: [
        { id: 'a', pricing: { prompt: '', completion: '' } },
        { id: 'b', pricing: { prompt: '-1', completion: '-1' } },
      ],
    });
    expect(models.every((m) => !m.free && m.cost === null)).toBe(true);
  });

  it('drops models that cannot generate text', () => {
    const models = parseModelList({
      data: [
        { id: 'whisper-large-v3' },
        { id: 'models/gemini-embedding-2' },
        { id: 'models/gemini-3.8-flash-tts' },
        { id: 'google/lyria-3.5', architecture: { output_modalities: ['audio'] } },
        { id: 'canopy/speech', output_modalities: ['audio'] },
        { id: 'openai/gpt-oss-120b', output_modalities: ['text'] },
      ],
    });
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-oss-120b']);
  });

  it('returns an empty list for an unexpected body', () => {
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList({ data: 'nope' })).toEqual([]);
    expect(parseModelList({ data: [{}, { id: 5 }, { id: 'ok' }, { id: 'ok' }] })).toHaveLength(1);
  });
});
