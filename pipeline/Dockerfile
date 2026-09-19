FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pipeline ./pipeline
CMD ["sh", "-c", "python -m pipeline.ingest && python -m pipeline.ingest_continuidade && python -m pipeline.transform"]
