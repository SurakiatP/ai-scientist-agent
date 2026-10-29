# python:3.13-slim index digest, resolved 2026-10-29 via `docker buildx imagetools inspect python:3.13-slim`
FROM python:3.13-slim@sha256:2d44738ebf4ce5f63b9d9ea871e9c7cfdc0426f7b0c97cac915fd88ded1d86bb
RUN pip install --no-cache-dir pandas==2.3.3 numpy==2.3.4 matplotlib==3.10.7 openpyxl==3.1.5 pyarrow==22.0.0 pypdf==6.21.2
COPY runner.py /app/runner.py
ENV MPLBACKEND=Agg MPLCONFIGDIR=/tmp PYTHONDONTWRITEBYTECODE=1 HOME=/tmp
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["python", "-I", "/app/runner.py"]
