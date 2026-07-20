FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    # moviepy's own pillow pin conflicts with instagrapi's; --no-deps skips
    # that check since moviepy works fine against the newer pillow already
    # installed above (see requirements.txt).
    && pip install --no-cache-dir --no-deps moviepy==2.2.1

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
