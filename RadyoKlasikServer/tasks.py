# tasks.py

from celery import Celery
import requests
from io import BytesIO

celery = Celery('tasks', broker='redis://localhost:6379/0')

@celery.task
def record_stream(url):
    global audio_data
    response = requests.get(url, stream=True)

    if response.status_code != 200:
        raise Exception(f"Failed to connect to stream: {response.status_code}")

    audio_data = BytesIO()
    try:
        for chunk in response.iter_content(chunk_size=1024):
            if not audio_data:
                break
            audio_data.write(chunk)
    except Exception as e:
        print(f"An error occurred while recording: {e}")
    finally:
        response.close()

    audio_data.seek(0)
