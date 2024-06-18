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


recording_bp = Blueprint('recording', __name__)

is_recording = False
record_thread = None
audio_data = BytesIO()
recordings_dir = "recordings"  # Directory where recordings are stored

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

@recording_bp.route('/start', methods=['POST'])
def start_recording():
    global is_recording, record_thread, start_time
    if not is_recording:
        is_recording = True
        start_time = time.time()
        print(start_time)
        record_thread = threading.Thread(target=record_stream, args=("http://stream.radiojar.com/bw66d94ksg8uv",))
        record_thread.start()
        print('RECORDING THREAD STARTED')
    return redirect(url_for('dashboard.dashboard'))

@recording_bp.route('/stop', methods=['POST'])
def stop_recording():
    global is_recording, record_thread, audio_data, start_time
    if is_recording:
        is_recording = False
        record_thread.join()
        print('RECORDING THREAD STOPPED')

        audio_segment = AudioSegment.from_mp3(audio_data)
        print(time.time() - start_time)

        elapsed_time = time.time() - start_time
        recording_duration = int(elapsed_time * 1000)  
        audio_segment = audio_segment[:recording_duration]

        if not os.path.exists(recordings_dir):
            os.makedirs(recordings_dir)
        
        print('EXPORTING AUDIO SEGMENT')
        output_file_path = os.path.join(recordings_dir, str(datetime.datetime.now().strftime("%d.%m.%Y")))
        #delete hash in name
        file_name_w_path = output_file_path + '_LiveProgramme' +  str(hash(datetime.datetime.now()))[:6]+ '.mp3'
        audio_segment.export(file_name_w_path, format="mp3")
        print(f"STREAM RECORDED AND SAVED AS: {output_file_path}")
        
        selected_artwork = request.form.get('existing-artworks')
        curr_date = datetime.datetime.today()
        curr_date = curr_date.strftime('%d')+ '.' + curr_date.strftime('%m') + '.' + curr_date.strftime('%Y')
        if selected_artwork:
            print('selected art', selected_artwork)
            artwork_path = os.path.join(thumbnails_dir, selected_artwork)
            
            (artwork_path)
            add_metadata(file_name_w_path, 'Morning Delight', f'Bant Yayini ({curr_date})',  '', artwork_path)
        else:
            add_metadata(file_name_w_path, 'Morning Delight', f'Bant Yayini ({curr_date})',  '', 'default_artwork.jpg')


        print('metadata applied')
        start_time = None
        audio_segment = BytesIO()

    return redirect(url_for('dashboard.dashboard'))

def add_metadata(file_path, title, artist, album, artwork_path):
    audio = MP3(file_path, ID3=ID3)
    
    try:
        audio.add_tags()
    except error:
        pass

    audio.tags.add(
        TIT2(encoding=3, text=title)
    )
    audio.tags.add(
        TPE1(encoding=3, text=artist)
    )
    audio.tags.add(
        TALB(encoding=3, text=album)
    )

    print(audio.tags.get('TPE1'))
    
    with open(artwork_path, 'rb') as albumart:
        audio.tags.add(
            APIC(
                encoding=3,
                mime='image/jpeg',
                type=3, 
                desc=u'Cover',
                data=albumart.read()
            )
        )

    audio.save()

@recording_bp.route('/status', methods=['GET'])
def status():
    global is_recording, start_time
    elapsed_time = 0
    if is_recording and start_time:
        elapsed_time = time.time() - start_time
    return jsonify({'is_recording': is_recording, 'elapsed_time': elapsed_time})

@recording_bp.route('/recordings/<filename>')
def get_recording(filename):
    try:
        print(f"Trying to send file: {filename}")
        print(recordings_dir + '/' + filename)
        return send_from_directory(recordings_dir, filename)
    except Exception as e:
        print(f"Error: {e} {filename}")
        return jsonify({"error": str(e)}), 404

@recording_bp.route('/recordings', methods=['GET'])
def get_recordings_list():
    def get_file_hash(file_content):
        hasher = hashlib.md5()
        hasher.update(file_content)
        return hasher.hexdigest()

    def get_metadata(filename):
        audio = MP3(filename, ID3=ID3)
        metadata = {
            'title': audio.tags.get('TIT2', 'Unknown Title').text[0] if 'TIT2' in audio.tags else 'Unknown Title',
            'album': audio.tags.get('TALB', 'Unknown Album').text[0] if 'TALB' in audio.tags else 'Unknown Album',
            'artist': audio.tags.get('TPE1', 'Unknown Artist').text[0] if 'TPE1' in audio.tags else 'Unknown Artist',
            'artwork': None,
            'duration': int(audio.info.length),
        }

        for tag in audio.tags.values():
            if isinstance(tag, APIC):
                artwork_data = tag.data
                artwork_hash = get_file_hash(artwork_data)
                mime_type = tag.mime
                extension = mimetypes.guess_extension(mime_type)

                if extension is None:
                    extension = ".jpg"  

                artwork_filename = f"{artwork_hash}{extension}"
                artwork_path = os.path.join(thumbnails_dir, artwork_filename)
                
                existing_files = [os.path.join(thumbnails_dir, f"{artwork_hash}{ext}") for ext in ['.jpg', '.jpeg', '.png']]
                file_exists = None
                for file in existing_files:
                    if os.path.exists(file):
                        file_exists = file
                        break

                if file_exists:
                    metadata['artwork'] = f"/static/assets/thumbnails/{os.path.basename(file_exists)}"
                else:
                    with open(artwork_path, 'wb') as img:
                        img.write(artwork_data)
                    metadata['artwork'] = f"/static/assets/thumbnails/{artwork_filename}"
                
                break

        return metadata

    try:
        recordings = os.listdir(recordings_dir)
        recordings_list = []
        for file in recordings:
            file_path = os.path.join(recordings_dir, file)
            if os.path.isfile(file_path):
                file_metadata = get_metadata(file_path)
                recordings_list.append({
                    'id': get_file_hash(file_metadata['title'].encode('utf-8') + file_metadata['artist'].encode('utf-8')),
                    'filename': file,
                    'title': file_metadata['title'],
                    'artist': file_metadata['artist'],
                    'album': file_metadata['album'],
                    'artwork': file_metadata['artwork'],
                    'duration': file_metadata['duration'],
                    'route_to_stream_it': url_for('recording.get_recording', filename=file)
                })
        return jsonify({'recordings': recordings_list})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
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
def get_redirect_url():
    base_url = 'http://stream.radiojar.com/bw66d94ksg8uv'
    if not base_url:
        return jsonify({'error': 'No URL provided'}), 400

    final_url = get_final_mp3_url(base_url)
    if final_url:
        return jsonify({'url': final_url})
    else:
        return jsonify({'error': 'Failed to retrieve the redirect MP3 stream URL'}), 500
    
thumbnails_dir = "static/assets/thumbnails"
if not os.path.exists(thumbnails_dir):
    os.makedirs(thumbnails_dir)

@recording_bp.route('/upload_artwork', methods=['POST'])
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
def get_artworks():
    try:
        artworks = os.listdir(thumbnails_dir)
        artworks_list = [file for file in artworks if os.path.isfile(os.path.join(thumbnails_dir, file))]
        return jsonify(artworks_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    
