const { consumeProcessFileQueue } = require('./processFileWorker')
const { consumeProcessPushjobQueue } = require('./processPushjobWorker')
const { consumePushEntityQueue } = require('./pushEntityWorker')
const logger = require('../utils/logger')

const startAllWorkers = async () => {
  logger.info('Starting all workers...')
  await consumeProcessFileQueue()
  await consumeProcessPushjobQueue()
  await consumePushEntityQueue()
  logger.info('All workers have been initiated.')
}

module.exports = { startAllWorkers }
