const BulkAction = require('../models/BulkAction')
const PushJob = require('../models/PushJob')
const { publishToQueue, PROCESS_FILE_QUEUE } = require('../config/rabbitmq')
const logger = require('../utils/logger')
const { AppError } = require('../utils/errorHandler')
require('dotenv').config()

// Creates a new bulk action and queues it for processing.
const createBulkAction = async (data, file) => {
  if (!file) throw new AppError('CSV file is required for bulk action.', 400)

  const { accountId, entityType, actionType, scheduledAt } = data

  const bulkAction = new BulkAction({
    accountId,
    entityType,
    actionType: actionType || 'BULK_UPDATE',
    originalFileName: file.originalname,
    filePath: file.path,
    status: scheduledAt ? 'SCHEDULED' : 'PENDING',
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  })
  await bulkAction.save()
  logger.info(
    `Bulk action ${bulkAction.actionId} created for account ${bulkAction.accountId}, entity ${entityType}. Status: ${bulkAction.status}`
  )

  if (bulkAction.status === 'PENDING') {
    await publishToQueue(PROCESS_FILE_QUEUE, {
      bulkActionId: bulkAction.actionId,
    })
    logger.info(
      `Bulk action ${bulkAction.actionId} published to ${PROCESS_FILE_QUEUE}.`
    )
  } else if (bulkAction.status === 'SCHEDULED') {
    logger.info(
      `Bulk action ${bulkAction.actionId} is scheduled for ${bulkAction.scheduledAt}.`
    )
  }

  return bulkAction
}

const getBulkActionById = async actionId => {
  const action = await BulkAction.findOne({ actionId })
  if (!action) {
    throw new AppError('Bulk action not found.', 404)
  }
  return action
}

const listBulkActions = async (
  filters = {},
  pagination = { page: 1, limit: 10 }
) => {
  const { page, limit } = pagination
  const skip = (page - 1) * limit

  const actions = await BulkAction.find(filters)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)

  const totalActions = await BulkAction.countDocuments(filters)

  return {
    actions,
    totalPages: Math.ceil(totalActions / limit),
    currentPage: page,
    totalActions,
  }
}

// Retrieves statistics for a bulk action.
const getBulkActionStats = async actionId => {
  const bulkAction = await BulkAction.findOne({ actionId })
  if (!bulkAction) {
    throw new AppError('Bulk action not found for stats.', 404)
  }

  const stats = await PushJob.aggregate([
    { $match: { bulkActionId: actionId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ])

  const summary = {
    actionId: bulkAction.actionId,
    status: bulkAction.status,
    totalEntitiesQueued: await PushJob.countDocuments({
      bulkActionId: actionId,
    }),
    success: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    processing: 0,
  }

  stats.forEach(stat => {
    if (stat._id === 'SUCCESS') summary.success = stat.count
    else if (stat._id === 'FAILED') summary.failed = stat.count
    else if (stat._id === 'SKIPPED') summary.skipped = stat.count
    else if (stat._id === 'READY') summary.pending += stat.count
    else if (stat._id === 'PROCESSING') summary.processing += stat.count
  })

  bulkAction.successCount = summary.success
  bulkAction.failedCount = summary.failed
  bulkAction.skippedCount = summary.skipped
  bulkAction.processedEntities =
    summary.success + summary.failed + summary.skipped

  if (
    bulkAction.processedEntities > 0 &&
    bulkAction.processedEntities < summary.totalEntitiesQueued &&
    bulkAction.status !== 'PROCESSING'
  ) {
    bulkAction.status = 'PARTIALLY_COMPLETED'
  } else if (
    bulkAction.processedEntities === summary.totalEntitiesQueued &&
    summary.totalEntitiesQueued > 0
  ) {
    bulkAction.status = 'COMPLETED'
    bulkAction.processingCompletedAt = new Date()
  }

  await bulkAction.save()

  return {
    actionId: bulkAction.actionId,
    overallStatus: bulkAction.status,
    totalEntitiesInFile: bulkAction.totalEntities,
    totalPushJobsCreated: summary.totalPushJobsCreated,
    successCount: summary.success,
    failedCount: summary.failed,
    skippedCount: summary.skipped,
    pendingCount: summary.pending,
    processingCount: summary.processing,
    processingStartedAt: bulkAction.processingStartedAt,
    processingCompletedAt: bulkAction.processingCompletedAt,
  }
}

module.exports = {
  createBulkAction,
  getBulkActionById,
  listBulkActions,
  getBulkActionStats,
}
