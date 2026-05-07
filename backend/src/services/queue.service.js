import { redis } from '../config/redis.js';

const queueKey = process.env.REDIS_QUEUE_KEY || 'task_queue';

export const enqueueTask = async (payload) => {
  await redis.rpush(queueKey, JSON.stringify(payload));
};
