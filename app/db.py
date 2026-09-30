from __future__ import annotations

import random
import time
from contextlib import contextmanager
from typing import Any, Generator

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None

_QUERY_STRATEGIES = ("by_id", "order_random", "ilike_count")


def init_pool(database_url: str) -> None:
    global _pool
    if _pool is not None:
        return
    _pool = ConnectionPool(
        conninfo=database_url,
        min_size=1,
        max_size=5,
        kwargs={"row_factory": dict_row},
        open=True,
    )


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def get_connection() -> Generator:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    with _pool.connection() as conn:
        yield conn


def ping() -> None:
    with get_connection() as conn:
        conn.execute("SELECT 1")


def random_query() -> dict[str, Any]:
    strategy = random.choice(_QUERY_STRATEGIES)
    started = time.perf_counter()

    with get_connection() as conn:
        if strategy == "by_id":
            max_id = conn.execute("SELECT COALESCE(MAX(id), 0) AS m FROM probe_items").fetchone()["m"]
            if max_id < 1:
                raise RuntimeError("probe_items is empty; run sql/init.sql")
            item_id = random.randint(1, max_id)
            row = conn.execute(
                "SELECT id, name, value, category, created_at FROM probe_items WHERE id = %s",
                (item_id,),
            ).fetchone()
            result = {"strategy": strategy, "params": {"id": item_id}, "row": _serialize_row(row)}
        elif strategy == "order_random":
            row = conn.execute(
                "SELECT id, name, value, category, created_at FROM probe_items ORDER BY random() LIMIT 1"
            ).fetchone()
            result = {"strategy": strategy, "params": {}, "row": _serialize_row(row)}
        else:
            fragment = random.choice(["payload", "item", "a", "b", "c", "1", "2", "3"])
            pattern = f"%{fragment}%"
            count_row = conn.execute(
                "SELECT count(*) AS cnt FROM probe_items WHERE value ILIKE %s OR name ILIKE %s",
                (pattern, pattern),
            ).fetchone()
            result = {
                "strategy": strategy,
                "params": {"pattern": pattern},
                "row": {"count": count_row["cnt"]},
            }

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    result["latency_ms"] = latency_ms
    return result


def _serialize_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    out: dict[str, Any] = {}
    for key, value in row.items():
        out[key] = value.isoformat() if hasattr(value, "isoformat") else value
    return out
