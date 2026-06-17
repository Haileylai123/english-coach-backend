// src/lib/claude.ts — Minimax (Claude proxy) AI adapter
import { Env } from '../index';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeRequest {
  system?: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  model?: string;
}

const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';
const DEFAULT_MODEL = 'MiniMax-M3';

export async function callClaude(env: Env, req: ClaudeRequest): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  if (!env.MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY not configured');
  }

  const model = req.model || DEFAULT_MODEL;

  const body: Record<string, any> = {
    model,
    max_tokens: req.max_tokens || 1024,
    messages: req.messages,
  };
  if (req.system) body.system = req.system;

  const res = await fetch(`${MINIMAX_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.MINIMAX_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Minimax API error (${res.status}): ${err}`);
  }

  const data: any = await res.json();
  return {
    content: data.content?.[0]?.text || '',
    input_tokens: data.usage?.input_tokens || 0,
    output_tokens: data.usage?.output_tokens || 0,
  };
}