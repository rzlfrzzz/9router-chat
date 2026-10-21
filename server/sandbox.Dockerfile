FROM python:3.12-slim
RUN pip install --no-cache-dir openpyxl==3.1.5 pandas==2.2.3
ENV PYTHONDONTWRITEBYTECODE=1
USER 65534:65534
WORKDIR /workspace