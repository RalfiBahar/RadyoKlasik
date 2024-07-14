from app import create_app
from celery_app import celery_init_app

app = create_app()
celery_app = celery_init_app(app)

if __name__ == "__main__":
    celery_app.run(host='0.0.0.0')
