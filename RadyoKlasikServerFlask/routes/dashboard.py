from flask import Blueprint, render_template, redirect, url_for, current_app
from flask_login import login_required

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
@login_required
def index():
    return redirect(url_for('dashboard.dashboard'))

@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html', shared_secret_key=current_app.config.get('SHARED_SECRET_KEY'))


