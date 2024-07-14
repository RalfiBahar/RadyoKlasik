from celery import Celery
import os
from dotenv import load_dotenv


celery_app = Celery('main', broker='redis://redis:6379/0', backend='redis://redis:6379/0')
celery_app.autodiscover_tasks(['tasks'])  # Adjust with the actual name of your tasks module if necessary

# Task routing
celery_app.conf.task_routes = {
    'tasks.apiworld': {'queue': 'cloud_queue'},  # Route 'tasks.apiworld' tasks to 'cloud_queue'
}

celery_app.conf.update(
    result_expires=60,  # 1 minute
)


import tasks  # Import tasks module to register tasks

# Check Redis connection
with celery_app.connection() as connection:
    connection.ensure_connection()
    print("Connected to Redis successfully")