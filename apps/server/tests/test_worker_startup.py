"""What the Worker leaves out of its startup snapshot, and that the app still answers without it.

Cloudflare refuses to deploy a snapshot over a size cap that is not published, so what the Worker
never runs is kept out of it (`UNUSED_PACKAGES` and `ABSENT_PACKAGES` in `worker.py`)."""

from worker_child import run_after_worker_loads


def test_uvicorn_is_absent_and_the_server_sent_events_package_takes_its_fallback():
    lines = run_after_worker_loads(
        """
        try:
            import uvicorn
        except ModuleNotFoundError as missing:
            print("absent", missing.name)
        import sse_starlette.sse
        print("uvicorn" in sys.modules, "click" in sys.modules)
        """
    )

    assert lines[-2:] == ["absent uvicorn", "False False"]


def test_the_unused_libraries_are_stubs_and_the_app_still_serves_requests():
    lines = run_after_worker_loads(
        """
        import fastapi.openapi.models
        import httpx
        from fastapi import Depends, FastAPI, Header
        from fastapi.security import HTTPBearer
        from fastapi.testclient import TestClient

        print(fastapi.openapi.models.__file__)
        print(httpx.__name__)
        api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        bearer = HTTPBearer(auto_error=False)

        @api.get("/who")
        async def who(credentials=Depends(bearer), limit: int = Header(1)):
            return {"token": credentials.credentials if credentials else None, "limit": limit}

        client = TestClient(api)
        print(client.get("/who", headers={"authorization": "Bearer abc", "limit": "3"}).json())
        print(client.get("/who", headers={"limit": "x"}).status_code)
        """
    )

    assert lines[-4:] == [
        "<stub fastapi.openapi.models>",
        "httpx",
        "{'token': 'abc', 'limit': 3}",
        "422",
    ]
