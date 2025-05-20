const mongoose = require('mongoose')

const ContactSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
    },
    name: { type: String },
    email: { type: String, index: true },
    status: { type: String },
    age: { type: Number },
    city: { type: String },
    accountId: {
      type: String,
      index: true,
    },
    lastBulkActionId: String,
    lastBulkUpdatedAt: Date,
  },
  { timestamps: true }
)

ContactSchema.index(
  { email: 1, accountId: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
)

module.exports = mongoose.model('Contact', ContactSchema)
