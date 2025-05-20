const PushJob = require('../models/PushJob')
const BulkAction = require('../models/BulkAction')
const {
  getChannel,
  publishToQueue,
  publishToQueueWithDelay,
  PROCESS_PUSHJOB_QUEUE,
  PUSH_ENTITY_QUEUE,
} = require('../config/rabbitmq')
const { checkRateLimit } = require('../services/rateLimiter')
const {
  isDuplicateEmail,
  markEmailAsProcessed,
} = require('../services/deduplicationService')
const logger = require('../utils/logger')
require('dotenv').config()

const RATE_LIMIT_REQUEUE_DELAY_MS = parseInt(
  process.env.RATE_LIMIT_REQUEUE_DELAY_MS,
  10
)

const processPushJobBatch = async msgData => {
  const { bulkActionId, jobIds } = msgData
  logger.info(
    `[ProcessPushjobWorker] Received batch of ${jobIds.length} job IDs for bulkActionId: ${bulkActionId}`
  )

  const bulkAction = await BulkAction.findOne({ actionId: bulkActionId })
  if (
    !bulkAction ||
    bulkAction.status === 'FAILED' ||
    bulkAction.status === 'COMPLETED'
  ) {
    logger.warn(
      `[ProcessPushjobWorker] BulkAction ${bulkActionId} is in a terminal state or not found. Skipping job batch.`
    )
    return true
  }
  const { accountId, entityType } = bulkAction

  const rateLimitCheck = await checkRateLimit(accountId, jobIds.length)
  if (!rateLimitCheck.allowed) {
    logger.warn(
      `[ProcessPushjobWorker] Rate limit hit for account ${accountId} processing bulkAction ${bulkActionId}. Re-queuing ${
        jobIds.length
      } jobs with delay ${
        rateLimitCheck.retryAfterMs || RATE_LIMIT_REQUEUE_DELAY_MS
      }ms.`
    )
    await publishToQueueWithDelay(
      PROCESS_PUSHJOB_QUEUE,
      msgData,
      rateLimitCheck.retryAfterMs || RATE_LIMIT_REQUEUE_DELAY_MS
    )
    return true
  }

  const pushJobs = await PushJob.find({
    jobId: { $in: jobIds },
    status: 'READY',
  })
  if (!pushJobs.length) {
    logger.info(
      `[ProcessPushjobWorker] No READY pushJobs found for the given job IDs for bulkAction ${bulkActionId}. Batch might have been processed or jobs are in an unexpected state.`
    )
    return true
  }

  const jobsToPush = []
  const jobsToSkip = []

  for (const job of pushJobs) {
    let isDuplicate = false
    if (entityType === 'Contact' && job.payload.email) {
      isDuplicate = await isDuplicateEmail(
        job._id,
        job.payload.email,
        bulkActionId,
        job.entityId
      )
    }

    if (isDuplicate) {
      jobsToSkip.push(job.jobId)
      await markEmailAsProcessed(job.payload.email, bulkActionId)
    } else {
      job.status = 'PROCESSING'
      job.attempts = (job.attempts || 0) + 1
      await job.save()
      jobsToPush.push(job.toObject())
      if (entityType === 'Contact' && job.payload.email) {
        await markEmailAsProcessed(job.payload.email, bulkActionId)
      }
    }
  }

  if (jobsToPush.length > 0) {
    const entityPushPayloads = jobsToPush.map(job => ({
      jobId: job.jobId,
      bulkActionId: job.bulkActionId,
      accountId: job.accountId,
      entityType: job.entityType,
      entityId: job.entityId,
      payload: job.payload,
    }))

    await publishToQueue(PUSH_ENTITY_QUEUE, {
      bulkActionId,
      accountId,
      entityType,
      pushJobPayloads: entityPushPayloads,
    })
    logger.info(
      `[ProcessPushjobWorker] Sent ${entityPushPayloads.length} validated pushJob payloads to ${PUSH_ENTITY_QUEUE} for ${bulkActionId}.`
    )
  }

  if (jobsToSkip.length > 0) {
    logger.info(
      `[ProcessPushjobWorker] Skipped ${jobsToSkip.length} jobs due to deduplication for ${bulkActionId}.`
    )
  }

  return true
}

const consumeProcessPushjobQueue = async () => {
  const channel = getChannel()
  const queueName = process.env.PROCESS_PUSHJOB_QUEUE

  channel.consume(
    queueName,
    async msg => {
      if (msg !== null) {
        const messageData = JSON.parse(msg.content.toString())
        logger.info(
          `[ProcessPushjobWorker] Consuming from ${queueName}: ${JSON.stringify(
            messageData.jobIds
              ? messageData.jobIds.length + ' jobs'
              : 'single job'
          )}`
        )
        try {
          const success = await processPushJobBatch(messageData)
          if (success) {
            channel.ack(msg)
          } else {
            logger.warn(
              `[ProcessPushjobWorker] NACKing message for ${messageData.bulkActionId} due to processing issue (e.g. non-terminal error).`
            )
            channel.nack(msg, false, true)
          }
        } catch (err) {
          logger.error(
            `[ProcessPushjobWorker] Unhandled error in consumer for ${messageData.bulkActionId}: ${err.message} - ${err.stack}. NACKing.`
          )
          channel.nack(msg, false, false)
        }
      }
    },
    { noAck: false, prefetch: 1 }
  )
  logger.info(
    `[ProcessPushjobWorker] Worker started and listening on queue: ${queueName}`
  )
}

module.exports = { consumeProcessPushjobQueue, processPushJobBatch }
