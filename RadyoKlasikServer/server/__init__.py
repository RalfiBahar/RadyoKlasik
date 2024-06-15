from flask import Flask
from flask_login import LoginManager
from .models import User

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'bd9617be2f088115cedb35df03aaeb76476ff2cfc2fe21aa13a3ea4f7514c7d5'

    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'main.login'

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(user_id)

    from .routes import bp as main_bp
    app.register_blueprint(main_bp)

    return app
