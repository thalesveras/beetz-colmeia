-- =========================================================
-- Beetz Colmeia — dados iniciais (departamentos)
-- Rode depois do schema.sql. Os colaboradores de exemplo
-- ficam de fora aqui porque profiles depende de auth.users;
-- crie as primeiras contas pela própria tela de login/cadastro do app.
-- =========================================================

insert into public.departments (name, slug, icon, description) values
  ('Diretoria', 'diretoria', '👑', 'Visão e direção da Beetz'),
  ('Produção', 'producao', '🛠️', 'Faz o evento existir de verdade'),
  ('Bar', 'bar', '🍹', 'A energia da pista começa aqui'),
  ('Caixa', 'caixa', '💰', 'Cuida de cada centavo da colmeia'),
  ('Garçons', 'garcons', '🍽️', 'Atendimento com o mel da casa'),
  ('Segurança', 'seguranca', '🛡️', 'Protege a colmeia inteira'),
  ('Credenciamento', 'credenciamento', '🎫', 'A primeira abelha que você vê'),
  ('Limpeza', 'limpeza', '✨', 'Deixa tudo brilhando'),
  ('Fornecedores', 'fornecedores', '📦', 'Parceiros externos da colmeia')
on conflict (slug) do nothing;
