# Assistente de IA sem chave para quem usa

O app usa a sua chave do Gemini, guardada num servidor gratuito (Cloudflare Workers). Quem usa o app só conversa: não vê nem precisa de chave. Faça isto uma vez, de preferência no computador (uns 10 minutos).

## 1. Pegue a chave do Gemini (grátis)
1. Abra https://aistudio.google.com/apikey e entre com sua conta Google.
2. Toque em **Create API key** e copie a chave.

## 2. Crie o servidor no Cloudflare (grátis)
1. Crie a conta em https://dash.cloudflare.com/sign-up
2. No menu, abra **Workers & Pages** > **Create** > **Create Worker** (modelo "Hello World").
3. Dê o nome **treino** e clique em **Deploy**.
4. Clique em **Edit code**, apague tudo e cole o conteúdo de
   https://raw.githubusercontent.com/andrearanttes99/treino-sob-medida/main/servidor/worker.js
5. Clique em **Deploy**.

## 3. Guarde a chave no servidor
1. No worker, abra **Settings** > **Variables and Secrets** > **Add**.
2. Tipo **Secret**, nome **GEMINI_KEY**, valor: a chave do passo 1. Salve (**Deploy**).

## 4. Mande o endereço para o Claude
O endereço aparece no topo do worker, no formato `https://treino.SEU-NOME.workers.dev`. Envie no chat do projeto e ele liga o app ao servidor.

## 5. Ative o backup na nuvem (perfis, treinos e fotos)
1. No menu do Cloudflare, abra **Armazenamento e bancos de dados** > **Workers KV** > **Criar** (Create). Nome: **treino-dados**.
2. Volte ao worker **treino** > **Configurações** > **Vinculações** (Encadernações/Bindings) > **Adicionar vinculação** > **Namespace KV**.
3. Nome da variável: **DADOS**. Namespace: **treino-dados**. Clique em **Adicionar** / **Implantar**.
4. Confirme que o código do worker é o mais novo (passo 2.4).

No app, a aba Perfil mostra o código do backup. O mesmo código em outro celular junta os dados dos dois aparelhos.

## Custos e limites
O plano gratuito do Cloudflare aceita 100 mil pedidos por dia e 1 mil gravações de backup por dia, o suficiente para uso da família. O Gemini gratuito tem um limite diário de mensagens; se for atingido, o app avisa para tentar mais tarde. A chave nunca aparece no app.
