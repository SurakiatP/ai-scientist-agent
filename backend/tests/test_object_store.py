import pytest
from botocore.exceptions import ClientError

from scientist.config import Settings
from scientist.object_store import create_store


class Raced:
    """head_bucket says missing, then another process wins create_bucket."""
    def __init__(self, code):
        self.code, self.created = code, 0

    def head_bucket(self, **kw):
        raise ClientError({"Error": {"Code": "404"}}, "HeadBucket")

    def create_bucket(self, **kw):
        self.created += 1
        raise ClientError({"Error": {"Code": self.code}}, "CreateBucket")


@pytest.mark.parametrize("code,ok", [("BucketAlreadyOwnedByYou", True), ("BucketAlreadyExists", True), ("AccessDenied", False)])
def test_bucket_created_by_another_process_first_is_fine(monkeypatch, code, ok):
    import scientist.object_store as o
    c = Raced(code)
    monkeypatch.setattr(o.boto3, "client", lambda *a, **k: c)
    s = Settings(openrouter_api_key="k", model="m", fallback_model="f", hermes_source_path=".", hermes_revision="x", minio_endpoint="http://x")
    if ok:
        assert create_store(s).bucket == s.minio_bucket
    else:
        with pytest.raises(ClientError):
            create_store(s)
    assert c.created == 1
