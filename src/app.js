const express = require('express')
const { globalErrorHandler } = require('./utils/errorHandler')
const bulkActionRoutes = require('./routes/bulkActionRoutes')
const logger = require('./utils/logger')

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`)
  next()
})
app.use('/bulk-actions', bulkActionRoutes)
app.use(globalErrorHandler)

module.exports = app
