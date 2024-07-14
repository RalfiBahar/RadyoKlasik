from flask import Flask, Blueprint
from flask_login import LoginManager
from models.user import User
from dotenv import load_dotenv
import os

from celery_config import celery_app
load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # will be moved to .env
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
    app.config['SHARED_SECRET_KEY'] = os.getenv('SHARED_SECRET_KEY')
    
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    celery_app.autodiscover_tasks(['tasks'], force=True)

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(user_id)

    from routes.auth import auth_bp
    from routes.recording import recording_bp
    from routes.dashboard import dashboard_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(recording_bp, url_prefix='/recording')
    app.register_blueprint(dashboard_bp)

    return app, celery

app, celery = create_app()
celery_app = celery

if __name__ == "__main__":
    app.run(host='localhost', port=8001, debug=True)