const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')

const PushJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    bulkActionId: {
      type: String,
      required: true,
      index: true,
      ref: 'BulkAction',
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: String,
      index: true,
    },
    payload: {
      type: Object,
      required: true,
    },
    status: {
      type: String,
      enum: ['READY', 'PROCESSING', 'SUCCESS', 'FAILED', 'SKIPPED'],
      default: 'READY',
      index: true,
    },
    errorMessage: {
      type: String,
    },
    processedAt: {
      type: Date,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('PushJob', PushJobSchema)
