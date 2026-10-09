import { z } from 'zod';

import { LlmError } from '../errors';
import { completeJsonWith, type CompletionRequest } from '../jsonCompletion';

const schema = z.object({ title: z.string().min(1), count: z.number().int() });
const req: CompletionRequest = { system: 'Return JSON.', messages: [{ role: 'user', content: 'go' }] };

function transport(...replies: string[]) {
  const fn = jest.fn<Promise<string>, [CompletionRequest]>();
  replies.forEach((r) => fn.mockResolvedValueOnce(r));
  return fn;
}

describe('completeJsonWith', () => {
  it('returns the parsed value on the first valid reply', async () => {
    const complete = transport('```json\n{"title":"A","count":2}\n```');
    await expect(completeJsonWith(complete, req, schema)).resolves.toEqual({ title: 'A', count: 2 });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].json).toBe(true);
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const complete = transport('{"title":"A","count":"two"}', '{"title":"A","count":2}');
    await expect(completeJsonWith(complete, req, schema)).resolves.toEqual({ title: 'A', count: 2 });
    expect(complete).toHaveBeenCalledTimes(2);

    const retry = complete.mock.calls[1][0];
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[0]).toEqual(req.messages[0]);
    expect(retry.messages[1]).toEqual({ role: 'assistant', content: '{"title":"A","count":"two"}' });
    expect(retry.messages[2].role).toBe('user');
    expect(retry.messages[2].content).toContain('count');
  });

  it('retries when the reply is not JSON at all', async () => {
    const complete = transport('I cannot do that.', '{"title":"A","count":1}');
    await expect(completeJsonWith(complete, req, schema)).resolves.toEqual({ title: 'A', count: 1 });
    expect(complete.mock.calls[1][0].messages[2].content).toContain('valid JSON');
  });

  it('never sends an empty assistant turn', async () => {
    const complete = transport('   ', '{"title":"A","count":1}');
    await completeJsonWith(complete, req, schema);
    expect(complete.mock.calls[1][0].messages[1].content).toBe('(empty reply)');
  });

  it('fails with bad_response after exactly one retry', async () => {
    const complete = transport('{"title":""}', '{"title":"","count":1}', '{"title":"A","count":1}');
    const error = await completeJsonWith(complete, req, schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).kind).toBe('bad_response');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('does not retry transport errors', async () => {
    const complete = jest.fn<Promise<string>, [CompletionRequest]>().mockRejectedValue(new LlmError('rate_limit'));
    await expect(completeJsonWith(complete, req, schema)).rejects.toMatchObject({ kind: 'rate_limit' });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
