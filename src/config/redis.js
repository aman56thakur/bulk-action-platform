const { createClient } = require('redis')
const logger = require('../utils/logger')
require('dotenv').config()

const redisClient = createClient({
  url: process.env.REDIS_URL,
})

redisClient.on('error', err => logger.error('Redis Client Error', err))
redisClient.on('connect', () => logger.info('Redis Connected...'))

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect()
  }
}

const getRedisClient = () => {
  if (!redisClient.isOpen)
    logger.warn('Redis client was not open, attempting to connect now.')
  return redisClient
}

module.exports = {
  connectRedis,
  getRedisClient,
  redisClient,
}
