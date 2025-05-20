const { getRedisClient } = require('../config/redis')
const logger = require('../utils/logger')
const PushJob = require('../models/PushJob')
const BulkAction = require('../models/BulkAction')

const DEDUPLICATION_KEY_PREFIX = 'dedup_email'
const DEDUPLICATION_TTL_SECONDS = 24 * 60 * 60

// Checks if an email is a duplicate for a given bulk action or account.
const isDuplicateEmail = async (jobId, email, bulkActionId, entityIdInCsv) => {
  if (!email) return false

  const redisClient = getRedisClient()
  if (!redisClient) {
    logger.warn('Redis client not available for deduplication. Skipping check.')
    return false
  }

  const key = `${DEDUPLICATION_KEY_PREFIX}:${bulkActionId}:${email.toLowerCase()}`

  try {
    const isMember = await redisClient.exists(key)
    if (isMember) {
      logger.info(
        `Duplicate email found for bulkActionId ${bulkActionId}: ${email}. Entity ID in CSV: ${entityIdInCsv}`
      )

      await PushJob.findByIdAndUpdate(jobId, {
        status: 'SKIPPED',
        errorMessage: `Duplicate email: ${email}`,
        processedAt: new Date(),
      })

      await BulkAction.updateOne(
        { actionId: bulkActionId },
        { $inc: { skippedCount: 1, processedEntities: 1 } }
      )
      return true
    }
    return false
  } catch (error) {
    logger.error(
      `Redis error during deduplication check for email ${email}, bulkActionId ${bulkActionId}: ${error.message}`
    )
    return false
  }
}

// Marks an email as processed for deduplication purposes within a bulk action.
const markEmailAsProcessed = async (email, bulkActionId) => {
  if (!email) return
  const redisClient = getRedisClient()
  if (!redisClient) {
    logger.warn(
      'Redis client not available for marking email processed. Skipping.'
    )
    return
  }
  const key = `${DEDUPLICATION_KEY_PREFIX}:${bulkActionId}:${email.toLowerCase()}`
  try {
    await redisClient.set(key, 'processed', { EX: DEDUPLICATION_TTL_SECONDS })
  } catch (error) {
    logger.error(
      `Redis error during marking email ${email} as processed for bulkActionId ${bulkActionId}: ${error.message}`
    )
  }
}

module.exports = {
  isDuplicateEmail,
  markEmailAsProcessed,
}
