# Use the official Python image from the Docker Hub
FROM python:3.12.4-slim-bullseye

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory
WORKDIR /app

# Copy the requirements.txt file
COPY requirements.txt /app/

# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install gunicorn celery

# Copy the rest of the application code to the working directory
COPY . /app/

# Expose the port the app runs on
EXPOSE 8000

# Run the application using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "wsgi:app"]
