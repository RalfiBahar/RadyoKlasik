from flask import Blueprint

auth_bp = Blueprint('auth', __name__)
recording_bp = Blueprint('recording', __name__)

from . import auth, recording
