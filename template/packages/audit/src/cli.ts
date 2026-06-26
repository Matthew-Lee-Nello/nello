#!/usr/bin/env node
import { runAudit, runDoctor, runAutofetch } from './audit.js'
import { runAutofetchWrite, runAutofetchCursor } from './autofetch-write.js'

const cmd = process.argv[2]
switch (cmd) {
  case 'audit':  runAudit();  break
  case 'doctor': runDoctor(process.argv.includes('--deep')); break
  case 'autofetch': runAutofetch(process.argv[3] || 'status'); break
  case 'autofetch-write': runAutofetchWrite(process.argv[3]); break
  case 'autofetch-cursor': runAutofetchCursor(process.argv[3]); break
  default:
    console.log(`Usage: nello <audit | doctor [--deep] | autofetch <on|off|status> | autofetch-write [items.json] | autofetch-cursor <source>>`)
    process.exit(1)
}
