import logging
from celery.utils.log import get_task_logger
from celery_config import celery_app
import time
from io import BytesIO
import requests

logger = get_task_logger(__name__)
logger.setLevel(logging.INFO)  
handler = logging.FileHandler('my_log.log')
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


@celery_app.task(name='tasks.record_stream')
def record_stream(url):
    global is_recording, audio_data
    response = requests.get(url, stream=True)
    
    if response.status_code != 200:
        raise Exception(f"Failed to connect to stream: {response.status_code}")

    audio_data = BytesIO()
    try:
        for chunk in response.iter_content(chunk_size=1024):
            if not is_recording:
                break
            audio_data.write(chunk)
    except Exception as e:
        print(f"An error occurred while recording: {e}")
    finally:
        response.close()

    audio_data.seek(0)