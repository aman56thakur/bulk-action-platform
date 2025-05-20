const mongoose = require('mongoose')
const logger = require('../utils/logger')
require('dotenv').config()

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    logger.info('MongoDB Connected...')
  } catch (err) {
    logger.error(`MongoDB Connection Error: ${err.message}`)
    process.exit(1)
  }
}

module.exports = connectDB
