const Joi = require('joi')

const createBulkActionSchema = Joi.object({
  accountId: Joi.string().required().messages({
    'string.empty': 'Account ID is required.',
    'any.required': 'Account ID is required.',
  }),
  entityType: Joi.string()
    .required()
    .valid('Contact', 'Company', 'Lead', 'Opportunity', 'Task')
    .messages({
      'string.empty': 'Entity type is required.',
      'any.required': 'Entity type is required.',
      'any.only': 'Invalid entity type.',
    }),
  actionType: Joi.string()
    .default('BULK_UPDATE')
    .valid('BULK_UPDATE')
    .messages({
      'any.only':
        'Invalid action type. Only BULK_UPDATE is currently supported.',
    }),
  scheduledAt: Joi.date().iso().optional().allow(null).messages({
    'date.format': 'ScheduledAt must be a valid ISO 8601 date.',
  }),
})

module.exports = {
  createBulkActionSchema,
}
