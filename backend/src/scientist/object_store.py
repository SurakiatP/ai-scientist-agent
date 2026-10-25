"""S3-compatible object store (MinIO): sync boto3 wrapped in asyncio.to_thread. Keys are opaque; the API proxies bytes."""
import asyncio
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

MISSING = {"404", "NoSuchKey", "NoSuchBucket", "NotFound"}


class ObjectMissing(Exception):
    pass


class ObjectStore:
    def __init__(self, client, bucket: str):
        self.client, self.bucket = client, bucket

    async def ping(self) -> None:
        await asyncio.to_thread(self.client.head_bucket, Bucket=self.bucket)

    async def put(self, key: str, body, *, content_type: str = "application/octet-stream",
                  metadata: dict[str, str] | None = None) -> None:
        """body: bytes or a seekable file object."""
        await asyncio.to_thread(self.client.put_object, Bucket=self.bucket, Key=key, Body=body,
                                ContentType=content_type, Metadata=metadata or {})

    async def get(self, key: str) -> tuple[bytes, dict]:  # ponytail: whole object in memory (<=100 MB cap); stream if caps grow
        def read():
            r = self.client.get_object(Bucket=self.bucket, Key=key)
            return r["Body"].read(), {"content_type": r["ContentType"], **r["Metadata"]}
        return await self._call(read)

    async def head(self, key: str) -> dict:
        r = await self._call(lambda: self.client.head_object(Bucket=self.bucket, Key=key))
        return {"size": r["ContentLength"], "content_type": r["ContentType"],
                "last_modified": r["LastModified"], **r["Metadata"]}

    async def read_head(self, key: str, n: int) -> bytes:
        """First n bytes only (ranged GET)."""
        return await self._call(lambda: self.client.get_object(
            Bucket=self.bucket, Key=key, Range=f"bytes=0-{n - 1}")["Body"].read())

    async def copy_meta(self, key: str, content_type: str, metadata: dict[str, str]) -> None:
        """Rewrite metadata in place: S3 copy onto itself with REPLACE."""
        await self._call(lambda: self.client.copy_object(
            Bucket=self.bucket, Key=key, CopySource={"Bucket": self.bucket, "Key": key},
            MetadataDirective="REPLACE", ContentType=content_type, Metadata=metadata))

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    @staticmethod
    async def _call(fn):
        try:
            return await asyncio.to_thread(fn)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in MISSING:
                raise ObjectMissing from e
            raise


def _secret(value: str, file: str) -> str:
    return Path(file).read_text().strip() if file else value


def create_store(settings) -> ObjectStore:
    """Build the client and create the bucket if absent (idempotent). Raises if MinIO is unreachable."""
    client = boto3.client(
        "s3", endpoint_url=settings.minio_endpoint, region_name="us-east-1",
        aws_access_key_id=_secret(settings.minio_access_key, settings.minio_access_key_file),
        aws_secret_access_key=_secret(settings.minio_secret_key, settings.minio_secret_key_file),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                      retries={"max_attempts": 2}, connect_timeout=2, read_timeout=30))
    try:
        client.head_bucket(Bucket=settings.minio_bucket)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") not in MISSING:
            raise
        client.create_bucket(Bucket=settings.minio_bucket)
    return ObjectStore(client, settings.minio_bucket)
