import { buildServer } from './app.js'

async function run(): Promise<void> {
  const app = buildServer()

  try {
    await app.ready()
  } catch (error) {
    app.log.fatal({ err: error }, 'backend configuration/bootstrap failed')
    await app.close().catch(() => undefined)
    process.exitCode = 1
    return
  }

  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true

    app.log.info({ signal }, 'backend shutdown started')

    const timeout = setTimeout(() => {
      app.log.fatal({ signal }, 'backend graceful shutdown timed out')
      process.exit(1)
    }, app.config.ERP_SHUTDOWN_TIMEOUT_MS)
    timeout.unref()

    try {
      await app.close()
      clearTimeout(timeout)
      app.log.info({ signal }, 'backend shutdown completed')
    } catch (error) {
      clearTimeout(timeout)
      app.log.fatal({ err: error, signal }, 'backend shutdown failed')
      process.exitCode = 1
    }
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))

  try {
    await app.listen({
      host: app.config.ERP_BACKEND_HOST,
      port: app.config.ERP_BACKEND_PORT,
    })
  } catch (error) {
    app.log.fatal({ err: error }, 'backend listen failed')
    await app.close().catch(() => undefined)
    process.exitCode = 1
  }
}

void run()
