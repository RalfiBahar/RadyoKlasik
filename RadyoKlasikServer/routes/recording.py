from flask import Blueprint, jsonify, redirect, url_for, send_from_directory
from flask_login import login_required
import time
import os
import threading
import requests
from pydub import AudioSegment
from io import BytesIO
import datetime

recording_bp = Blueprint('recording', __name__)

is_recording = False
record_thread = None
audio_data = BytesIO()
recordings_dir = "recordings"  # Directory where recordings are stored
output_file_path = os.path.join(recordings_dir, "recorded_stream")

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
        audio_segment.export(output_file_path + '_' + str(datetime.datetime.now()).replace(' ', '') + '.mp3', format="mp3")
        print(f"STREAM RECORDED AND SAVED AS: {output_file_path}")
        start_time = None
        audio_segment = BytesIO()

    return redirect(url_for('dashboard.dashboard'))

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
    try:
        recordings = os.listdir(recordings_dir)
        recordings_list = [file for file in recordings if os.path.isfile(os.path.join(recordings_dir, file))]
        return jsonify(recordings_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
