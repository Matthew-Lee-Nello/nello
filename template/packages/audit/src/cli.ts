#!/usr/bin/env node
import { runAudit, runDoctor } from './audit.js'

const cmd = process.argv[2]
switch (cmd) {
  case 'audit':  runAudit();  break
  case 'doctor': runDoctor(); break
  default:
    console.log(`Usage: nello <audit|doctor>`)
    process.exit(1)
}
