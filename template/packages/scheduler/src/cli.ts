#!/usr/bin/env node
import { createTask, listTasks, setTaskStatus, deleteTask } from '@nello/core'
import { computeNextRun } from './scheduler.js'
import { randomUUID } from 'node:crypto'

function usage(): never {
  console.log(`Usage:
  nc-schedule create "<prompt>" "<cron>" <chat_id>
  nc-schedule list [chat_id]
  nc-schedule pause <id>
  nc-schedule resume <id>
  nc-schedule delete <id>`)
  process.exit(1)
}

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) usage()

switch (cmd) {
  case 'create': {
    const [prompt, schedule, chatId] = args
    if (!prompt || !schedule || !chatId) usage()
    try { computeNextRun(schedule) } catch (err) {
      console.error(`Invalid cron: ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
    const id = randomUUID().slice(0, 8)
    createTask({ id, chat_id: chatId, prompt, schedule, next_run: computeNextRun(schedule), status: 'active' })
    console.log(`Created task ${id}`)
    break
  }
  case 'list': {
    const tasks = listTasks(args[0])
    if (tasks.length === 0) { console.log('No tasks.'); break }
    for (const t of tasks) {
      const next = new Date(t.next_run * 1000).toISOString()
      console.log(`${t.id}  ${t.status.padEnd(7)}  ${t.schedule.padEnd(15)}  next=${next}  ${t.prompt.slice(0, 60)}`)
    }
    break
  }
  case 'pause':  { if (!args[0]) usage(); setTaskStatus(args[0], 'paused');  console.log('Paused.');  break }
  case 'resume': { if (!args[0]) usage(); setTaskStatus(args[0], 'active');  console.log('Resumed.'); break }
  case 'delete': { if (!args[0]) usage(); deleteTask(args[0]);                console.log('Deleted.'); break }
  default: usage()
}
