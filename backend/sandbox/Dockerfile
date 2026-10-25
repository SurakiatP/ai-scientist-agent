FROM python:3.13-slim
RUN pip install --no-cache-dir pandas==2.3.3 numpy==2.3.4 matplotlib==3.10.7 openpyxl==3.1.5 pyarrow==22.0.0
COPY runner.py /app/runner.py
ENV MPLBACKEND=Agg MPLCONFIGDIR=/tmp PYTHONDONTWRITEBYTECODE=1 HOME=/tmp
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["python", "-I", "/app/runner.py"]
