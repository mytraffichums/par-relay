"""Mock destination service — weather, flights, booking with full request logging."""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

LOG_FILE = Path(__file__).resolve().parent / "request_logs.json"


def _load_logs() -> list[dict]:
    if LOG_FILE.exists():
        return json.loads(LOG_FILE.read_text())
    return []


def _save_log(entry: dict):
    logs = _load_logs()
    logs.append(entry)
    LOG_FILE.write_text(json.dumps(logs, indent=2, default=str))


def _log_request(request: Request, endpoint: str, params: dict):
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "endpoint": endpoint,
        "method": request.method,
        "client_host": request.client.host if request.client else "unknown",
        "client_port": request.client.port if request.client else 0,
        "headers": dict(request.headers),
        "query_params": params,
        "path": str(request.url.path),
        "full_url": str(request.url),
    }
    _save_log(entry)
    return entry


@app.get("/weather")
async def weather(request: Request, city: str = "London"):
    _log_request(request, "/weather", {"city": city})
    data = {
        "city": city,
        "temperature_c": 18,
        "condition": "partly cloudy",
        "humidity": 65,
        "wind_kph": 12,
    }
    return data


@app.get("/flights")
async def flights(request: Request, origin: str = "LHR", destination: str = "JFK"):
    _log_request(request, "/flights", {"origin": origin, "destination": destination})
    data = {
        "origin": origin,
        "destination": destination,
        "flights": [
            {"flight": "PA101", "depart": "08:00", "arrive": "11:30", "price_usd": 450},
            {"flight": "PA202", "depart": "14:00", "arrive": "17:30", "price_usd": 380},
            {"flight": "PA303", "depart": "20:00", "arrive": "23:30", "price_usd": 320},
        ],
    }
    return data


@app.post("/book")
async def book(request: Request):
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    _log_request(request, "/book", body)
    data = {
        "confirmation": "PAR-" + str(int(time.time()))[-6:],
        "flight": body.get("flight", "PA101"),
        "passenger": body.get("passenger", "Agent"),
        "status": "confirmed",
    }
    return data


@app.get("/logs")
async def get_logs():
    return _load_logs()


@app.delete("/logs")
async def clear_logs():
    LOG_FILE.write_text("[]")
    return {"status": "cleared"}
