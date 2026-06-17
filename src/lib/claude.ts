// src/lib/claude.ts — Claude API proxy (server holds the key)
import { Env } from '../index';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeRequest {
  system?: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  model?: 'claude-3-5-haiku-20241022' | 'claude-3-5-sonnet-20241022';
}

export async function callClaude(env: Env, req: ClaudeRequest): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const model = req.model || 'claude-3-5-haiku-20241022';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: req.max_tokens || 1024,
      system: req.system,
      messages: req.messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }
  const data: any = await res.json();
  return {
    content: data.content?.[0]?.text || '',
    input_tokens: data.usage?.input_tokens || 0,
    output_tokens: data.usage?.output_tokens || 0,
  };
}
