import datetime
from flask import Blueprint, jsonify, render_template, redirect, url_for, request, current_app
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from flask_login import login_user, login_required, logout_user
from models.user import User
import jwt
from functools import wraps

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.get("admin")
        if user and user.username == username and user.check_password(password):
            login_user(user)
            return redirect(url_for('dashboard.dashboard'))
        else:
            error = "Invalid username or password."
            return render_template('login.html', error=error)
    return render_template('login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))

def generate_token():
    expiration_time = datetime.datetime.utcnow() + datetime.timedelta(hours=5)
    token = jwt.encode({'exp': expiration_time}, current_app.config['SECRET_KEY'], algorithm='HS256')
    return token

@auth_bp.route('/generate_token', methods=['POST'])
def generate_access_token():
    data = request.get_json()
    if not data or data.get('shared_secret') != current_app.config['SHARED_SECRET_KEY']:
        return jsonify({'message': 'Unauthorized'}), 401

    token = generate_token()
    return jsonify({'access_token': token})

@auth_bp.route('/verify_token', methods=['POST'])
def verify_token():
    token = request.headers.get('Authorization').split()[1]
    try:
        jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        return jsonify({'message': 'Token is valid'}), 200
    except jwt.ExpiredSignatureError:
        return jsonify({'message': 'Token has expired'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'message': 'Invalid token'}), 401
    
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split()[1]

        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'token_expired', 'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token!'}), 401

        return f(*args, **kwargs)
    return decorated
