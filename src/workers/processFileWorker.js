const fs = require('fs')
const csv = require('csv-parser')
const BulkAction = require('../models/BulkAction')
const PushJob = require('../models/PushJob')
const {
  getChannel,
  publishToQueue,
  PROCESS_PUSHJOB_QUEUE,
} = require('../config/rabbitmq')
const logger = require('../utils/logger')
require('dotenv').config()

const FILE_PROCESSING_BATCH_SIZE =
  parseInt(process.env.FILE_PROCESSING_BATCH_SIZE, 10) || 100

const processFile = async msgData => {
  const { bulkActionId } = msgData
  let bulkAction = await BulkAction.findOne({ actionId: bulkActionId })
  if (!bulkAction) {
    logger.error(
      `[ProcessFileWorker] BulkAction ${bulkActionId} not found. Discarding message.`
    )
    return false
  }

  const { filePath, entityType, accountId, originalFileName } = bulkAction
  logger.info(
    `[ProcessFileWorker] Received job for bulkActionId: ${bulkActionId}, file: ${filePath}`
  )

  if (
    bulkAction.status === 'PROCESSING' ||
    bulkAction.status === 'COMPLETED' ||
    bulkAction.status === 'FAILED'
  ) {
    logger.warn(
      `[ProcessFileWorker] BulkAction ${bulkActionId} already processed or in a terminal state: ${bulkAction.status}. Skipping.`
    )
    return true
  }

  bulkAction.status = 'PROCESSING'
  bulkAction.processingStartedAt = new Date()
  await bulkAction.save()

  let pushJobBatch = []
  let totalEntitiesInFile = 0
  let jobsCreated = 0

  try {
    const stream = fs.createReadStream(filePath).pipe(csv())

    for await (const row of stream) {
      totalEntitiesInFile++
      const { id, ...updateData } = row
      if (!id) {
        logger.warn(
          `[ProcessFileWorker] Row in ${originalFileName} for bulkAction ${bulkActionId} is missing 'id'. Skipping row: ${JSON.stringify(
            row
          )}`
        )
        bulkAction.failedCount = (bulkAction.failedCount || 0) + 1
        continue
      }

      const pushJob = {
        bulkActionId,
        accountId,
        entityType,
        entityId: id,
        payload: updateData,
      }
      pushJobBatch.push(pushJob)

      if (pushJobBatch.length >= FILE_PROCESSING_BATCH_SIZE) {
        const createdJobs = await PushJob.insertMany(pushJobBatch)
        const jobIds = createdJobs.map(job => job.jobId)
        await publishToQueue(PROCESS_PUSHJOB_QUEUE, {
          bulkActionId,
          accountId,
          entityType,
          jobIds,
        })
        jobsCreated += createdJobs.length
        logger.info(
          `[ProcessFileWorker] Batch of ${createdJobs.length} pushJobs for ${bulkActionId} sent to ${PROCESS_PUSHJOB_QUEUE}.`
        )
        pushJobBatch = []
      }
    }

    if (pushJobBatch.length > 0) {
      const createdJobs = await PushJob.insertMany(pushJobBatch)
      const jobIds = createdJobs.map(job => job.jobId)
      await publishToQueue(PROCESS_PUSHJOB_QUEUE, {
        bulkActionId,
        jobIds,
      })
      jobsCreated += createdJobs.length
      logger.info(
        `[ProcessFileWorker] Final batch of ${createdJobs.length} pushJobs for ${bulkActionId} sent to ${PROCESS_PUSHJOB_QUEUE}.`
      )
    }

    bulkAction.totalEntities = totalEntitiesInFile
    if (jobsCreated === 0 && totalEntitiesInFile > 0) {
      bulkAction.status = 'FAILED'
      bulkAction.errorMessage =
        'No valid entities found in the CSV file to process.'
      bulkAction.processingCompletedAt = new Date()
    } else if (jobsCreated === 0 && totalEntitiesInFile === 0) {
      bulkAction.status = 'FAILED'
      bulkAction.errorMessage =
        'The CSV file was empty or contained no processable data rows.'
      bulkAction.processingCompletedAt = new Date()
    }

    await bulkAction.save()
    logger.info(
      `[ProcessFileWorker] Finished processing file for bulkActionId: ${bulkActionId}. Total entities in file: ${totalEntitiesInFile}, PushJobs created: ${jobsCreated}.`
    )

    fs.unlink(filePath, err => {
      if (err)
        logger.error(
          `[ProcessFileWorker] Failed to delete temp file ${filePath}: ${err.message}`
        )
      else logger.info(`[ProcessFileWorker] Temp file ${filePath} deleted.`)
    })
    return true
  } catch (error) {
    logger.error(
      `[ProcessFileWorker] Error processing file for bulkActionId ${bulkActionId}: ${error.message} - ${error.stack}`
    )
    bulkAction.status = 'FAILED'
    bulkAction.errorMessage = `File processing error: ${error.message}`
    bulkAction.processingCompletedAt = new Date()
    await bulkAction.save()
    return false
  }
}

const consumeProcessFileQueue = async () => {
  const channel = getChannel()
  const queueName = process.env.PROCESS_FILE_QUEUE

  channel.consume(
    queueName,
    async msg => {
      if (msg !== null) {
        const messageData = JSON.parse(msg.content.toString())
        logger.info(
          `[ProcessFileWorker] Consuming from ${queueName}: ${JSON.stringify(
            messageData
          )}`
        )
        try {
          const success = await processFile(messageData)
          if (success) {
            channel.ack(msg)
          } else {
            logger.warn(
              `[ProcessFileWorker] NACKing message for ${messageData.bulkActionId} due to processing failure.`
            )
            channel.nack(msg, false, false)
          }
        } catch (err) {
          logger.error(
            `[ProcessFileWorker] Unhandled error in consumer for ${messageData.bulkActionId}: ${err.message}. NACKing.`
          )
          channel.nack(msg, false, false)
        }
      }
    },
    { noAck: false }
  )
  logger.info(
    `[ProcessFileWorker] Worker started and listening on queue: ${queueName}`
  )
}

module.exports = { consumeProcessFileQueue, processFile }
