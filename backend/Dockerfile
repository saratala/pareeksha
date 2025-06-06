FROM python:3.10-slim

# Install ffmpeg and other system dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# No change needed for SQLite support, requirements.txt will handle sqlmodel install
# No change needed for psycopg2-binary, requirements.txt will handle install

# Set workdir
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY main.py ./

# Expose port if needed (e.g., 8000)
EXPOSE 8000

# Set entrypoint (adjust as needed for your app)
CMD ["python", "main.py"]
