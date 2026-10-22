FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-calc libreoffice-writer libreoffice-impress fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir openpyxl==3.1.5 pandas==2.2.3 matplotlib==3.10.1 python-docx==1.1.2 python-pptx==1.0.2 pypdf==5.4.0 pillow==11.1.0 'markitdown[xlsx,docx,pptx,pdf]==0.1.1'
COPY sandbox-runner.py /opt/sandbox-runner.py
ENV PYTHONDONTWRITEBYTECODE=1
ENV HOME=/tmp MPLCONFIGDIR=/tmp/matplotlib
USER 65534:65534
WORKDIR /workspace