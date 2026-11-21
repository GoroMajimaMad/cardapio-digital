SWAGGER_CONFIG = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/apidocs/",
}

SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "Carol Mix - API do Cardápio Digital",
        "description": (
            "API RESTful distribuída da sorveteria Carol Mix com suporte a "
            "autenticação JWT, upload de imagens, gestão de cardápio e acompanhamento "
            "de pedidos em tempo real via WebSocket (Flask-SocketIO)."
        ),
        "version": "1.0.0",
    },
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "Informe o token JWT no formato: Bearer <seu_token>",
        }
    },
}