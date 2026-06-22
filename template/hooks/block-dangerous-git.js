#!/usr/bin/env node
/**
 * PreToolUse(Bash) hook. Blocks destructive git operations. The last line of
 * defence; the Claude Code permission system is the first.
 *
 * Node, not bash. The old block-dangerous-git.sh required `jq`, and on a fresh
 * client (Windows always, or a Mac without jq) it exit-2'd on EVERY Bash call -
 * silently breaking the assistant's whole Bash tool. This has zero external
 * dependencies, so it runs identically on Mac, Windows and Linux.
 *
 * Exit 2 = block (Claude Code surfaces stderr to the model). Exit 0 = allow.
 */

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', () => {
  let command = ''
  try {
    command = String(JSON.parse(raw)?.tool_input?.command ?? '')
  } catch {
    // Unparseable payload - nothing useful to inspect. Refuse rather than
    // fall through and let an unknown command past the guard.
    process.stderr.write('BLOCKED: block-dangerous-git received an unreadable Bash command payload.\n')
    process.exit(2)
  }

  if (!command.trim()) {
    process.stderr.write('BLOCKED: block-dangerous-git received an empty Bash command payload.\n')
    process.exit(2)
  }

  // Same set the bash version enforced. \s+ matches one-or-more spaces so
  // "git   push" is caught too.
  const DANGEROUS = [
    /git\s+push/,
    /git\s+reset\s+--hard/,
    /git\s+clean\s+-fd/,
    /git\s+clean\s+-f/,
    /git\s+branch\s+-D/,
    /git\s+checkout\s+\./,
    /git\s+restore\s+\./,
    /push\s+--force/,
    /reset\s+--hard/,
  ]

  for (const re of DANGEROUS) {
    if (re.test(command)) {
      process.stderr.write(`BLOCKED: '${command}' matches dangerous git pattern ${re}. The user has prevented you from doing this.\n`)
      process.exit(2)
    }
  }

  process.exit(0)
})
