import logging
from celery.utils.log import get_task_logger
from celery_config import celery_app
import time
from io import BytesIO
import requests
from pydub import AudioSegment
import os
import datetime
from mutagen.mp3 import MP3, ID3, TIT2, TPE1, TALB, APIC, error
import glob
from sqlalchemy.orm import Session
from models.recording import Recording, SessionLocal
from flask import url_for
import redis
import hashlib

logger = get_task_logger(__name__)

redis_client = redis.StrictRedis(host='redis', port=6379, db=0)

recordings_dir = "recordings"  # Directory where recordings are stored
thumbnails_dir = "static/assets/thumbnails"
if not os.path.exists(thumbnails_dir):
    try:
        os.makedirs(thumbnails_dir)
    except FileExistsError:
        # Directory already exists
        pass

@celery_app.task(name='tasks.record_stream')
def record_stream(url, start_time):
    redis_client.set('is_recording', 'true')
    response = requests.get(url, stream=True)
    if response.status_code != 200:
        raise Exception(f"Failed to connect to stream: {response.status_code}")

    audio_data = BytesIO()
    try:
        for chunk in response.iter_content(chunk_size=1024):
            if redis_client.get('is_recording').decode('utf-8') != 'true':
                break
            audio_data.write(chunk)
    except Exception as e:
        logger.error(f"An error occurred while recording: {e}")
    finally:
        response.close()

    audio_data.seek(0)
    stop_recording.delay(audio_data.getvalue(), start_time)

@celery_app.task(name='tasks.stop_recording')
def stop_recording(audio_data_bytes, start_time):
    audio_data = BytesIO(audio_data_bytes)
    elapsed_time = time.time() - start_time
    recording_duration = int(elapsed_time * 1000)  
    audio_segment = AudioSegment.from_mp3(audio_data)[:recording_duration]

    if not os.path.exists(recordings_dir):
        os.makedirs(recordings_dir)
    
    file_name = str(datetime.datetime.now().strftime("%d%m%Y")) + '_LiveProgramme' + str(hash(datetime.datetime.now()))[:6] + '.mp3'
    file_name_w_path = os.path.join(recordings_dir, file_name)
    audio_segment.export(file_name_w_path, format="mp3")

    selected_artwork = ""  # You'll need to pass this from the request
    curr_date = datetime.datetime.today().strftime('%d.%m.%Y')
    if selected_artwork:
        artwork_path = os.path.join(thumbnails_dir, selected_artwork)
        add_metadata(file_name_w_path, 'Morning Delight', f'Bant Yayini ({curr_date})', '', artwork_path)
    else:
        list_of_files = glob.glob(os.path.join(thumbnails_dir, '*'))
        artwork_path = max(list_of_files, key=os.path.getmtime)
        add_metadata(file_name_w_path, 'Morning Delight', f'Bant Yayini ({curr_date})', '', artwork_path)

    db = SessionLocal()
    recording_id = get_file_hash(file_name_w_path.encode('utf-8'))
    recording_size = os.path.getsize(file_name_w_path) / (1024 * 1024)
    new_recording = Recording(
        id=recording_id,
        filename=file_name,
        stream=url_for('recording.get_recording', filename=os.path.basename(file_name)),
        title='Morning Delight',
        artist=f'Bant Yayini ({curr_date})',
        album='',
        artwork=artwork_path,
        duration=recording_duration // 1000,
        size=recording_size,
        date=datetime.datetime.utcnow()
    )
    db.add(new_recording)
    db.commit()
    db.refresh(new_recording)
    db.close()

def add_metadata(file_path, title, artist, album, artwork_path):
    audio = MP3(file_path, ID3=ID3)
    try:
        audio.add_tags()
    except error:
        pass

    audio.tags.add(TIT2(encoding=3, text=title))
    audio.tags.add(TPE1(encoding=3, text=artist))
    audio.tags.add(TALB(encoding=3, text=album))

    with open(artwork_path, 'rb') as albumart:
        audio.tags.add(APIC(encoding=3, mime='image/jpeg', type=3, desc=u'Cover', data=albumart.read()))

    audio.save()

def get_file_hash(file_content):
    hasher = hashlib.md5()
    hasher.update(file_content)
    return hasher.hexdigest()
