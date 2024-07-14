from app import create_app
from celery_app import celery_init_app

app = create_app()

if __name__ == "__main__":
    app.run(host='0.0.0.0')
