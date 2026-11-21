import json
import os
import uuid
from decimal import Decimal
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    decode_token,
    get_jwt_identity,
    jwt_required,
)
from flask_socketio import SocketIO, join_room, leave_room
from flasgger import Swagger
from werkzeug.utils import secure_filename

from config import Config
from models import (
    db,
    Admin,
    Category,
    Product,
    Addon,
    Order,
    OrderItem,
    OrderStatusHistory,
    VALID_STATUSES,
)
from swagger_config import SWAGGER_CONFIG, SWAGGER_TEMPLATE

app = Flask(__name__)
app.config.from_object(Config)

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# Extensões
CORS(app, resources={r"/*": {"origins": "*"}})
db.init_app(app)
jwt = JWTManager(app)
swagger = Swagger(app, config=SWAGGER_CONFIG, template=SWAGGER_TEMPLATE)

# async_mode="threading" + simple-websocket oferece WebSocket nativo no Windows/Python 3.11+
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


# HELPERS
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in app.config["ALLOWED_EXTENSIONS"]


def get_current_admin():
    identity = get_jwt_identity()
    if not identity:
        return None
    return db.session.get(Admin, int(identity))


# EVENTOS WEBSOCKET
@socketio.on("connect")
def handle_connect():
    pass


@socketio.on("join_order")
def handle_join_order(data):
    order_id = (data or {}).get("order_id")
    if order_id:
        join_room(f"order_{order_id}")


@socketio.on("leave_order")
def handle_leave_order(data):
    order_id = (data or {}).get("order_id")
    if order_id:
        leave_room(f"order_{order_id}")


@socketio.on("join_admin")
def handle_join_admin(data):
    token = (data or {}).get("token")
    if not token:
        return
    try:
        decoded = decode_token(token)
        admin_id = int(decoded.get("sub"))
        admin = db.session.get(Admin, admin_id)
        if admin and admin.active:
            join_room("admins")
    except Exception:
        return

# ROTAS DE SAÚDE E ARQUIVOS DE IMAGEM
@app.route("/api/health", methods=["GET"])
def health_check():
    """
    Verifica se a API está online
    ---
    tags:
      - Sistema
    responses:
      200:
        description: API funcionando normalmente
    """
    return jsonify({"status": "ok", "service": "Carol Mix Cardápio Digital API"}), 200


@app.route("/uploads/<path:filename>", methods=["GET"])
def serve_upload(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


@app.route("/api/upload", methods=["POST"])
@jwt_required()
def upload_image():
    """
    Faz upload da imagem de um produto (Admin)
    ---
    tags:
      - Upload
    security:
      - Bearer: []
    consumes:
      - multipart/form-data
    parameters:
      - in: formData
        name: image
        type: file
        required: true
        description: Arquivo de imagem (png, jpg, jpeg, webp, gif)
    responses:
      201:
        description: Imagem salva com sucesso
      400:
        description: Arquivo ausente ou formato inválido
    """
    if "image" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado no campo 'image'."}), 400

    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify({"error": "Nome de arquivo vazio."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Formato não permitido. Use PNG, JPG, JPEG, WEBP ou GIF."}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    filename = secure_filename(safe_name)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)

    return jsonify({"image_url": f"/uploads/{filename}"}), 201


# AUTENTICAÇÃO DE ADMINISTRADOR (JWT)
@app.route("/api/auth/login", methods=["POST"])
def admin_login():
    """
    Autentica o administrador e retorna um token JWT
    ---
    tags:
      - Autenticação
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [email, password]
          properties:
            email:
              type: string
              example: admin@carolmix.com
            password:
              type: string
              example: admin123
    responses:
      200:
        description: Login realizado com sucesso
      401:
        description: Credenciais inválidas
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Informe e-mail e senha."}), 400

    admin = Admin.query.filter_by(email=email, active=True).first()
    if not admin or not admin.check_password(password):
        return jsonify({"error": "E-mail ou senha inválidos."}), 401

    token = create_access_token(identity=str(admin.id))
    return jsonify({"access_token": token, "admin": admin.to_dict()}), 200


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def admin_me():
    """
    Valida a sessão atual e retorna os dados do administrador autenticado
    ---
    tags:
      - Autenticação
    security:
      - Bearer: []
    responses:
      200:
        description: Dados do administrador
      401:
        description: Token inválido ou expirado
    """
    admin = get_current_admin()
    if not admin or not admin.active:
        return jsonify({"error": "Sessão inválida."}), 401
    return jsonify({"admin": admin.to_dict()}), 200

# CATEGORIAS
@app.route("/api/categories", methods=["GET"])
def list_categories():
    """
    Lista todas as categorias ativas do cardápio
    ---
    tags:
      - Cardápio
    responses:
      200:
        description: Lista de categorias
    """
    categories = Category.query.filter_by(active=True).order_by(Category.display_order.asc()).all()
    return jsonify([c.to_dict() for c in categories]), 200



# PRODUTOS DO CARDÁPIO
@app.route("/api/products", methods=["GET"])
def list_products():
    """
    Lista produtos do cardápio (filtráveis por categoria ou busca)
    ---
    tags:
      - Cardápio
    parameters:
      - in: query
        name: category_id
        type: integer
        required: false
      - in: query
        name: search
        type: string
        required: false
      - in: query
        name: include_inactive
        type: boolean
        required: false
    responses:
      200:
        description: Lista de produtos
    """
    category_id = request.args.get("category_id", type=int)
    search = (request.args.get("search") or "").strip()
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"

    query = Product.query
    if not include_inactive:
        query = query.filter_by(active=True)
    if category_id:
        query = query.filter_by(category_id=category_id)
    if search:
        like_term = f"%{search}%"
        query = query.filter(
            db.or_(
                Product.name.ilike(like_term),
                Product.short_description.ilike(like_term),
                Product.ingredients.ilike(like_term),
            )
        )

    products = query.order_by(Product.category_id.asc(), Product.name.asc()).all()
    return jsonify([p.to_dict() for p in products]), 200


@app.route("/api/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    """
    Retorna detalhes completos de um produto específico (RF002)
    ---
    tags:
      - Cardápio
    parameters:
      - in: path
        name: product_id
        type: integer
        required: true
    responses:
      200:
        description: Detalhes do produto
      404:
        description: Produto não encontrado
    """
    product = db.session.get(Product, product_id)
    if not product or not product.active:
        return jsonify({"error": "Produto não encontrado."}), 404
    return jsonify(product.to_dict()), 200


@app.route("/api/products", methods=["POST"])
@jwt_required()
def create_product():
    """
    Cadastra um novo item no cardápio (RF006 - Admin)
    ---
    tags:
      - Administração - Cardápio
    security:
      - Bearer: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [name, category_id, price, short_description, description, ingredients]
          properties:
            name: {type: string}
            category_id: {type: integer}
            price: {type: number}
            short_description: {type: string}
            description: {type: string}
            ingredients: {type: string}
            allow_addons: {type: boolean}
            sizes:
              type: array
              items:
                type: object
                properties:
                  label: {type: string}
                  extra_price: {type: number}
            image_url: {type: string}
    responses:
      201:
        description: Produto criado com sucesso
      400:
        description: Erro de validação
    """
    data = request.get_json(silent=True) or {}
    required_fields = ["name", "category_id", "price", "short_description", "description", "ingredients"]
    missing = [f for f in required_fields if data.get(f) in (None, "")]
    if missing:
        return jsonify({"error": f"Campos obrigatórios ausentes: {', '.join(missing)}"}), 400

    try:
        price = Decimal(str(data["price"]))
        if price < 0:
            return jsonify({"error": "O preço não pode ser negativo."}), 400
    except Exception:
        return jsonify({"error": "Preço inválido."}), 400

    category = db.session.get(Category, int(data["category_id"]))
    if not category:
        return jsonify({"error": "Categoria inválida."}), 400

    sizes = data.get("sizes") or []
    clean_sizes = []
    if isinstance(sizes, list):
        for s in sizes:
            label = str(s.get("label", "")).strip()
            if label:
                extra = float(s.get("extra_price", 0) or 0)
                clean_sizes.append({"label": label, "extra_price": max(0.0, extra)})

    product = Product(
        category_id=category.id,
        name=str(data["name"]).strip(),
        short_description=str(data["short_description"]).strip(),
        description=str(data["description"]).strip(),
        ingredients=str(data["ingredients"]).strip(),
        price=price,
        allow_addons=bool(data.get("allow_addons", True)),
        sizes_json=json.dumps(clean_sizes, ensure_ascii=False) if clean_sizes else None,
        image_url=(data.get("image_url") or "").strip(),
        active=True,
    )
    db.session.add(product)
    db.session.commit()

    socketio.emit("menu_updated", {"action": "created", "product_id": product.id})
    return jsonify(product.to_dict()), 201


@app.route("/api/products/<int:product_id>", methods=["PUT"])
@jwt_required()
def update_product(product_id):
    """
    Edita um item existente do cardápio (RF006 - Admin)
    ---
    tags:
      - Administração - Cardápio
    security:
      - Bearer: []
    parameters:
      - in: path
        name: product_id
        type: integer
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
    responses:
      200:
        description: Produto atualizado com sucesso
      404:
        description: Produto não encontrado
    """
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Produto não encontrado."}), 404

    data = request.get_json(silent=True) or {}

    if "name" in data and str(data["name"]).strip():
        product.name = str(data["name"]).strip()
    if "category_id" in data:
        cat = db.session.get(Category, int(data["category_id"]))
        if not cat:
            return jsonify({"error": "Categoria inválida."}), 400
        product.category_id = cat.id
    if "short_description" in data and str(data["short_description"]).strip():
        product.short_description = str(data["short_description"]).strip()
    if "description" in data and str(data["description"]).strip():
        product.description = str(data["description"]).strip()
    if "ingredients" in data and str(data["ingredients"]).strip():
        product.ingredients = str(data["ingredients"]).strip()
    if "price" in data:
        try:
            price = Decimal(str(data["price"]))
            if price < 0:
                return jsonify({"error": "Preço não pode ser negativo."}), 400
            product.price = price
        except Exception:
            return jsonify({"error": "Preço inválido."}), 400
    if "allow_addons" in data:
        product.allow_addons = bool(data["allow_addons"])
    if "sizes" in data:
        sizes = data.get("sizes") or []
        clean_sizes = []
        if isinstance(sizes, list):
            for s in sizes:
                label = str(s.get("label", "")).strip()
                if label:
                    extra = float(s.get("extra_price", 0) or 0)
                    clean_sizes.append({"label": label, "extra_price": max(0.0, extra)})
        product.sizes_json = json.dumps(clean_sizes, ensure_ascii=False) if clean_sizes else None
    if "image_url" in data:
        product.image_url = (data.get("image_url") or "").strip()
    if "active" in data:
        product.active = bool(data["active"])

    db.session.commit()
    socketio.emit("menu_updated", {"action": "updated", "product_id": product.id})
    return jsonify(product.to_dict()), 200


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@jwt_required()
def delete_product(product_id):
    """
    Remove um item do cardápio usando exclusão lógica (RF006 - preserva histórico de pedidos)
    ---
    tags:
      - Administração - Cardápio
    security:
      - Bearer: []
    parameters:
      - in: path
        name: product_id
        type: integer
        required: true
    responses:
      200:
        description: Produto removido do cardápio
      404:
        description: Produto não encontrado
    """
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Produto não encontrado."}), 404

    product.active = False
    db.session.commit()

    socketio.emit("menu_updated", {"action": "deleted", "product_id": product.id})
    return jsonify({"message": "Produto removido do cardápio com sucesso."}), 200

# ADICIONAIS
@app.route("/api/addons", methods=["GET"])
def list_addons():
    """
    Lista adicionais disponíveis para personalização de produtos
    ---
    tags:
      - Cardápio
    responses:
      200:
        description: Lista de adicionais ativos
    """
    addons = Addon.query.filter_by(active=True).order_by(Addon.name.asc()).all()
    return jsonify([a.to_dict() for a in addons]), 200


@app.route("/api/addons", methods=["POST"])
@jwt_required()
def create_addon():
    """
    Cadastra um novo adicional (Admin)
    ---
    tags:
      - Administração - Adicionais
    security:
      - Bearer: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [name, price]
          properties:
            name: {type: string}
            price: {type: number}
    responses:
      201:
        description: Adicional criado
    """
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Informe o nome do adicional."}), 400
    try:
        price = Decimal(str(data.get("price", 0)))
        if price < 0:
            return jsonify({"error": "Preço inválido."}), 400
    except Exception:
        return jsonify({"error": "Preço inválido."}), 400

    addon = Addon(name=name, price=price, active=True)
    db.session.add(addon)
    db.session.commit()
    socketio.emit("menu_updated", {"action": "addon_created"})
    return jsonify(addon.to_dict()), 201


@app.route("/api/addons/<int:addon_id>", methods=["DELETE"])
@jwt_required()
def delete_addon(addon_id):
    """
    Remove um adicional (exclusão lógica - Admin)
    ---
    tags:
      - Administração - Adicionais
    security:
      - Bearer: []
    parameters:
      - in: path
        name: addon_id
        type: integer
        required: true
    responses:
      200:
        description: Adicional removido
    """
    addon = db.session.get(Addon, addon_id)
    if not addon:
        return jsonify({"error": "Adicional não encontrado."}), 404
    addon.active = False
    db.session.commit()
    socketio.emit("menu_updated", {"action": "addon_deleted"})
    return jsonify({"message": "Adicional removido com sucesso."}), 200

# PEDIDOS E TEMPO REAL VIA WEBSOCKET
@app.route("/api/orders", methods=["POST"])
def create_order():
    """
    Registra um novo pedido feito pelo cliente (RF004) e notifica o painel Admin via WebSocket
    ---
    tags:
      - Pedidos
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [customer_name, table_or_pickup, items]
          properties:
            customer_name: {type: string, example: "Maria Silva"}
            table_or_pickup: {type: string, example: "Mesa 04"}
            notes: {type: string, example: "Sem colher descartável"}
            items:
              type: array
              items:
                type: object
                required: [product_id, quantity]
                properties:
                  product_id: {type: integer}
                  quantity: {type: integer}
                  selected_size: {type: string}
                  addon_ids:
                    type: array
                    items: {type: integer}
                  item_notes: {type: string}
    responses:
      201:
        description: Pedido criado com sucesso
      400:
        description: Dados inválidos
    """
    data = request.get_json(silent=True) or {}
    customer_name = str(data.get("customer_name") or "").strip()
    table_or_pickup = str(data.get("table_or_pickup") or "").strip()
    notes = str(data.get("notes") or "").strip()
    items_payload = data.get("items") or []

    if not customer_name:
        return jsonify({"error": "Informe seu nome para identificar o pedido."}), 400
    if not table_or_pickup:
        return jsonify({"error": "Informe o número da mesa ou opção de retirada."}), 400
    if not isinstance(items_payload, list) or len(items_payload) == 0:
        return jsonify({"error": "O pedido deve conter pelo menos um item."}), 400

    order = Order(
        customer_name=customer_name,
        table_or_pickup=table_or_pickup,
        notes=notes,
        status="Recebido",
        total=Decimal("0.00"),
    )
    db.session.add(order)
    db.session.flush()

    order_total = Decimal("0.00")

    for entry in items_payload:
        product_id = entry.get("product_id")
        quantity = int(entry.get("quantity") or 0)
        if not product_id or quantity < 1:
            db.session.rollback()
            return jsonify({"error": "Item ou quantidade inválidos no pedido."}), 400

        product = db.session.get(Product, int(product_id))
        if not product or not product.active:
            db.session.rollback()
            return jsonify({"error": f"Produto ID {product_id} indisponível no momento."}), 400

        unit_price = Decimal(str(product.price))

        # Valida tamanho escolhido
        selected_size_label = str(entry.get("selected_size") or "").strip()
        if selected_size_label:
            matched_size = next(
                (s for s in product.get_sizes() if s.get("label") == selected_size_label),
                None,
            )
            if matched_size:
                unit_price += Decimal(str(matched_size.get("extra_price", 0)))

        # Valida adicionais no banco
        addon_ids = entry.get("addon_ids") or []
        chosen_addons = []
        if product.allow_addons and isinstance(addon_ids, list) and addon_ids:
            db_addons = Addon.query.filter(Addon.id.in_(addon_ids), Addon.active == True).all()
            for a in db_addons:
                chosen_addons.append({"id": a.id, "name": a.name, "price": float(a.price)})
                unit_price += Decimal(str(a.price))

        subtotal = unit_price * quantity
        order_total += subtotal

        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            selected_size=selected_size_label or None,
            addons_json=json.dumps(chosen_addons, ensure_ascii=False) if chosen_addons else None,
            item_notes=str(entry.get("item_notes") or "").strip()[:255] or None,
            quantity=quantity,
            unit_price=unit_price,
            subtotal=subtotal,
        )
        db.session.add(order_item)

    order.total = order_total

    # Registro inicial no histórico
    initial_history = OrderStatusHistory(
        order_id=order.id,
        status="Recebido",
        changed_by_admin_id=None,
        changed_by_name=f"Cliente ({customer_name})",
    )
    db.session.add(initial_history)
    db.session.commit()

    order_dict = order.to_dict(include_history=True)

    # Notifica todos os administradores conectados via WebSocket
    socketio.emit("new_order", order_dict, room="admins")

    return jsonify(order_dict), 201


@app.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order_public(order_id):
    """
    Consulta o status e detalhes de um pedido específico (acompanhamento do cliente)
    ---
    tags:
      - Pedidos
    parameters:
      - in: path
        name: order_id
        type: integer
        required: true
    responses:
      200:
        description: Detalhes do pedido
      404:
        description: Pedido não encontrado
    """
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Pedido não encontrado."}), 404
    return jsonify(order.to_dict(include_history=True)), 200


@app.route("/api/orders", methods=["GET"])
@jwt_required()
def list_orders():
    """
    Lista todos os pedidos realizados com filtro opcional por status (RF007 - Admin)
    ---
    tags:
      - Administração - Pedidos
    security:
      - Bearer: []
    parameters:
      - in: query
        name: status
        type: string
        enum: ["Recebido", "Em preparo", "Pronto", "Entregue", "Cancelado"]
        required: false
    responses:
      200:
        description: Lista de pedidos
    """
    status_filter = (request.args.get("status") or "").strip()
    query = Order.query
    if status_filter and status_filter in VALID_STATUSES:
        query = query.filter_by(status=status_filter)

    orders = query.order_by(Order.created_at.desc()).all()
    return jsonify([o.to_dict(include_history=True) for o in orders]), 200


@app.route("/api/orders/<int:order_id>/status", methods=["PATCH"])
@jwt_required()
def update_order_status(order_id):
    """
    Atualiza o status de um pedido, registra no histórico e notifica o cliente via WebSocket (RF008)
    ---
    tags:
      - Administração - Pedidos
    security:
      - Bearer: []
    parameters:
      - in: path
        name: order_id
        type: integer
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [status]
          properties:
            status:
              type: string
              enum: ["Recebido", "Em preparo", "Pronto", "Entregue", "Cancelado"]
    responses:
      200:
        description: Status atualizado com sucesso
      400:
        description: Status inválido
      404:
        description: Pedido não encontrado
    """
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Pedido não encontrado."}), 404

    data = request.get_json(silent=True) or {}
    new_status = str(data.get("status") or "").strip()
    if new_status not in VALID_STATUSES:
        return jsonify({"error": f"Status inválido. Use: {', '.join(VALID_STATUSES)}"}), 400

    admin = get_current_admin()
    if not admin:
        return jsonify({"error": "Administrador não autenticado."}), 401

    if order.status != new_status:
        order.status = new_status
        history_entry = OrderStatusHistory(
            order_id=order.id,
            status=new_status,
            changed_by_admin_id=admin.id,
            changed_by_name=f"{admin.name} ({admin.email})",
        )
        db.session.add(history_entry)
        db.session.commit()

    order_dict = order.to_dict(include_history=True)

    # Emite atualização em tempo real para o cliente do pedido e para os painéis admin
    socketio.emit("order_status_updated", order_dict, room=f"order_{order.id}")
    socketio.emit("order_status_updated", order_dict, room="admins")

    return jsonify(order_dict), 200


@app.route("/api/orders/<int:order_id>/history", methods=["GET"])
@jwt_required()
def get_order_history(order_id):
    """
    Retorna o histórico de atualizações de status de um pedido (RF008 - Admin)
    ---
    tags:
      - Administração - Pedidos
    security:
      - Bearer: []
    parameters:
      - in: path
        name: order_id
        type: integer
        required: true
    responses:
      200:
        description: Histórico do pedido
      404:
        description: Pedido não encontrado
    """
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Pedido não encontrado."}), 404
    return jsonify([h.to_dict() for h in order.history]), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Carol Mix API rodando em http://127.0.0.1:{port}")
    print(f"Documentação Swagger disponível em http://127.0.0.1:{port}/apidocs/")
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)