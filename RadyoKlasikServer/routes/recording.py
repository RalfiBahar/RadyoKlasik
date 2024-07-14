import mimetypes
from flask import Blueprint, jsonify, redirect, url_for, send_from_directory, request
from flask_login import login_required
import time
import os
import threading
import requests
from pydub import AudioSegment
from io import BytesIO
import datetime
import urllib
import http
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, error
from werkzeug.utils import secure_filename
import hashlib
from sqlalchemy.orm import Session
from models.recording import Recording, SessionLocal
import datetime
import glob
from .auth import token_required
from tasks import record_stream
from celery_config import celery_app
from tasks import record_stream, stop_recording
import redis


recording_bp = Blueprint('recording', __name__)

redis_client = redis.StrictRedis(host='redis', port=6379, db=0)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@recording_bp.route('/start', methods=['POST'])
@token_required
def start_recording_route():
    global start_time
    if redis_client.get('is_recording').decode('utf-8') != 'true':
        start_time = time.time()
        task = record_stream.delay("http://stream.radiojar.com/bw66d94ksg8uv", start_time)
        return jsonify({"success": True, "task_id": task.id})
    return redirect(url_for('dashboard.dashboard'))

@recording_bp.route('/stop', methods=['POST'])
@token_required
def stop_recording_route():
    if redis_client.get('is_recording').decode('utf-8') == 'true':
        redis_client.set('is_recording', 'false')
        return jsonify({"success": True, "message": "Recording stopped."})
    return redirect(url_for('dashboard.dashboard'))

@recording_bp.route('/status', methods=['GET'])
@token_required
def status():
    global is_recording, start_time
    elapsed_time = 0
    if is_recording and start_time:
        elapsed_time = time.time() - start_time
    return jsonify({'is_recording': is_recording, 'elapsed_time': elapsed_time})

@recording_bp.route('/recordings/<filename>')
# think about how this could work, when getting 
#@token_required
def get_recording(filename):
    try:
        print(f"Trying to send file: {filename}")
        db = next(get_db())
        recording = db.query(Recording).filter(Recording.filename == filename).first()
        if not recording:
            return jsonify({'error': 'Recording not found'}), 404

        recording.play_count += 1
        db.commit()
        return send_from_directory(recordings_dir, filename)
    except Exception as e:
        print(f"Error: {e} {filename}")
        return jsonify({"error": str(e)}), 404

@recording_bp.route('/recordings', methods=['GET'])
@token_required
def get_recordings_list():
    db = next(get_db())
    recordings = db.query(Recording).order_by(Recording.date.desc()).all()
    recordings_list = [
        {
            'id': recording.id,
            'filename': recording.filename,
            'title': recording.title,
            'artist': recording.artist,
            'album': recording.album,
            'artwork': recording.artwork,
            'duration': recording.duration,
            'size': recording.size,
            'date': recording.date,
            'stream': recording.stream,#url_for('recording.get_recording', filename=os.path.basename(recording.filename))
            'play_count': recording.play_count,
        }
        for recording in recordings
    ]
    return jsonify({'recordings': recordings_list})


def get_final_mp3_url(base_url):
    try:
        parsed_url = urllib.parse.urlparse(base_url)
        scheme = parsed_url.scheme
        conn = http.client.HTTPConnection(parsed_url.netloc) if scheme == "http" else http.client.HTTPSConnection(parsed_url.netloc)
        path = parsed_url.path + "?" + parsed_url.query if parsed_url.query else parsed_url.path
        conn.request("GET", path)
        response = conn.getresponse()
        while response.status in [301, 302, 303, 307, 308]:
            redirect_url = response.getheader('Location')
            if not redirect_url:
                break
            
            print(f"Redirecting to: {redirect_url}")
            return redirect_url
    
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

@recording_bp.route('/get_redirect', methods=['GET'])
@token_required
def get_redirect_url():
    base_url = 'http://stream.radiojar.com/bw66d94ksg8uv'
    if not base_url:
        return jsonify({'error': 'No URL provided'}), 400

    final_url = get_final_mp3_url(base_url)
    if final_url:
        return jsonify({'url': final_url})
    else:
        return jsonify({'error': 'Failed to retrieve the redirect MP3 stream URL'}), 500


@recording_bp.route('/upload_artwork', methods=['POST'])
@token_required
def upload_artwork():
    if 'artwork' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['artwork']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        file_content = file.read()
        file_hash = hashlib.md5(file_content).hexdigest()
        
        mime_type = file.mimetype
        extension = mimetypes.guess_extension(mime_type)
        if extension is None:
            extension = ".jpg" 
        
        filename = f"{file_hash}{extension}"
        
        file_path = os.path.join(thumbnails_dir, filename)
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        return redirect(url_for('dashboard.dashboard'))

@recording_bp.route('/get_artworks', methods=['GET'])
@token_required
def get_artworks():
    try:
        artworks = os.listdir(thumbnails_dir)
        artworks_list = [file for file in artworks if os.path.isfile(os.path.join(thumbnails_dir, file))]
        artworks_list.sort(key=lambda x: os.path.getmtime(os.path.join(thumbnails_dir, x)), reverse=True)
        return jsonify(artworks_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def get_file_hash(file_content):
        hasher = hashlib.md5()
        hasher.update(file_content)
        return hasher.hexdigest()    

@recording_bp.route('/replace', methods=['POST'])
@token_required
def replace_recording():
    recording_id = request.form.get('recording_id')
    if 'replacement' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['replacement']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if recording_id and file:
        db = next(get_db())
        existing_recording = db.query(Recording).filter(Recording.id == recording_id).first()
        if not existing_recording:
            return jsonify({'error': 'Recording not found'}), 404

        replacement_path = os.path.join(recordings_dir, existing_recording.filename)
        file.save(replacement_path)

        recording_size = os.path.getsize(replacement_path) / (1024 * 1024)  # size in MB

        audio = MP3(replacement_path, ID3=ID3)
        duration = int(audio.info.length)
        title = audio.tags.get('TIT2', existing_recording.title).text[0] if 'TIT2' in audio.tags else existing_recording.title
        artist = audio.tags.get('TPE1', existing_recording.artist).text[0] if 'TPE1' in audio.tags else existing_recording.artist
        album = audio.tags.get('TALB', existing_recording.album).text[0] if 'TALB' in audio.tags else existing_recording.album

        existing_recording.size = recording_size
        existing_recording.duration = duration
        existing_recording.title = title
        existing_recording.artist = artist
        existing_recording.album = album
        #existing_recording.date = datetime.datetime.utcnow() UNCOMMENT IF YOU WANT TO CHANGE DATE 

        # Update artwork if present in the new file
        for tag in audio.tags.values():
            if isinstance(tag, APIC):
                artwork_data = tag.data
                artwork_hash = get_file_hash(artwork_data)
                mime_type = tag.mime
                extension = mimetypes.guess_extension(mime_type)

                if extension is None:
                    extension = ".jpg"  # Default to .jpg if the MIME type is unknown

                artwork_filename = f"{artwork_hash}{extension}"
                artwork_path = os.path.join(thumbnails_dir, artwork_filename)

                # Check for existing files with any extension
                existing_files = [
                    os.path.join(thumbnails_dir, f"{artwork_hash}{ext}")
                    for ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']
                ]
                file_exists = None
                for file in existing_files:
                    if os.path.exists(file):
                        file_exists = file
                        break

                if file_exists:
                    artwork_filename = os.path.basename(file_exists)
                else:
                    artwork_filename = f"{artwork_hash}{extension}"
                    artwork_path = os.path.join(thumbnails_dir, artwork_filename)
                    with open(artwork_path, 'wb') as img:
                        img.write(artwork_data)

                existing_recording.artwork = f"/static/assets/thumbnails/{artwork_filename}"
                break

        db.commit()

        return jsonify({'message': 'Recording replaced and updated successfully'}), 200
    else:
        return jsonify({'error': 'Invalid request'}), 400

@recording_bp.route('/remove/<recording_id>', methods=['DELETE'])
@token_required
def remove_recording(recording_id):
    db = next(get_db())
    existing_recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not existing_recording:
        return jsonify({'error': 'Recording not found'}), 404

    recording_path = os.path.join(recordings_dir, existing_recording.filename)
    if os.path.exists(recording_path):
        os.remove(recording_path)

    '''
    if existing_recording.artwork:
        artwork_path = existing_recording.artwork.replace("/static/assets/thumbnails/", "")
        artwork_path = os.path.join(thumbnails_dir, artwork_path)

        other_recordings_using_artwork = db.query(Recording).filter(Recording.artwork == existing_recording.artwork).count()

        if other_recordings_using_artwork == 1: 
            if os.path.exists(artwork_path):
                os.remove(artwork_path)
    '''
    db.delete(existing_recording)
    db.commit()

    return jsonify({'message': 'Recording removed successfully'}), 200


@recording_bp.route('/remove_artwork/<artwork_filename>', methods=['DELETE'])
@token_required
def remove_artwork(artwork_filename):
    db = next(get_db())
    
    artwork_path = os.path.join(thumbnails_dir, artwork_filename)

    if not os.path.exists(artwork_path):
        return jsonify({'error': 'Artwork not found'}), 404

    artwork_base = os.path.splitext(artwork_filename)[0]

    recordings_using_artwork = db.query(Recording).filter(Recording.artwork.like(f"%{artwork_base}%")).count()

    if recordings_using_artwork > 0:
        return jsonify({'error': 'Artwork is being used by one or more recordings'}), 400

    os.remove(artwork_path)

    return jsonify({'message': 'Artwork removed successfully'}), 200

