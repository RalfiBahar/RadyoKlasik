from celery import shared_task

@shared_task(ignore_result=False)
def add_together(a, b):
    return a + b
