#!/usr/bin/env node
import { runAudit, runDoctor, runAutofetch } from './audit.js'

const cmd = process.argv[2]
switch (cmd) {
  case 'audit':  runAudit();  break
  case 'doctor': runDoctor(process.argv.includes('--deep')); break
  case 'autofetch': runAutofetch(process.argv[3] || 'status'); break
  default:
    console.log(`Usage: nello <audit | doctor [--deep] | autofetch <on|off|status>>`)
    process.exit(1)
}
