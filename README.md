# 🍨 Carol Mix — Cardápio Digital

Aplicação web distribuída de **Cardápio Digital** desenvolvida para a sorveteria **Carol Mix** (sorvetes artesanais, picolés, açaí e Copo da Felicidade). O sistema permite que clientes naveguem pelo cardápio, personalizem itens e acompanhem o preparo em tempo real, enquanto administradores gerenciam produtos, adicionais e pedidos com notificações instantâneas.

---

## 🌐 Acesso Rápido (Sistema Online)

O backend (API REST + WebSocket) e o banco de dados MySQL já estão hospedados na nuvem, permitindo testar a aplicação diretamente pelo navegador sem precisar instalar Python ou MySQL:

* **Cardápio do Cliente:** `https://GoroMajimaMad.github.io/cardapio-digital/frontend/index.html`
* **Painel Administrativo:** `https://GoroMajimaMad.github.io/cardapio-digital/frontend/admin.html`
* **Documentação da API (Swagger):** `https://-------.onrender.com/apidocs/`
* **Status da API (Health Check):** `https://--------.onrender.com/api/health`

### 🔐 Credenciais do Painel Administrativo
* **E-mail:** `admin@carolmix.com`
* **Senha:** `admin123`

---

## ⚡ Como Testar


1. Abra o **Cardápio do Cliente** em uma aba e o **Painel Administrativo** em outra (faça login com as credenciais acima).
2. Na aba do cliente, clique em qualquer produto, escolha tamanho/adicionais, adicione ao carrinho e finalize o pedido informando seu nome e mesa/retirada.
3. Na aba do administrador, o pedido aparecerá **instantaneamente** no topo da lista com destaque visual, notificação e alerta sonoro.
4. Altere o status do pedido no painel admin (`Recebido` → `Em preparo` → `Pronto` → `Entregue`) e observe a barra de progresso atualizar automaticamente na janela **Meus Pedidos** do cliente.
5. Clique em **Histórico** no card do pedido (no painel admin) para visualizar o registro de data, hora e usuário responsável por cada mudança de status.

---
