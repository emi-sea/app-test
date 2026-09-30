from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, make_response, render_template

from app import db

bp = Blueprint("main", __name__)


def _no_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@bp.after_request
def apply_no_cache(response):
    return _no_cache(response)


@bp.get("/")
def index():
    return render_template(
        "index.html",
        query_interval_ms=current_app.config["QUERY_INTERVAL_MS"],
        hostname=current_app.config["HOSTNAME"],
    )


@bp.get("/api/query")
def api_query():
    pod = current_app.config["HOSTNAME"]
    ts = datetime.now(timezone.utc).isoformat()
    try:
        result = db.random_query()
        return jsonify(
            {
                "ok": True,
                "pod": pod,
                "ts": ts,
                "latency_ms": result["latency_ms"],
                "strategy": result["strategy"],
                "params": result["params"],
                "row": result["row"],
                "error": None,
            }
        )
    except Exception as exc:
        response = make_response(
            jsonify(
                {
                    "ok": False,
                    "pod": pod,
                    "ts": ts,
                    "latency_ms": None,
                    "strategy": None,
                    "params": None,
                    "row": None,
                    "error": str(exc),
                }
            ),
            503,
        )
        return response


@bp.get("/health/live")
def health_live():
    return jsonify({"status": "alive"})


@bp.get("/health/ready")
def health_ready():
    try:
        db.ping()
        return jsonify({"status": "ready"})
    except Exception as exc:
        response = make_response(jsonify({"status": "not_ready", "error": str(exc)}), 503)
        return response
