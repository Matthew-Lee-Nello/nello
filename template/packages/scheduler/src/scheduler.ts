import cronParser from 'cron-parser'
const { parseExpression } = cronParser
import {
  claimDueTasks, releaseTask, recoverStaleClaims,
  bumpTaskFailure, resetTaskFailures, setTaskStatus,
  runAgent,
  SCHEDULER_POLL_MS,
  logger,
} from '@nello/core'

export type Sender = (chatId: string, text: string) => Promise<void>

// Circuit-breaker: after this many consecutive failed runs, pause the task so a broken
// job (a wedged auto-fetch, a revoked token) stops spending an agent turn every tick.
const MAX_CONSECUTIVE_FAILURES = 5

export function computeNextRun(cronExpression: string, from: Date = new Date()): number {
  try {
    return Math.floor(parseExpression(cronExpression, { currentDate: from }).next().getTime() / 1000)
  } catch (err) {
    // A malformed cron in the DB must never throw inside the tick loop - that
    // would skip releaseTask() and wedge the task "claimed" until the lease TTL.
    // Defer it an hour and log so the bad schedule is visible instead.
    logger.error({ err, cronExpression }, 'invalid cron expression, deferring task 1h')
    return Math.floor(from.getTime() / 1000) + 3600
  }
}

let timer: NodeJS.Timeout | null = null

export function initScheduler(send: Sender): void {
  if (timer) return

  // Surface and clear any stale claims left by a crashed prior process so
  // those tasks fire again on the next tick instead of being stuck "in flight"
  // forever.
  const recovered = recoverStaleClaims()
  if (recovered > 0) logger.warn({ count: recovered }, 'Released stale task claims from prior run')

  const tick = async () => {
    // Whole body wrapped: a throw from claimDueTasks() or anywhere else must not
    // escape as an unhandled rejection (and now never kills the daemon either).
    try {
      // Atomic claim — UPDATE ... RETURNING. Two scheduler ticks (or two daemon
      // instances) can no longer both pick up the same row, and a crash during
      // runAgent() leaves the claim recoverable via recoverStaleClaims on
      // restart instead of permanently skipping the task.
      const due = claimDueTasks()
      for (const task of due) {
        let resultText: string
        let failed = false
        try {
          logger.info({ id: task.id, prompt: task.prompt.slice(0, 80) }, 'Running task')
          const result = await runAgent(task.prompt)
          resultText = result.text || '(no output)'
          await send(task.chat_id, resultText)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error({ id: task.id, err }, 'Task failed')
          resultText = `error: ${msg}`
          failed = true
        }
        // Release the claim, bump next_run, record result. Done last so a crash
        // mid-run leaves the lease in place — recoverStaleClaims on next boot
        // (or the TTL window in claimDueTasks) re-runs the task. Guarded so a
        // failed release can't abort the rest of the batch.
        try {
          releaseTask(task.id, computeNextRun(task.schedule), resultText.slice(0, 500))
        } catch (relErr) {
          logger.error({ id: task.id, relErr }, 'Failed to release task claim')
        }
        // Circuit-breaker: trip after MAX_CONSECUTIVE_FAILURES straight failures so a
        // broken task stops burning an agent turn (and any API spend) every tick.
        // Guarded so a counter/DB hiccup can't abort the rest of the batch.
        try {
          if (failed) {
            const fails = bumpTaskFailure(task.id)
            if (fails >= MAX_CONSECUTIVE_FAILURES) {
              setTaskStatus(task.id, 'paused')
              logger.warn({ id: task.id, fails }, 'Circuit-breaker tripped — task paused')
              await send(task.chat_id, `Paused scheduled task ${task.id} after ${fails} failures in a row, to stop wasted runs. Fix the cause, then re-enable it in the dashboard (Scheduled Tasks).`)
            }
          } else {
            resetTaskFailures(task.id)
          }
        } catch (cbErr) {
          logger.error({ id: task.id, cbErr }, 'Circuit-breaker bookkeeping failed')
        }
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler tick failed')
    }
  }

  // Fire once immediately, then on interval. tick() never throws (wrapped above),
  // so neither the initial call nor the interval can leak an unhandled rejection.
  void tick()
  timer = setInterval(() => { void tick() }, SCHEDULER_POLL_MS)
  logger.info('Scheduler started')
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}
