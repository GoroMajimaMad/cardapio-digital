import json
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

VALID_STATUSES = ["Recebido", "Em preparo", "Pronto", "Entregue", "Cancelado"]


class Admin(db.Model):
    __tablename__ = "admins"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "active": self.active,
        }


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False)
    icon = db.Column(db.String(50), default="bi-ice-cream")
    display_order = db.Column(db.Integer, default=0, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)

    products = db.relationship("Product", backref="category", lazy=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "icon": self.icon,
            "display_order": self.display_order,
            "active": self.active,
        }


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    name = db.Column(db.String(140), nullable=False)
    short_description = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    ingredients = db.Column(db.Text, nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    allow_addons = db.Column(db.Boolean, default=True, nullable=False)
    sizes_json = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)

    def get_sizes(self) -> list:
        if not self.sizes_json:
            return []
        try:
            data = json.loads(self.sizes_json)
            return data if isinstance(data, list) else []
        except (ValueError, TypeError):
            return []

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "category_slug": self.category.slug if self.category else None,
            "name": self.name,
            "short_description": self.short_description,
            "description": self.description,
            "ingredients": self.ingredients,
            "price": float(self.price),
            "allow_addons": bool(self.allow_addons),
            "sizes": self.get_sizes(),
            "image_url": self.image_url or "",
            "active": bool(self.active),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Addon(db.Model):
    __tablename__ = "addons"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0.00)
    active = db.Column(db.Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "price": float(self.price),
            "active": bool(self.active),
        }


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(120), nullable=False)
    table_or_pickup = db.Column(db.String(60), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), nullable=False, default="Recebido")
    total = db.Column(db.Numeric(10, 2), nullable=False, default=0.00)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)

    items = db.relationship("OrderItem", backref="order", lazy=True, cascade="all, delete-orphan")
    history = db.relationship(
        "OrderStatusHistory",
        backref="order",
        lazy=True,
        cascade="all, delete-orphan",
        order_by="OrderStatusHistory.changed_at.asc()",
    )

    def to_dict(self, include_history: bool = True) -> dict:
        data = {
            "id": self.id,
            "order_number": f"CM-{self.id:04d}",
            "customer_name": self.customer_name,
            "table_or_pickup": self.table_or_pickup,
            "notes": self.notes or "",
            "status": self.status,
            "total": float(self.total),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "items": [item.to_dict() for item in self.items],
        }
        if include_history:
            data["history"] = [h.to_dict() for h in self.history]
        return data


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True)
    product_name = db.Column(db.String(140), nullable=False)
    selected_size = db.Column(db.String(60), nullable=True)
    addons_json = db.Column(db.Text, nullable=True)
    item_notes = db.Column(db.String(255), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)

    def get_addons(self) -> list:
        if not self.addons_json:
            return []
        try:
            data = json.loads(self.addons_json)
            return data if isinstance(data, list) else []
        except (ValueError, TypeError):
            return []

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_name": self.product_name,
            "selected_size": self.selected_size or "",
            "addons": self.get_addons(),
            "item_notes": self.item_notes or "",
            "quantity": self.quantity,
            "unit_price": float(self.unit_price),
            "subtotal": float(self.subtotal),
        }


class OrderStatusHistory(db.Model):
    __tablename__ = "order_status_history"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    status = db.Column(db.String(30), nullable=False)
    changed_by_admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    changed_by_name = db.Column(db.String(120), nullable=False)
    changed_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "order_id": self.order_id,
            "status": self.status,
            "changed_by_admin_id": self.changed_by_admin_id,
            "changed_by_name": self.changed_by_name,
            "changed_at": self.changed_at.isoformat() if self.changed_at else None,
        }