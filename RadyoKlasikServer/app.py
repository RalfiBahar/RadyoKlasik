from flask import Flask, Blueprint
from flask_login import LoginManager
from models import User
from routes import auth, recording

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'bd9617be2f088115cedb35df03aaeb76476ff2cfc2fe21aa13a3ea4f7514c7d5'

    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(user_id)

    from routes.auth import auth_bp
    from routes.recording import recording_bp
    from routes.dashboard import dashboard_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(recording_bp, url_prefix='/recording')
    app.register_blueprint(dashboard_bp)

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host='192.168.68.105', debug=True)