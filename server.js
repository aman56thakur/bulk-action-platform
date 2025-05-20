require('dotenv').config()
const http = require('http')
const app = require('./src/app')
const { connectDB, connectRabbitMQ, connectRedis } = require('./src/config')
const { startAllWorkers } = require('./src/workers')
const {
  startScheduledJobsChecker,
} = require('./src/services/schedulingService')
const logger = require('./src/utils/logger')

const PORT = process.env.PORT || 3000
const server = http.createServer(app)

async function startServer() {
  try {
    await connectDB()
    await connectRedis()
    await connectRabbitMQ()
    await startAllWorkers()
    startScheduledJobsChecker()
    server.listen(PORT, () => logger.info(`Server running on port ${PORT}`))
  } catch (error) {
    logger.error(`Failed to start server or services: ${error.message}`)
    logger.error(error.stack)
    process.exit(1)
  }
}

startServer()
