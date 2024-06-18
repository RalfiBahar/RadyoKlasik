from flask import Blueprint, render_template, redirect, url_for, request
from flask_login import login_user, login_required, logout_user
from models.user import User

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
    return render_template('login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))
