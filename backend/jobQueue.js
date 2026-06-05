/**
 * Codex developer notes:
 * Простая очередь отложенных backend-задач: задержки, рассылки и фоновые операции runtime.
 * Очередь отделяет планирование действий от HTTP-запросов и Telegram-апдейтов.
 * При изменениях важно учитывать повторный старт контейнера и идемпотентность задач.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

const { pool } = require('./database');

function startJobWorker(handlers, intervalMs = 2000) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        SELECT * FROM scheduled_jobs
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const job = result.rows[0];
      if (!job) {
        await client.query('COMMIT');
        return;
      }
      await client.query(`UPDATE scheduled_jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`, [job.id]);
      await client.query('COMMIT');
      try {
        const handler = handlers[job.job_type];
        if (!handler) throw new Error(`Unsupported job type: ${job.job_type}`);
        await handler(job);
        await pool.query(`UPDATE scheduled_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`, [job.id]);
      } catch (error) {
        await pool.query(`
          UPDATE scheduled_jobs SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
            last_error = $2, run_at = NOW() + INTERVAL '30 seconds', updated_at = NOW()
          WHERE id = $1
        `, [job.id, error.message]);
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Scheduled job worker failed:', error);
    } finally {
      client.release();
      busy = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
}

module.exports = { startJobWorker };
