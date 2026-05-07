import json
import logging
import os
import time
from datetime import datetime

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from redis import Redis
from redis.exceptions import RedisError

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

mongo = MongoClient(os.getenv('MONGODB_URI'))
tasks_collection = mongo.get_default_database()['tasks']
redis_client = Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=int(os.getenv('REDIS_PORT', '6379')),
    decode_responses=True,
)

QUEUE_KEY = os.getenv('REDIS_QUEUE_KEY', 'task_queue')
POLL_TIMEOUT = int(os.getenv('WORKER_POLL_TIMEOUT', '5'))
MAX_RETRIES = 3


def now_log(message: str) -> str:
    return f"{datetime.utcnow().isoformat()} - {message}"


def process_operation(operation: str, text: str) -> str:
    if operation == 'uppercase':
        return text.upper()
    if operation == 'lowercase':
        return text.lower()
    if operation == 'reverse':
        return text[::-1]
    if operation == 'wordcount':
        return str(len([w for w in text.split() if w]))
    raise ValueError(f'Unsupported operation: {operation}')


def update_task(task_id: str, **updates):
    tasks_collection.update_one({'_id': ObjectId(task_id)}, {'$set': updates})


def push_log(task_id: str, message: str):
    tasks_collection.update_one(
        {'_id': ObjectId(task_id)},
        {'$push': {'logs': now_log(message)}, '$set': {'updatedAt': datetime.utcnow()}},
    )


def handle_job(payload: dict):
    task_id = payload['taskId']
    task = tasks_collection.find_one({'_id': ObjectId(task_id)})
    if not task:
        logging.warning('Task not found for payload=%s', payload)
        return

    update_task(task_id, status='running', updatedAt=datetime.utcnow())
    push_log(task_id, 'task started by worker')

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = process_operation(task['operation'], task['input'])
            tasks_collection.update_one(
                {'_id': ObjectId(task_id)},
                {
                    '$set': {'status': 'success', 'result': result, 'updatedAt': datetime.utcnow()},
                    '$push': {'logs': now_log('task completed successfully')},
                },
            )
            return
        except Exception as exc:
            push_log(task_id, f'attempt {attempt} failed: {exc}')
            logging.exception('Task %s failed on attempt %s', task_id, attempt)
            if attempt == MAX_RETRIES:
                update_task(task_id, status='failed', updatedAt=datetime.utcnow())
                push_log(task_id, 'task marked failed after retries')
            else:
                time.sleep(1)


def run_worker():
    logging.info('Worker started. Listening on queue %s', QUEUE_KEY)
    while True:
        try:
            job = redis_client.blpop(QUEUE_KEY, timeout=POLL_TIMEOUT)
            if not job:
                continue
            _, raw_payload = job
            payload = json.loads(raw_payload)
            handle_job(payload)
        except RedisError:
            logging.exception('Redis error encountered. Retrying in 2 seconds')
            time.sleep(2)
        except Exception:
            logging.exception('Unexpected worker loop error')


if __name__ == '__main__':
    run_worker()
