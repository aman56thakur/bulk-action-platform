const bulkActionService = require('../services/bulkActionService')
const { AppError } = require('../utils/errorHandler')
const logger = require('../utils/logger')
const { createBulkActionSchema } = require('../validators/bulkActionValidator')

const createBulkAction = async (req, res, next) => {
  try {
    const { error, value } = createBulkActionSchema.validate(req.body)
    if (error) {
      logger.warn(
        `Validation error creating bulk action: ${error.details[0].message}`
      )
      throw new AppError(error.details[0].message, 400)
    }

    if (!req.file) throw new AppError('CSV file is required.', 400)

    const accountId = value.accountId || req.user?.accountId
    if (!accountId) throw new AppError('Account ID is missing', 400)

    const actionData = { ...value, accountId }

    const bulkAction = await bulkActionService.createBulkAction(
      actionData,
      req.file
    )
    res.status(201).json({
      message: 'Bulk action created successfully and is being processed.',
      data: bulkAction,
    })
  } catch (err) {
    next(err)
  }
}

const getBulkAction = async (req, res, next) => {
  try {
    const { actionId } = req.params
    const bulkAction = await bulkActionService.getBulkActionById(actionId)
    res.status(200).json({ data: bulkAction })
  } catch (err) {
    next(err)
  }
}

const listBulkActions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1
    const limit = parseInt(req.query.limit, 10) || 10
    const filters = {}
    if (req.query.status) filters.status = req.query.status
    if (req.query.accountId) filters.accountId = req.query.accountId
    if (req.query.entityType) filters.entityType = req.query.entityType

    const result = await bulkActionService.listBulkActions(filters, {
      page,
      limit,
    })
    res.status(200).json({
      message: 'Bulk actions retrieved successfully.',
      data: result.actions,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalActions: result.totalActions,
        limit,
      },
    })
  } catch (err) {
    next(err)
  }
}

const getBulkActionStats = async (req, res, next) => {
  try {
    const { actionId } = req.params
    const stats = await bulkActionService.getBulkActionStats(actionId)
    res.status(200).json({
      message: 'Bulk action statistics retrieved successfully.',
      data: stats,
    })
  } catch (err) {
    next(err)
  }
}

const getBulkActionLogs = async (req, res, next) => {
  try {
    const { actionId } = req.params
    const { status, page = 1, limit = 50, entityId } = req.query
    const query = { bulkActionId: actionId }
    if (status) query.status = status
    if (entityId) query.entityId = entityId

    const options = {
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      limit: parseInt(limit, 10),
      sort: { createdAt: -1 },
    }

    const PushJob = require('../models/PushJob')
    const logs = await PushJob.find(
      query,
      {
        jobId: 1,
        entityId: 1,
        status: 1,
        errorMessage: 1,
        processedAt: 1,
      },
      options
    )
    const totalLogs = await PushJob.countDocuments(query)

    res.status(200).json({
      message: 'Logs retrieved successfully',
      data: logs,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(totalLogs / parseInt(limit, 10)),
        totalLogs,
        limit: parseInt(limit, 10),
      },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  createBulkAction,
  getBulkAction,
  listBulkActions,
  getBulkActionStats,
  getBulkActionLogs,
}
