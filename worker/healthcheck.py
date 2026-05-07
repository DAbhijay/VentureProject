import os
import sys
from pymongo import MongoClient
from redis import Redis

try:
    redis_client = Redis(host=os.getenv('REDIS_HOST', 'redis'), port=int(os.getenv('REDIS_PORT', '6379')))
    redis_client.ping()
    mongo = MongoClient(os.getenv('MONGODB_URI'))
    mongo.admin.command('ping')
except Exception:
    sys.exit(1)

sys.exit(0)
