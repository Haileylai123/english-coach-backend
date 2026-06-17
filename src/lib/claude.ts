// src/lib/claude.ts — AI provider adapter (Cloudflare Workers AI)
// Uses Workers AI free tier (Llama 4 Scout by default)
import { Env } from '../index';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeRequest {
  system?: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  model?: string; // Workers AI model id
}

const DEFAULT_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

export async function callClaude(env: Env, req: ClaudeRequest): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const model = req.model || DEFAULT_MODEL;

  // Workers AI uses messages array — system prompt is a message with role: 'system'
  const messages: { role: string; content: string }[] = [];
  if (req.system) {
    messages.push({ role: 'system', content: req.system });
  }
  messages.push(...req.messages);

  try {
    const response = await env.AI.run(model, {
      messages,
      max_tokens: req.max_tokens || 1024,
      temperature: 0.7,
    });

    return {
      content: (response as any).response || '',
      input_tokens: (response as any).usage?.prompt_tokens || 0,
      output_tokens: (response as any).usage?.completion_tokens || 0,
    };
  } catch (err: any) {
    throw new Error(`Workers AI error: ${err?.message || err}`);
  }
}
