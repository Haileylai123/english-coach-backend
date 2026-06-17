// src/routes/sync.ts — Sync vocab / progress / SRS / analyses / achievements
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/response';
import { uuid, now, today, safeJson } from '../lib/helpers';

export async function syncRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  userId: string | null,
): Promise<Response> {
  if (!userId) return errorResponse('Unauthorized', 401);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const params = url.searchParams;

  // ── GET full state snapshot ──
  if (path === '/api/sync/state' && method === 'GET') {
    const [vocab, customVocab, analyses, achievements, progress, practice] = await Promise.all([
      env.DB.prepare('SELECT * FROM user_vocab WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM custom_vocab WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(userId).all(),
      env.DB.prepare('SELECT * FROM achievements WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM course_progress WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM practice_log WHERE user_id = ? ORDER BY practice_date DESC LIMIT 30').bind(userId).all(),
    ]);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    const pet = await env.DB.prepare('SELECT * FROM pet_state WHERE user_id = ?').bind(userId).first();
    const sceneStats = await env.DB.prepare('SELECT * FROM scene_stats WHERE user_id = ?').bind(userId).all();
    return jsonResponse({
      user,
      pet,
      vocab: vocab.results,
      customVocab: customVocab.results,
      analyses: analyses.results,
      achievements: achievements.results,
      progress: progress.results,
      practice: practice.results,
      sceneStats: sceneStats.results,
      syncedAt: now(),
    });
  }

  // ── POST state delta (bulk) ──
  if (path === '/api/sync/state' && method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    const result: Record<string, number> = { vocab: 0, customVocab: 0, analyses: 0, achievements: 0, progress: 0, practice: 0 };
    const t = now();

    if (Array.isArray(body.vocab)) {
      for (const w of body.vocab) {
        if (!w?.en) continue;
        await env.DB.prepare(`
          INSERT INTO user_vocab (id, user_id, en, zh, part_of_speech, example, source, srs_ef, srs_interval, srs_reps, srs_due, last_review, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, en) DO UPDATE SET
            zh = excluded.zh, example = excluded.example,
            srs_ef = excluded.srs_ef, srs_interval = excluded.srs_interval,
            srs_reps = excluded.srs_reps, srs_due = excluded.srs_due, last_review = excluded.last_review
        `).bind(
          w.id || uuid(), userId, w.en, w.zh || null, w.partOfSpeech || null, w.example || null,
          w.source || 'manual', w.srsEf || 2.5, w.srsInterval || 0, w.srsReps || 0,
          w.srsDue || null, w.lastReview || null, w.createdAt || t
        ).run();
        result.vocab++;
      }
    }
    if (Array.isArray(body.customVocab)) {
      for (const w of body.customVocab) {
        if (!w?.en) continue;
        await env.DB.prepare(`
          INSERT INTO custom_vocab (id, user_id, en, zh, context, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, en) DO UPDATE SET zh = excluded.zh, context = excluded.context
        `).bind(w.id || uuid(), userId, w.en, w.zh || null, w.context || null, w.createdAt || t).run();
        result.customVocab++;
      }
    }
    if (Array.isArray(body.analyses)) {
      for (const a of body.analyses) {
        await env.DB.prepare(`
          INSERT INTO analyses (id, user_id, scene, transcript, duration_ms, overall_score, fluency_score, vocab_score, pron_score, grammar_score, cefr_level, word_count, ai_feedback, audio_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          a.id || uuid(), userId, a.scene || null, a.transcript || null, a.durationMs || null,
          a.overallScore || null, a.fluencyScore || null, a.vocabScore || null, a. pronScore || null, a.grammarScore || null,
          a.cefrLevel || null, a.wordCount || null, a.aiFeedback ? JSON.stringify(a.aiFeedback) : null,
          a.audioUrl || null, a.createdAt || t
        ).run();
        result.analyses++;
      }
    }
    if (Array.isArray(body.achievements)) {
      for (const a of body.achievements) {
        if (!a?.key) continue;
        await env.DB.prepare(`
          INSERT INTO achievements (id, user_id, achievement_key, unlocked_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, achievement_key) DO NOTHING
        `).bind(a.id || uuid(), userId, a.key, a.unlockedAt || t).run();
        result.achievements++;
      }
    }
    if (Array.isArray(body.progress)) {
      for (const p of body.progress) {
        if (!p?.courseId || !p?.lessonId) continue;
        await env.DB.prepare(`
          INSERT INTO course_progress (id, user_id, course_id, lesson_id, completed, score, attempts, last_score, completed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, course_id, lesson_id) DO UPDATE SET
            completed = excluded.completed, score = excluded.score,
            attempts = excluded.attempts, last_score = excluded.last_score,
            completed_at = excluded.completed_at, updated_at = excluded.updated_at
        `).bind(
          p.id || uuid(), userId, p.courseId, p.lessonId,
          p.completed ? 1 : 0, p.score || null, p.attempts || 0, p.lastScore || null,
          p.completedAt || null, p.createdAt || t, t
        ).run();
        result.progress++;
      }
    }
    if (Array.isArray(body.practice)) {
      for (const pr of body.practice) {
        if (!pr?.date) continue;
        await env.DB.prepare(`
          INSERT INTO practice_log (id, user_id, practice_date, scene, xp_earned, analyses_count, minutes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, practice_date) DO UPDATE SET
            xp_earned = MAX(xp_earned, excluded.xp_earned),
            analyses_count = analyses_count + excluded.analyses_count,
            minutes = minutes + excluded.minutes
        `).bind(
          pr.id || uuid(), userId, pr.date, pr.scene || null, pr.xpEarned || 0,
          pr.analysesCount || 0, pr.minutes || 0, t
        ).run();
        result.practice++;
      }
    }
    if (body.sceneCount) {
      for (const [scene, count] of Object.entries(body.sceneCount)) {
        if (typeof count !== 'number') continue;
        await env.DB.prepare(`
          INSERT INTO scene_stats (id, user_id, scene, count, last_used)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, scene) DO UPDATE SET count = count + excluded.count, last_used = excluded.last_used
        `).bind(uuid(), userId, scene, count, t).run();
      }
    }
    return jsonResponse({ ok: true, ...result, syncedAt: t });
  }

  // ── GET vocab ──
  if (path === '/api/sync/vocab' && method === 'GET') {
    const dueOnly = params.get('due') === '1';
    let query = 'SELECT * FROM user_vocab WHERE user_id = ?';
    const binds: any[] = [userId];
    if (dueOnly) {
      query += ' AND (srs_due IS NULL OR srs_due <= ?)';
      binds.push(today());
    }
    query += ' ORDER BY created_at DESC';
    const res = await env.DB.prepare(query).bind(...binds).all();
    return jsonResponse({ vocab: res.results });
  }

  // ── POST vocab (single) ──
  if (path === '/api/sync/vocab' && method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    if (!body?.en) return errorResponse('Word (en) required', 400);
    const id = body.id || uuid();
    const t = now();
    await env.DB.prepare(`
      INSERT INTO user_vocab (id, user_id, en, zh, part_of_speech, example, source, srs_ef, srs_interval, srs_reps, srs_due, last_review, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, en) DO UPDATE SET
        zh = excluded.zh, example = excluded.example,
        srs_ef = excluded.srs_ef, srs_interval = excluded.srs_interval,
        srs_reps = excluded.srs_reps, srs_due = excluded.srs_due, last_review = excluded.last_review
    `).bind(
      id, userId, body.en, body.zh || null, body.partOfSpeech || null, body.example || null,
      body.source || 'manual', body.srsEf || 2.5, body.srsInterval || 0, body.srsReps || 0,
      body.srsDue || null, body.lastReview || null, t
    ).run();
    return jsonResponse({ ok: true, id });
  }

  // ── DELETE vocab ──
  if (path === '/api/sync/vocab' && method === 'DELETE') {
    const en = params.get('en');
    if (!en) return errorResponse('Word (en) required', 400);
    await env.DB.prepare('DELETE FROM user_vocab WHERE user_id = ? AND en = ?').bind(userId, en).run();
    return jsonResponse({ ok: true });
  }

  // ── SRS endpoints (alias of vocab) ──
  if (path === '/api/sync/srs' && method === 'GET') {
    const res = await env.DB.prepare(
      'SELECT en, zh, srs_ef, srs_interval, srs_reps, srs_due, last_review FROM user_vocab WHERE user_id = ? AND srs_reps > 0'
    ).bind(userId).all();
    return jsonResponse({ srs: res.results });
  }
  if (path === '/api/sync/srs' && method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    if (!body?.en) return errorResponse('Word (en) required', 400);
    await env.DB.prepare(`
      UPDATE user_vocab SET srs_ef = ?, srs_interval = ?, srs_reps = ?, srs_due = ?, last_review = ?
      WHERE user_id = ? AND en = ?
    `).bind(body.srsEf, body.srsInterval, body.srsReps, body.srsDue, body.lastReview || today(), userId, body.en).run();
    return jsonResponse({ ok: true });
  }

  // ── Analyses list ──
  if (path === '/api/sync/analyses' && method === 'GET') {
    const limit = parseInt(params.get('limit') || '50', 10);
    const res = await env.DB.prepare(
      'SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(userId, limit).all();
    return jsonResponse({ analyses: res.results });
  }

  // ── Achievements ──
  if (path === '/api/sync/achievements' && method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM achievements WHERE user_id = ?').bind(userId).all();
    return jsonResponse({ achievements: res.results });
  }
  if (path === '/api/sync/achievements' && method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    if (!body?.key) return errorResponse('Achievement key required', 400);
    await env.DB.prepare(`
      INSERT INTO achievements (id, user_id, achievement_key, unlocked_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, achievement_key) DO NOTHING
    `).bind(uuid(), userId, body.key, now()).run();
    return jsonResponse({ ok: true });
  }

  // ── Practice log ──
  if (path === '/api/sync/practice' && method === 'GET') {
    const res = await env.DB.prepare(
      'SELECT * FROM practice_log WHERE user_id = ? ORDER BY practice_date DESC LIMIT 30'
    ).bind(userId).all();
    return jsonResponse({ practice: res.results });
  }
  if (path === '/api/sync/practice' && method === 'POST') {
    let body: any;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    if (!body?.date) return errorResponse('Date required', 400);
    await env.DB.prepare(`
      INSERT INTO practice_log (id, user_id, practice_date, scene, xp_earned, analyses_count, minutes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, practice_date) DO UPDATE SET
        xp_earned = MAX(xp_earned, excluded.xp_earned),
        analyses_count = analyses_count + excluded.analyses_count,
        minutes = minutes + excluded.minutes
    `).bind(uuid(), userId, body.date, body.scene || null, body.xpEarned || 0, body.analysesCount || 0, body.minutes || 0, now()).run();
    return jsonResponse({ ok: true });
  }

  return errorResponse('Sync route not found', 404);
}
