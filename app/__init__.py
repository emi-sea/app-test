from flask import Flask

from app.config import Config
from app import db


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_pool(app.config["DATABASE_URL"])

    from app.routes import bp

    app.register_blueprint(bp)

    @app.teardown_appcontext
    def _teardown(_exc=None):
        pass

    return app
