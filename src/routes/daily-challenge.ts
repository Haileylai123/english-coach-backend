// src/routes/daily-challenge.ts — Daily Challenge + Leaderboard
// Viral engine: one prompt/day, score, leaderboard, share

import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { uuid, now, today, safeJson } from '../lib/helpers';

const SCENES_POOL = [
  'daily', 'business', 'ielts', 'interview', 'dating',
  'keigo', 'izakaya', 'toeic', 'job-hunt-kr',
];

interface DailyPrompt {
  scene: string;
  prompt_en: string;
  prompt_zh_HK: string;
  prompt_zh_CN: string;
  prompt_ja: string;
  prompt_ko: string;
}

/** 15 prompts per scene, one rotated per day. */
const PROMPTS: Record<string, DailyPrompt[]> = {
  daily: [
    { scene: 'daily', prompt_en: 'Describe your morning routine in 30 seconds.', prompt_zh_HK: '用 30 秒講下你嘅朝早流程。', prompt_zh_CN: '用 30 秒讲讲你的早晨流程。', prompt_ja: '今朝のルーティンを30秒で説明してください。', prompt_ko: '아침 루틴을 30초로 설명하세요.' },
    { scene: 'daily', prompt_en: 'What did you eat yesterday? Describe one meal in detail.', prompt_zh_HK: '琴日食咗啲咩?詳細講一餐。', prompt_zh_CN: '昨天吃了什么?详细讲一餐。', prompt_ja: '昨日何を食べましたか?一食を詳しく。', prompt_ko: '어제 무엇을 먹었나요? 한 끼를 자세히.' },
  ],
  business: [
    { scene: 'business', prompt_en: 'Pitch your company in 30 seconds.', prompt_zh_HK: '用 30 秒推銷你嘅公司。', prompt_zh_CN: '用 30 秒推销你的公司。', prompt_ja: 'あなたの会社を30秒でピッチしてください。', prompt_ko: '회사를 30초로 피치하세요.' },
    { scene: 'business', prompt_en: 'Describe a successful project you led.', prompt_zh_HK: '講下你帶領過嘅一個成功項目。', prompt_zh_CN: '讲讲你带领过的一个成功项目。', prompt_ja: 'あなたが主導した成功したプロジェクトを説明してください。', prompt_ko: '당신이 이끈 성공적인 프로젝트를 설명하세요.' },
  ],
  ielts: [
    { scene: 'ielts', prompt_en: 'Describe a place you would like to visit.', prompt_zh_HK: '描述一個你想去嘅地方。', prompt_zh_CN: '描述一个你想去的地方。', prompt_ja: '訪れたい場所を一つ説明してください。', prompt_ko: '가고 싶은 장소 하나를 묘사하세요.' },
    { scene: 'ielts', prompt_en: 'Talk about a hobby you enjoy.', prompt_zh_HK: '講下你鍾意嘅一個嗜好。', prompt_zh_CN: '讲讲你喜欢的一个爱好。', prompt_ja: '楽しむ趣味を一つ話してください。', prompt_ko: '즐기는 취미 하나를 이야기하세요.' },
  ],
  interview: [
    { scene: 'interview', prompt_en: 'Tell me about yourself in 60 seconds.', prompt_zh_HK: '用 60 秒自我介紹。', prompt_zh_CN: '用 60 秒自我介绍。', prompt_ja: '60秒で自己紹介してください。', prompt_ko: '60초로 자기소개하세요.' },
    { scene: 'interview', prompt_en: 'Why should we hire you?', prompt_zh_HK: '點解我哋要請你?', prompt_zh_CN: '我们为什么要雇你?', prompt_ja: 'なぜあなたを採用すべきですか?', prompt_ko: '왜 우리 회사가 당신을 채용해야 하나요?' },
  ],
  dating: [
    { scene: 'dating', prompt_en: 'Describe your ideal first date.', prompt_zh_HK: '描述你理想嘅第一次約會。', prompt_zh_CN: '描述你理想的第一次约会。', prompt_ja: '理想的な初デートを説明してください。', prompt_ko: '이상적인 첫 데이트를 묘사하세요.' },
    { scene: 'dating', prompt_en: 'What do you look for in a partner?', prompt_zh_HK: '你揀對象最緊要咩?', prompt_zh_CN: '你找对象最看重什么?', prompt_ja: 'パートナーに何を求めますか?', prompt_ko: '파트너에게서 무엇을 찾나요?' },
  ],
  keigo: [
    { scene: 'keigo', prompt_en: 'Apologize to a client for a late delivery and propose a solution.', prompt_zh_HK: '向客戶道歉送貨延遲並提出解決方案。', prompt_zh_CN: '向客户道歉送货延迟并提出解决方案。', prompt_ja: '納期遅れについてお客様に謝罪し、解決策を提案してください。', prompt_ko: '납기 지연에 대해 고객에게 사과하고 해결책을 제안하세요.' },
    { scene: 'keigo', prompt_en: 'Politely decline a meeting invitation due to schedule conflict.', prompt_zh_HK: '禮貌拒絕會議邀請,理由係撞咗時間。', prompt_zh_CN: '礼貌拒绝会议邀请,理由是时间冲突。', prompt_ja: 'スケジュールの都合で会議のご依頼を丁重にお断りしてください。', prompt_ko: '일정 충돌로 회의 초대를 정중히 거절하세요.' },
  ],
  izakaya: [
    { scene: 'izakaya', prompt_en: 'Order food and drinks for a group at an izakaya.', prompt_zh_HK: '喺居酒屋幫一枱人叫嘢食同飲。', prompt_zh_CN: '在居酒屋帮一桌人点菜和酒。', prompt_ja: '居酒屋でグループのために食べ物と飲み物を注文してください。', prompt_ko: '이자카야에서 그룹을 위해 음식과 음료를 주문하세요.' },
    { scene: 'izakaya', prompt_en: 'Propose a toast and explain why you are grateful tonight.', prompt_zh_HK: '提議敬酒並講下你今晚點解感激。', prompt_zh_CN: '提议敬酒并讲讲你今晚为什么感激。', prompt_ja: '乾杯を提案し、今夜感謝している理由を話してください。', prompt_ko: '건배를 제안하고 오늘 밤 감사한 이유를 설명하세요.' },
  ],
  toeic: [
    { scene: 'toeic', prompt_en: 'Describe the picture: a busy office with people working.', prompt_zh_HK: '描述圖片:一個繁忙嘅辨公室,有人喺度工作。', prompt_zh_CN: '描述图片:一个繁忙的办公室,有人在工作。', prompt_ja: '写真を説明してください:人が働いている賑やかなオフィス。', prompt_ko: '사진을 묘사하세요: 사람들이 일하는 분주한 사무실.' },
    { scene: 'toeic', prompt_en: 'Suggest an improvement to your team workflow.', prompt_zh_HK: '對你哋團隊嘅工作流程提出改善建議。', prompt_zh_CN: '对你的团队工作流程提出改善建议。', prompt_ja: 'チームのワークフロー改善を提案してください。', prompt_ko: '팀 워크플로우 개선을 제안하세요.' },
  ],
  'job-hunt-kr': [
    { scene: 'job-hunt-kr', prompt_en: 'Introduce yourself in 60 seconds for a job interview.', prompt_zh_HK: '用 60 秒自我介紹,準備面試。', prompt_zh_CN: '用 60 秒自我介绍,准备面试。', prompt_ja: '面接のために60秒で自己紹介をしてください。', prompt_ko: '면접을 위해 60초 자기소개를 하세요.' },
    { scene: 'job-hunt-kr', prompt_en: 'Describe a challenge you overcame using STAR method.', prompt_zh_HK: '用 STAR 法講下你克服過嘅一個挑戰。', prompt_zh_CN: '用 STAR 法讲讲你克服过的一个挑战。', prompt_ja: 'STAR法を使って克服した課題を話してください。', prompt_ko: 'STAR 기법으로 극복한 도전을 설명하세요.' },
  ],
};

/** Deterministic daily prompt picker: scene rotates daily by day-of-year modulo. */
export function pickDailyPrompt(date: string): DailyPrompt {
  // Day of year
  const d = new Date(date + 'T00:00:00Z');
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / 86400_000);
  const scene = SCENES_POOL[dayOfYear % SCENES_POOL.length];
  const scenePrompts = PROMPTS[scene] || PROMPTS.daily;
  const prompt = scenePrompts[dayOfYear % scenePrompts.length];
  return prompt;
}

export async function dailyChallengeRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Today's prompt — public (no auth required for reading prompt)
  if (path === '/api/daily-challenge/today' && method === 'GET') {
    return await getToday(request, env, userId);
  }

  if (!userId) return errorResponse('Unauthorized', 401);

  if (path === '/api/daily-challenge/complete' && method === 'POST') return await postComplete(request, userId, env);
  if (path === '/api/daily-challenge/leaderboard' && method === 'GET') return await getLeaderboard(request, env);
  if (path === '/api/daily-challenge/streak' && method === 'GET') return await getStreak(userId, env);
  if (path === '/api/daily-challenge/my-history' && method === 'GET') return await getHistory(userId, env);

  return errorResponse('Daily challenge route not found', 404);
}

async function getToday(request: Request, env: Env, userId: string | null): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || today();
  const locale = url.searchParams.get('locale') || 'en';
  let prompt = pickDailyPrompt(date);
  // Override with admin-set prompt if exists
  const custom = await env.DB.prepare(
    'SELECT * FROM daily_challenge_prompts WHERE challenge_date = ?'
  ).bind(date).first<any>();
  if (custom) {
    const trans = safeJson<any>(custom.prompt_translations, {});
    prompt = {
      scene: custom.scene,
      prompt_en: trans.en || custom.prompt_en,
      prompt_zh_HK: trans['zh-HK'] || custom.prompt_en,
      prompt_zh_CN: trans['zh-CN'] || custom.prompt_en,
      prompt_ja: trans.ja || custom.prompt_en,
      prompt_ko: trans.ko || custom.prompt_en,
    };
  }
  // Get user's previous completion today
  let myCompletion: any = null;
  if (userId) {
    myCompletion = await env.DB.prepare(
      'SELECT score, shared FROM daily_challenge_completions WHERE user_id = ? AND challenge_date = ?'
    ).bind(userId, date).first();
  }
  return jsonResponse({
    date,
    scene: prompt.scene,
    prompt: prompt,
    promptLocalized: getLocalizedPrompt(prompt, locale),
    myCompletion,
  });
}

function getLocalizedPrompt(p: DailyPrompt, locale: string): string {
  const map: Record<string, keyof DailyPrompt> = {
    'en': 'prompt_en',
    'zh-HK': 'prompt_zh_HK',
    'zh-CN': 'prompt_zh_CN',
    'ja': 'prompt_ja',
    'ko': 'prompt_ko',
  };
  return p[map[locale] || 'prompt_en'] || p.prompt_en;
}

async function postComplete(request: Request, userId: string, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
  if (typeof body?.score !== 'number') return errorResponse('score required', 400);
  if (body.score < 0 || body.score > 100) return errorResponse('score must be 0-100', 400);

  const date = body.date || today();
  const t = now();
  // Look up user market
  const user = await env.DB.prepare('SELECT locale FROM users WHERE id = ?').bind(userId).first<{ locale: string }>();
  const market = inferMarket(user?.locale);
  const scene = body.scene || pickDailyPrompt(date).scene;

  await env.DB.prepare(`
    INSERT INTO daily_challenge_completions (id, user_id, challenge_date, scene, score, market, duration_ms, transcript, audio_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, challenge_date) DO UPDATE SET
      score = MAX(score, excluded.score),
      duration_ms = excluded.duration_ms,
      transcript = excluded.transcript
  `).bind(
    uuid(), userId, date, scene, Math.round(body.score), market,
    body.durationMs || null, body.transcript || null, body.audioUrl || null, t
  ).run();

  // Update streak
  await updateStreak(env, userId, date);

  // Find rank
  const rank = await env.DB.prepare(
    'SELECT COUNT(*) + 1 AS rank FROM daily_challenge_completions WHERE challenge_date = ? AND score > ?'
  ).bind(date, Math.round(body.score)).first<{ rank: number }>();
  const totalToday = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM daily_challenge_completions WHERE challenge_date = ?'
  ).bind(date).first<{ c: number }>();

  return jsonResponse({
    ok: true,
    score: Math.round(body.score),
    rank: rank?.rank || 1,
    totalToday: totalToday?.c || 1,
  });
}

function inferMarket(locale?: string): string {
  if (!locale) return 'OTHER';
  if (locale === 'ja') return 'JP';
  if (locale === 'ko') return 'KR';
  if (locale === 'zh-HK') return 'HK';
  if (locale === 'zh-CN') return 'CN';
  if (locale === 'en') return 'INTL';
  return 'OTHER';
}

async function updateStreak(env: Env, userId: string, date: string): Promise<void> {
  const existing = await env.DB.prepare('SELECT * FROM daily_streaks WHERE user_id = ?').bind(userId).first<any>();
  const t = now();
  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_completed, total_days, updated_at)
      VALUES (?, 1, 1, ?, 1, ?)
    `).bind(userId, date, t).run();
    return;
  }
  const last = existing.last_completed;
  const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
  let newStreak = existing.current_streak;
  if (last === date) {
    // Already counted today
    return;
  } else if (last === yesterday) {
    newStreak = existing.current_streak + 1;
  } else {
    newStreak = 1; // reset
  }
  const longest = Math.max(existing.longest_streak || 0, newStreak);
  await env.DB.prepare(`
    UPDATE daily_streaks
    SET current_streak = ?, longest_streak = ?, last_completed = ?, total_days = total_days + 1, updated_at = ?
    WHERE user_id = ?
  `).bind(newStreak, longest, date, t, userId).run();
}

async function getLeaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || today();
  const scope = url.searchParams.get('scope') || 'global'; // global | market | friends
  const market = url.searchParams.get('market') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

  let query: string;
  const binds: any[] = [date];
  if (scope === 'market' && market) {
    query = `SELECT u.id AS user_id, u.display_name, u.locale, d.score, d.market, d.scene
             FROM daily_challenge_completions d
             JOIN users u ON u.id = d.user_id
             WHERE d.challenge_date = ? AND d.market = ?
             ORDER BY d.score DESC, d.created_at ASC
             LIMIT ?`;
    binds.push(market, limit);
  } else {
    query = `SELECT u.id AS user_id, u.display_name, u.locale, d.score, d.market, d.scene
             FROM daily_challenge_completions d
             JOIN users u ON u.id = d.user_id
             WHERE d.challenge_date = ?
             ORDER BY d.score DESC, d.created_at ASC
             LIMIT ?`;
    binds.push(limit);
  }
  const res = await env.DB.prepare(query).bind(...binds).all();

  // Compute market breakdown for the day
  const marketStats = await env.DB.prepare(`
    SELECT market, COUNT(*) AS count, AVG(score) AS avg_score, MAX(score) AS top_score
    FROM daily_challenge_completions
    WHERE challenge_date = ?
    GROUP BY market
  `).bind(date).all();

  return jsonResponse({
    date,
    scope,
    market,
    leaderboard: res.results,
    marketStats: marketStats.results,
  });
}

async function getStreak(userId: string, env: Env): Promise<Response> {
  const streak = await env.DB.prepare('SELECT * FROM daily_streaks WHERE user_id = ?').bind(userId).first();
  if (!streak) {
    return jsonResponse({ current: 0, longest: 0, lastCompleted: null, totalDays: 0 });
  }
  return jsonResponse({
    current: streak.current_streak,
    longest: streak.longest_streak,
    lastCompleted: streak.last_completed,
    totalDays: streak.total_days,
  });
}

async function getHistory(userId: string, env: Env): Promise<Response> {
  const res = await env.DB.prepare(`
    SELECT challenge_date, scene, score, market, shared, created_at
    FROM daily_challenge_completions
    WHERE user_id = ?
    ORDER BY challenge_date DESC
    LIMIT 60
  `).bind(userId).all();
  return jsonResponse({ history: res.results });
}
