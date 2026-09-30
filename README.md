# HA Probe — Flask + PostgreSQL

App web mínima para probar **alta disponibilidad** y **downtime en deployments** en OpenShift. Consulta PostgreSQL de forma continua y aleatoria, **sin cache**, y muestra en vivo latencia, errores y ventanas de downtime.

## Qué hace

- La UI hace polling a `/api/query`.
- Cada request ejecuta una consulta SQL aleatoria contra PostgreSQL (`by_id`, `ORDER BY random()`, o `ILIKE` + `count`).
- Respuestas con `Cache-Control: no-store` (sin cache HTTP ni de aplicación).
- Probes `/health/live` y `/health/ready` para OpenShift.
- La UI muestra el hostname del pod para ver cambios de réplica en rolling updates.

## Requisitos

- Docker / Docker Compose (local), o
- Python 3.12+ y PostgreSQL 16
- OpenShift CLI (`oc`) para el cluster

## Arranque local

### Opción A — Docker Compose (requiere virtualización)

```bash
docker compose up --build
```

Abrí http://localhost:8080

Si Docker Desktop muestra *Virtualization support not detected*, habilitá VT-x/AMD-V en BIOS o usá la opción B.

Credenciales Compose: `probe` / `probe` / `probe`  
URL: `postgresql://probe:probe@localhost:5432/probe`

### Opción B — Windows nativo (sin Docker)

Requisitos: Python 3.12 y PostgreSQL 16 instalados. Crear BD y seed:

```powershell
$env:PGPASSWORD = "postgres"   # password del superusuario postgres
psql -U postgres -h 127.0.0.1 -c "CREATE ROLE probe LOGIN PASSWORD 'probe';"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE probe OWNER probe;"
psql -U postgres -h 127.0.0.1 -d probe -c "GRANT ALL ON SCHEMA public TO probe;"
psql -U postgres -h 127.0.0.1 -d probe -f sql\init.sql
psql -U postgres -h 127.0.0.1 -d probe -c "ALTER TABLE probe_items OWNER TO probe; GRANT ALL ON ALL TABLES IN SCHEMA public TO probe; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO probe;"
```

Luego la app (en PowerShell; `gunicorn` no corre bien en Windows):

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql://probe:probe@127.0.0.1:5432/probe"
python -m flask --app wsgi:app run --host 0.0.0.0 --port 8080
```

Abrí http://localhost:8080

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://probe:probe@localhost:5432/probe` | Conexión PostgreSQL |
| `QUERY_INTERVAL_MS` | `750` | Intervalo sugerido de la UI |
| `PORT` | `8080` | Puerto HTTP |
| `HOSTNAME` | (del entorno) | Identificador del pod (OpenShift lo inyecta) |

## Endpoints

| Ruta | Uso |
|------|-----|
| `GET /` | UI de monitoreo |
| `GET /api/query` | Consulta aleatoria a la BD |
| `GET /health/live` | Liveness |
| `GET /health/ready` | Readiness (`SELECT 1`) |

## Despliegue en OpenShift

1. Construí y empujá la imagen (ajustá proyecto/registry):

```bash
oc new-project ha-probe
oc new-build --name=ha-probe --binary --strategy=docker
oc start-build ha-probe --from-dir=. --follow
```

2. Creá el Secret apuntando a tu PostgreSQL (después de cargar `sql/init.sql` en esa BD):

```bash
cp openshift/secret.example.yaml openshift/secret.yaml
# Editá database-url
oc apply -f openshift/secret.yaml
```

3. Aplicá los manifiestos (revisá el campo `image` en `openshift/deployment.yaml` si tu ImageStream/ruta difiere):

```bash
oc apply -f openshift/deployment.yaml
oc apply -f openshift/service.yaml
oc apply -f openshift/route.yaml
oc get route ha-probe
```

La app arranca con **2 réplicas** y strategy `RollingUpdate` (`maxUnavailable: 0`).

## Cómo medir HA y downtime

1. Abrí la Route en el navegador y dejá el polling corriendo.
2. Observá OK/FAIL, latencia, downtime acumulado y el nombre del pod.

### RollingUpdate (casi sin downtime)

```bash
oc rollout restart deployment/ha-probe
oc rollout status deployment/ha-probe
```

Esperado: fallos mínimos o nulos; el campo **Pod** cambia entre réplicas.

### Recreate (downtime visible)

```bash
oc patch deployment ha-probe -p '{"spec":{"strategy":{"type":"Recreate"}}}'
oc rollout restart deployment/ha-probe
```

Esperado: una ventana de FAIL en la UI y downtime acumulado > 0.

Volver a RollingUpdate:

```bash
oc patch deployment ha-probe --type=json -p='[
  {"op":"replace","path":"/spec/strategy","value":{"type":"RollingUpdate","rollingUpdate":{"maxUnavailable":0,"maxSurge":1}}}
]'
```

Más notas en `openshift/NOTES.txt`.

## Estructura

```
app/                 # Flask (factory, db, routes, UI)
sql/init.sql         # Schema + seed
Dockerfile
docker-compose.yml
openshift/           # Deployment, Service, Route, Secret ejemplo
```

## Alcance

- Sin autenticación de usuarios
- Sin métricas Prometheus
- PostgreSQL se asume provisionado (Compose local o BD externa en el cluster)
