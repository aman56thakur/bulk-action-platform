const PushJob = require('../models/PushJob')
const BulkAction = require('../models/BulkAction')
const Contact = require('../models/Contact')
const { getChannel } = require('../config/rabbitmq')
const logger = require('../utils/logger')
require('dotenv').config()

const entityModelMap = {
  Contact: Contact,
}

const pushEntityBatch = async msgData => {
  const { bulkActionId, accountId, entityType, pushJobPayloads } = msgData
  logger.info(
    `[PushEntityWorker] Received batch of ${pushJobPayloads.length} entities to push for bulkActionId: ${bulkActionId}`
  )

  const Model = entityModelMap[entityType]
  if (!Model) {
    logger.error(
      `[PushEntityWorker] Unknown entity type: ${entityType} for bulkActionId ${bulkActionId}. Marking jobs as failed.`
    )
    for (const jobData of pushJobPayloads) {
      await PushJob.updateOne(
        { jobId: jobData.jobId },
        {
          status: 'FAILED',
          errorMessage: `Unknown entity type: ${entityType}`,
          processedAt: new Date(),
        }
      )
      await BulkAction.updateOne(
        { actionId: bulkActionId },
        { $inc: { failedCount: 1, processedEntities: 1 } }
      )
    }
    return true
  }

  let successCount = 0
  let failedCount = 0

  for (const jobData of pushJobPayloads) {
    const { jobId, entityId, payload } = jobData
    let pushJob = await PushJob.findOne({ jobId })

    if (!pushJob || pushJob.status !== 'PROCESSING') {
      logger.warn(
        `[PushEntityWorker] PushJob ${jobId} not found or not in PROCESSING state. Current state: ${pushJob?.status}. Skipping.`
      )
      continue
    }

    try {
      await Model.updateOne(
        { externalId: entityId, accountId: accountId },
        {
          $set: {
            ...payload,
            lastBulkActionId: bulkActionId,
            lastBulkUpdatedAt: new Date(),
          },
        },
        { upsert: true }
      )

      pushJob.status = 'SUCCESS'
      successCount++
      logger.info(
        `[PushEntityWorker] Successfully updated entity ${entityId} for job ${jobId}, bulk action ${bulkActionId}.`
      )
    } catch (dbError) {
      logger.error(
        `[PushEntityWorker] DB error updating entity ${entityId} for job ${jobId}, bulk action ${bulkActionId}: ${dbError.message}`
      )
      pushJob.status = 'FAILED'
      pushJob.errorMessage = `DB Error: ${dbError.message.substring(0, 255)}`
      failedCount++
    }
    pushJob.processedAt = new Date()
    await pushJob.save()
  }

  if (successCount > 0 || failedCount > 0) {
    const updateOp = { $inc: {} }
    if (successCount > 0) updateOp.$inc.successCount = successCount
    if (failedCount > 0) updateOp.$inc.failedCount = failedCount
    updateOp.$inc.processedEntities = successCount + failedCount

    await BulkAction.updateOne({ actionId: bulkActionId }, updateOp)
    logger.info(
      `[PushEntityWorker] Updated counts for BulkAction ${bulkActionId}: ${successCount} success, ${failedCount} failed.`
    )
  }

  const pendingJobs = await PushJob.countDocuments({
    bulkActionId,
    status: { $in: ['READY', 'PROCESSING'] },
  })

  if (pendingJobs === 0) {
    await BulkAction.updateOne(
      { actionId: bulkActionId },
      { $set: { status: 'COMPLETED', processingCompletedAt: new Date() } }
    )
    logger.info(
      `[PushEntityWorker] BulkAction ${bulkActionId} marked as COMPLETED.`
    )
  }

  return true
}

const consumePushEntityQueue = async () => {
  const channel = getChannel()
  const queueName = process.env.PUSH_ENTITY_QUEUE

  channel.consume(
    queueName,
    async msg => {
      if (msg !== null) {
        const messageData = JSON.parse(msg.content.toString())
        logger.info(
          `[PushEntityWorker] Consuming from ${queueName}: ${
            messageData.pushJobPayloads?.length || 0
          } entities for BA ${messageData.bulkActionId}`
        )
        try {
          const success = await pushEntityBatch(messageData)
          if (success) {
            channel.ack(msg)
          } else {
            logger.error(
              `[PushEntityWorker] Failed to process batch for ${messageData.bulkActionId}.`
            )
            channel.nack(msg, false, false)
          }
        } catch (err) {
          logger.error(
            `[PushEntityWorker] Unhandled error in consumer for ${messageData.bulkActionId}: ${err.message} - ${err.stack}.`
          )
          channel.nack(msg, false, false)
        }
      }
    },
    { noAck: false, prefetch: 1 }
  )
  logger.info(
    `[PushEntityWorker] Worker started and listening on queue: ${queueName}`
  )
}

module.exports = { consumePushEntityQueue, pushEntityBatch }
