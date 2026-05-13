import cronParser from 'cron-parser'
const { parseExpression } = cronParser
import {
  claimDueTasks, releaseTask, recoverStaleClaims,
  runAgent,
  SCHEDULER_POLL_MS,
  logger,
} from '@nc/core'

export type Sender = (chatId: string, text: string) => Promise<void>

export function computeNextRun(cronExpression: string, from: Date = new Date()): number {
  return Math.floor(parseExpression(cronExpression, { currentDate: from }).next().getTime() / 1000)
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
    // Atomic claim — UPDATE ... RETURNING. Two scheduler ticks (or two daemon
    // instances) can no longer both pick up the same row, and a crash during
    // runAgent() leaves the claim recoverable via recoverStaleClaims on
    // restart instead of permanently skipping the task.
    const due = claimDueTasks()
    for (const task of due) {
      let resultText: string
      try {
        logger.info({ id: task.id, prompt: task.prompt.slice(0, 80) }, 'Running task')
        const result = await runAgent(task.prompt)
        resultText = result.text || '(no output)'
        await send(task.chat_id, resultText)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error({ id: task.id, err }, 'Task failed')
        resultText = `error: ${msg}`
      }
      // Release the claim, bump next_run, record result. Done last so a crash
      // mid-run leaves the lease in place — recoverStaleClaims on next boot
      // (or the TTL window in claimDueTasks) re-runs the task.
      releaseTask(task.id, computeNextRun(task.schedule), resultText.slice(0, 500))
    }
  }

  // Fire once immediately, then on interval
  tick()
  timer = setInterval(tick, SCHEDULER_POLL_MS)
  logger.info('Scheduler started')
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}
