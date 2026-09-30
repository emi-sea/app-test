import os


class Config:
    DATABASE_URL = os.environ.get(
        "DATABASE_URL",
        "postgresql://probe:probe@localhost:5432/probe",
    )
    QUERY_INTERVAL_MS = int(os.environ.get("QUERY_INTERVAL_MS", "750"))
    PORT = int(os.environ.get("PORT", "8080"))
    HOSTNAME = os.environ.get("HOSTNAME", "local")
