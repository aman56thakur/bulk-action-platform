const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')

const BulkActionSchema = new mongoose.Schema(
  {
    actionId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      default: 'BULK_UPDATE',
    },
    entityType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'PROCESSING',
        'PARTIALLY_COMPLETED',
        'COMPLETED',
        'FAILED',
        'SCHEDULED',
      ],
      default: 'PENDING',
    },
    originalFileName: {
      type: String,
    },
    filePath: {
      type: String,
    },
    totalEntities: {
      type: Number,
      default: 0,
    },
    processedEntities: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    skippedCount: {
      type: Number,
      default: 0,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    processingStartedAt: {
      type: Date,
    },
    processingCompletedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
    createdBy: {
      type: String,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('BulkAction', BulkActionSchema)
