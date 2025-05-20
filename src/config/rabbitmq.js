const amqp = require('amqplib')
const logger = require('../utils/logger')
require('dotenv').config()

const { PROCESS_FILE_QUEUE, PROCESS_PUSHJOB_QUEUE, PUSH_ENTITY_QUEUE } =
  process.env

let channel = null
let connection = null

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URI)
    channel = await connection.createChannel()

    await channel.assertQueue(PROCESS_FILE_QUEUE, { durable: true })
    await channel.assertQueue(PROCESS_PUSHJOB_QUEUE, { durable: true })
    await channel.assertQueue(PUSH_ENTITY_QUEUE, { durable: true })

    logger.info('RabbitMQ Connected and Queues Assured...')
  } catch (error) {
    logger.error(`RabbitMQ Connection Error: ${error.message}`)
    setTimeout(connectRabbitMQ, 5000)
  }
}

const getChannel = () => {
  if (!channel) {
    throw new Error('RabbitMQ channel not available. Connect first.')
  }
  return channel
}

const publishToQueue = async (queueName, message) => {
  try {
    getChannel().sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    })
    logger.info(
      `Message sent to queue ${queueName}: ${JSON.stringify(message).substring(
        0,
        100
      )}...`
    )
  } catch (error) {
    logger.error(`Error publishing to queue ${queueName}: ${error.message}`)
    throw error
  }
}

// Function to publish a message with a delay (using RabbitMQ's dead-letter exchange and TTL)
const publishToQueueWithDelay = async (queueName, message, delayMs) => {
  try {
    const ch = getChannel()
    const deadLetterExchange = 'dlx'
    const delayedQueueName = `${queueName}.delayed.${delayMs}`
    const targetQueue = queueName

    await ch.assertExchange(deadLetterExchange, 'direct', { durable: true })
    await ch.assertQueue(delayedQueueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': deadLetterExchange,
        'x-dead-letter-routing-key': targetQueue,
        'x-message-ttl': delayMs,
      },
    })

    await ch.bindQueue(targetQueue, deadLetterExchange, targetQueue)

    ch.sendToQueue(delayedQueueName, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    })
    logger.info(
      `Message scheduled to be sent to queue ${targetQueue} with delay ${delayMs}ms: ${JSON.stringify(
        message
      ).substring(0, 100)}...`
    )
  } catch (error) {
    logger.error(
      `Error publishing delayed message to queue ${queueName}: ${error.message}`
    )
    throw error
  }
}

module.exports = {
  connectRabbitMQ,
  getChannel,
  publishToQueue,
  publishToQueueWithDelay,
  PROCESS_FILE_QUEUE,
  PROCESS_PUSHJOB_QUEUE,
  PUSH_ENTITY_QUEUE,
}
