# 🐝 Beetz Colmeia

Comunidade interna da Beetz: conheça a turma, equipes, eventos e histórico de participação. Feito com React + Vite + TypeScript + Tailwind CSS + Supabase.

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure o Supabase:
   - Copie `.env.example` para `.env`
   - No painel do seu projeto Supabase, vá em **Project Settings > API** e copie a **Project URL** e a **anon public key** para o `.env`
   - No **SQL Editor** do Supabase, rode nesta ordem:
     1. `supabase/schema.sql` (cria as tabelas, triggers e políticas de segurança)
     2. `supabase/seed.sql` (cria os 9 departamentos padrão)

3. Rode o projeto:
   ```bash
   npm run dev
   ```
   Acesse `http://localhost:5173`.

Se você não preencher o `.env`, o app entra automaticamente em **modo demonstração**: roda 100% no navegador com dados de exemplo (14 colaboradores, 5 eventos, mel e elogios fictícios), sem precisar de banco de dados. Ótimo para validar o visual antes de conectar o Supabase de verdade.

## Primeiro acesso

1. Crie uma conta em `/entrar` (email + senha, via Supabase Auth).
2. No primeiro login, você é levado direto para o cadastro de perfil em 5 etapas (dados pessoais, informações familiares, profissionais, saúde e perfil social) com barra de progresso.
3. Depois de concluir, você cai no dashboard da colmeia.

## Estrutura do projeto

```
src/
  components/     componentes de UI e layout (sidebar, cards, avatar, badges...)
  contexts/       AuthContext (login, sessão, perfil do usuário)
  lib/            tipos, cliente Supabase, camada de dados (dataService), regras de gamificação
  pages/          telas do app (dashboard, turma, perfil, mapa, eventos, ranking...)
  pages/onboarding/  wizard de cadastro em 5 etapas
supabase/
  schema.sql      tabelas, triggers e RLS
  seed.sql        departamentos padrão
```

Toda a lógica de leitura/escrita de dados passa por `src/lib/dataService.ts`. Ele decide sozinho se fala com o Supabase de verdade ou com os dados mock em memória (`src/lib/mockData.ts`), então as telas nunca precisam saber em qual modo estão.

## Gamificação

Os níveis (`Nova Abelha` → `Lenda Beetz`) e as medalhas (primeiro evento, 10 eventos, 50 eventos, líder destaque, pontualidade, mais elogiado) estão centralizados em `src/lib/levels.ts`. Os níveis e as medalhas de eventos são calculados automaticamente a partir do histórico de `event_members`; as medalhas "líder destaque" e "pontualidade" são concedidas manualmente (inserindo uma linha na tabela `badges` pelo SQL Editor ou por um backoffice futuro).

## Observações técnicas

- A foto de perfil é salva como imagem embutida (base64) diretamente no campo `avatar_url`. Para produção com muitos usuários, o ideal é migrar para o **Supabase Storage** (bucket de avatars) — a estrutura do formulário já está pronta para isso, bastando trocar a função de upload em `src/pages/onboarding/StepPersonalData.tsx`.
- As políticas de RLS liberam leitura de todas as tabelas para qualquer usuário autenticado (é uma comunidade interna, não um sistema com dados sigilosos entre colegas) e restringem escrita ao próprio usuário nos casos sensíveis (perfil, mel, elogios). Ajuste conforme a necessidade da Beetz.
- Este projeto foi escrito à mão neste ambiente sem acesso à internet para instalar pacotes, então `npm install` não foi executado aqui — rode-o na sua máquina antes do `npm run dev`. Todo o código TypeScript/JSX foi validado com o compilador `tsc` (0 erros) antes da entrega.
