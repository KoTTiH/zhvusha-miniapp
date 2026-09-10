import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['scripts/check-assistant-contract.mjs'], {
  cwd: process.cwd(),
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`assistant smoke interrupted: ${signal}`)
    process.exit(1)
  }
  if (code !== 0) process.exit(code ?? 1)
  console.log(JSON.stringify({
    ok: true,
    scenario: 'assistant tab structured reply + confirmed memory contract',
  }, null, 2))
})
