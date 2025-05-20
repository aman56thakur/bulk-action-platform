const cron = require('node-cron')
const BulkAction = require('../models/BulkAction')
const { publishToQueue, PROCESS_FILE_QUEUE } = require('../config/rabbitmq')
const logger = require('../utils/logger')

const startScheduledJobsChecker = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    logger.info('Checking for scheduled bulk actions...')
    try {
      const now = new Date()
      const dueActions = await BulkAction.find({
        status: 'SCHEDULED',
        scheduledAt: { $lte: now },
      })

      if (dueActions.length > 0) {
        logger.info(`Found ${dueActions.length} due scheduled actions.`)
        for (const action of dueActions) {
          try {
            action.status = 'PENDING'
            action.processingStartedAt = new Date()
            await action.save()

            await publishToQueue(PROCESS_FILE_QUEUE, {
              bulkActionId: action.actionId,
            })
            logger.info(
              `Scheduled bulk action ${action.actionId} for account ${action.accountId} has been queued for processing.`
            )
          } catch (error) {
            logger.error(
              `Error processing scheduled action ${action.actionId}: ${error.message}`
            )
            action.status = 'FAILED'
            action.errorMessage = `Failed to start scheduled processing: ${error.message}`
            await action.save()
          }
        }
      }
    } catch (error) {
      logger.error(`Error in scheduled jobs checker: ${error.message}`)
    }
  })

  logger.info('Scheduled jobs checker started.')
}

module.exports = { startScheduledJobsChecker }
