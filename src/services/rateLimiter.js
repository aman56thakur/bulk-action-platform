const { getRedisClient } = require('../config/redis')
const logger = require('../utils/logger')
require('dotenv').config()

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
const RATE_LIMIT_MAX_REQUESTS = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS,
  10
)

// Checks if an account has exceeded its rate limit.
const checkRateLimit = async (accountId, incrementBy = 1) => {
  const redisClient = getRedisClient()
  if (!redisClient) {
    logger.warn(
      'Redis client not available for rate limiting. Allowing request.'
    )
    return { allowed: true, remaining: Infinity, retryAfterMs: null }
  }

  const currentTimeMs = Date.now()
  const windowStartMs =
    Math.floor(currentTimeMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS
  const key = `rate_limit:${accountId}:${windowStartMs}`

  try {
    const currentCount = await redisClient.get(key)
    const count = parseInt(currentCount, 10) || 0

    if (count + incrementBy > RATE_LIMIT_MAX_REQUESTS) {
      const ttl = await redisClient.ttl(key)
      const retryAfterMs =
        ttl > 0
          ? ttl * 1000
          : RATE_LIMIT_WINDOW_MS - (currentTimeMs - windowStartMs)
      logger.warn(
        `Rate limit exceeded for account ${accountId}. Count: ${count}, Max: ${RATE_LIMIT_MAX_REQUESTS}`
      )
      return {
        allowed: false,
        remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count),
        retryAfterMs,
      }
    }

    const newCount = await redisClient.incrBy(key, incrementBy)
    if (newCount === incrementBy) {
      // First time setting this key in this window
      await redisClient.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000))
    }

    if (newCount > RATE_LIMIT_MAX_REQUESTS) {
      // Prevent overshooting limits due to concurrent increments (race condition)
      await redisClient.decrBy(key, incrementBy)
      const ttl = await redisClient.ttl(key)
      const retryAfterMs =
        ttl > 0
          ? ttl * 1000
          : RATE_LIMIT_WINDOW_MS - (currentTimeMs - windowStartMs)
      logger.warn(
        `Rate limit exceeded for account ${accountId} due to concurrent increment. Count: ${
          newCount - incrementBy
        }, Max: ${RATE_LIMIT_MAX_REQUESTS}`
      )
      return {
        allowed: false,
        remaining: Math.max(
          0,
          RATE_LIMIT_MAX_REQUESTS - (newCount - incrementBy)
        ),
        retryAfterMs,
      }
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - newCount,
      retryAfterMs: null,
    }
  } catch (error) {
    logger.error(
      `Redis error during rate limiting for account ${accountId}: ${error.message}`
    )
    return { allowed: true, remaining: Infinity, retryAfterMs: null }
  }
}

module.exports = { checkRateLimit }
