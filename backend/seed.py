import json
from app import app
from models import db, Admin, Category, Product, Addon


def run_seed():
    with app.app_context():
        db.create_all()

        # Administrador padrão
        admin_email = "admin@carolmix.com"
        admin = Admin.query.filter_by(email=admin_email).first()
        if not admin:
            admin = Admin(name="Carol (Administradora)", email=admin_email, active=True)
            admin.set_password("admin123")
            db.session.add(admin)
            print("[SEED] Admin criado: admin@carolmix.com / admin123")

        # Categorias iniciais
        categories_data = [
            {"name": "Sorvetes", "slug": "sorvetes", "icon": "bi-snow2", "display_order": 1},
            {"name": "Picolés", "slug": "picoles", "icon": "bi-magic", "display_order": 2},
            {"name": "Açaí", "slug": "acai", "icon": "bi-cup-straw", "display_order": 3},
            {"name": "Copo da Felicidade", "slug": "copo-da-felicidade", "icon": "bi-stars", "display_order": 4},
        ]

        cat_map = {}
        for cdata in categories_data:
            cat = Category.query.filter_by(slug=cdata["slug"]).first()
            if not cat:
                cat = Category(**cdata)
                db.session.add(cat)
                db.session.flush()
            cat_map[cdata["slug"]] = cat

        # Adicionais iniciais
        if Addon.query.count() == 0:
            addons_data = [
                ("Leite Ninho", 3.50),
                ("Nutella", 6.00),
                ("Leite Condensado", 3.00),
                ("Granola Crocante", 2.50),
                ("Paçoca Triturada", 2.50),
                ("Morango Picado", 4.50),
                ("Banana Fatiada", 2.50),
                ("Calda de Chocolate Quente", 3.00),
                ("Confete / M&Ms", 3.50),
                ("Chantilly", 3.00),
            ]
            for name, price in addons_data:
                db.session.add(Addon(name=name, price=price, active=True))
            print(f"[SEED] {len(addons_data)} adicionais cadastrados.")

        # Produtos iniciais da Carol Mix
        if Product.query.count() == 0:
            sizes_sorvete = json.dumps([
                {"label": "1 Bola", "extra_price": 0.00},
                {"label": "2 Bolas", "extra_price": 6.00},
                {"label": "3 Bolas (Taça)", "extra_price": 11.00},
            ], ensure_ascii=False)

            sizes_acai = json.dumps([
                {"label": "300 ml", "extra_price": 0.00},
                {"label": "500 ml", "extra_price": 6.00},
                {"label": "700 ml", "extra_price": 12.00},
            ], ensure_ascii=False)

            sizes_copo = json.dumps([
                {"label": "350 ml", "extra_price": 0.00},
                {"label": "500 ml", "extra_price": 7.00},
            ], ensure_ascii=False)

            products_data = [
                # SORVETES
                {
                    "category_id": cat_map["sorvetes"].id,
                    "name": "Sorvete de Ninho Trufado",
                    "short_description": "Massa artesanal de leite Ninho mesclada com trufa cremosa de chocolate.",
                    "description": "Nosso campeão de vendas! Sorvete artesanal super cremoso à base de leite em pó Ninho com generosas camadas de ganache meio amarga.",
                    "ingredients": "Leite integral, creme de leite fresco, leite em pó Ninho, açúcar, chocolate meio amargo 50%, emulsificante natural.",
                    "price": 12.00,
                    "allow_addons": True,
                    "sizes_json": sizes_sorvete,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["sorvetes"].id,
                    "name": "Sorvete de Pistache Premium",
                    "short_description": "Sabor intenso de pasta pura de pistache tostado com pedacinhos crocantes.",
                    "description": "Preparado com pasta italiana de pistache selecionado, textura aveludada e dulçor perfeitamente equilibrado.",
                    "ingredients": "Leite integral, creme de leite, pasta de pistache torrado, pistache granulado, açúcar, sal marinho.",
                    "price": 15.00,
                    "allow_addons": True,
                    "sizes_json": sizes_sorvete,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["sorvetes"].id,
                    "name": "Sorvete de Morango com Suspiro",
                    "short_description": "Sorvete de fruta fresca com geleia artesanal e suspiros leves.",
                    "description": "Feito com morangos frescos selecionados, calda rústica da própria fruta e pedaços de suspiro crocante.",
                    "ingredients": "Morangos frescos, leite integral, creme de leite, açúcar, clara de ovo pasteurizada (suspiro), suco de limão.",
                    "price": 11.50,
                    "allow_addons": True,
                    "sizes_json": sizes_sorvete,
                    "image_url": "",
                },
                # PICOLÉS
                {
                    "category_id": cat_map["picoles"].id,
                    "name": "Picolé Recheado de Leite Condensado",
                    "short_description": "Picolé cremoso de morango com recheio generoso de leite condensado.",
                    "description": "A combinação perfeita do azedinho do morango com um núcleo cremoso de leite condensado cozido.",
                    "ingredients": "Polpa natural de morango, leite condensado, leite integral, açúcar.",
                    "price": 9.50,
                    "allow_addons": False,
                    "sizes_json": None,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["picoles"].id,
                    "name": "Picolé Skimo Chocolate Belga",
                    "short_description": "Sorvete de baunilha coberto com casquinha crocante de chocolate.",
                    "description": "Clássico irresistível com massa leve de fava de baunilha mergulhada em cobertura crocante de chocolate ao leite.",
                    "ingredients": "Leite integral, creme de leite, extrato natural de baunilha, chocolate ao leite, manteiga de cacau.",
                    "price": 10.00,
                    "allow_addons": False,
                    "sizes_json": None,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["picoles"].id,
                    "name": "Picolé Refrescante de Limão Siciliano",
                    "short_description": "Picolé à base de fruta, leve, refrescante e zero lactose.",
                    "description": "Ideal para dias quentes: feito com suco fresco e raspas de limão siciliano.",
                    "ingredients": "Água filtrada, suco de limão siciliano, raspas de limão, açúcar cristal.",
                    "price": 6.50,
                    "allow_addons": False,
                    "sizes_json": None,
                    "image_url": "",
                },
                # AÇAÍ
                {
                    "category_id": cat_map["acai"].id,
                    "name": "Açaí Tradicional Carol Mix",
                    "short_description": "Açaí puro batido na hora com banana, granola e leite condensado.",
                    "description": "Açaí cremoso de altíssima pureza, sem cristais de gelo. Escolha o tamanho e personalize com seus adicionais favoritos!",
                    "ingredients": "Polpa de açaí puro tipo A, xarope de guaraná, banana prata, granola tradicional, leite condensado.",
                    "price": 16.00,
                    "allow_addons": True,
                    "sizes_json": sizes_acai,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["acai"].id,
                    "name": "Açaí Trufado com Ninho e Nutella",
                    "short_description": "Camadas intercaladas de açaí cremoso, creme de Ninho e Nutella original.",
                    "description": "Montado em camadas generosas para cada colherada ter açaí geladinho, creme de leite Ninho e Nutella autêntica.",
                    "ingredients": "Polpa de açaí puro, creme de leite Ninho, creme de avelã Nutella, morangos frescos.",
                    "price": 22.00,
                    "allow_addons": True,
                    "sizes_json": sizes_acai,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["acai"].id,
                    "name": "Açaí Tropical com Cupuaçu",
                    "short_description": "Meio a meio de açaí cremoso e creme artesanal de cupuaçu.",
                    "description": "O equilíbrio amazônico entre o sabor marcante do açaí e a acidez cremosa do cupuaçu.",
                    "ingredients": "Polpa de açaí puro, creme de cupuaçu natural, xarope de guaraná.",
                    "price": 18.50,
                    "allow_addons": True,
                    "sizes_json": sizes_acai,
                    "image_url": "",
                },
                # COPO DA FELICIDADE
                {
                    "category_id": cat_map["copo-da-felicidade"].id,
                    "name": "Copo da Felicidade Morango com Ninho",
                    "short_description": "Camadas de mousse de Ninho, morangos frescos, brownie e chantilly.",
                    "description": "Uma explosão de texturas: brigadeiro branco de Ninho, pedaços macios de brownie de chocolate, morangos frescos e finalização com chantilly.",
                    "ingredients": "Mousse de leite Ninho, morangos frescos, brownie de chocolate meio amargo, ganache ao leite, chantilly.",
                    "price": 24.00,
                    "allow_addons": True,
                    "sizes_json": sizes_copo,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["copo-da-felicidade"].id,
                    "name": "Copo da Felicidade Kinder Bueno",
                    "short_description": "Creme de avelã branca, ganache, pedaços de Kinder Bueno e sorvete de creme.",
                    "description": "Nosso copo gourmet mais desejado! Combina creme artesanal de avelã, chocolate ao leite, wafer crocante e Kinder Bueno.",
                    "ingredients": "Creme de avelã branca, chocolate ao leite, biscoito wafer, barras de Kinder Bueno, creme de leite.",
                    "price": 27.50,
                    "allow_addons": True,
                    "sizes_json": sizes_copo,
                    "image_url": "",
                },
                {
                    "category_id": cat_map["copo-da-felicidade"].id,
                    "name": "Copo da Felicidade Banoffee Gelado",
                    "short_description": "Doce de leite mineiro, banana caramelizada, farofa de biscoito e chantilly.",
                    "description": "A famosa torta Banoffee em versão gelada de colher, finalizada com um toque suave de canela.",
                    "ingredients": "Doce de leite cremoso, banana nanica, biscoito amanteigado triturado, creme de nata batido, canela em pó.",
                    "price": 23.00,
                    "allow_addons": True,
                    "sizes_json": sizes_copo,
                    "image_url": "",
                },
            ]

            for pdata in products_data:
                db.session.add(Product(**pdata))
            print(f"[SEED] {len(products_data)} produtos iniciais da Carol Mix cadastrados.")

        db.session.commit()
        print("[SEED] Banco populado com sucesso!")


if __name__ == "__main__":
    run_seed()