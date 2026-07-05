import type { Badge, Compliment, Department, EventItem, EventMember, HoneyPoint, Profile } from './types'

export const mockDepartments: Department[] = [
  { id: 'd1', name: 'Diretoria', slug: 'diretoria', icon: '👑', description: 'Visão e direção da Beetz' },
  { id: 'd2', name: 'Produção', slug: 'producao', icon: '🛠️', description: 'Faz o evento existir de verdade' },
  { id: 'd3', name: 'Bar', slug: 'bar', icon: '🍹', description: 'A energia da pista começa aqui' },
  { id: 'd4', name: 'Caixa', slug: 'caixa', icon: '💰', description: 'Cuida de cada centavo da colmeia' },
  { id: 'd5', name: 'Garçons', slug: 'garcons', icon: '🍽️', description: 'Atendimento com o mel da casa' },
  { id: 'd6', name: 'Segurança', slug: 'seguranca', icon: '🛡️', description: 'Protege a colmeia inteira' },
  { id: 'd7', name: 'Credenciamento', slug: 'credenciamento', icon: '🎫', description: 'A primeira abelha que você vê' },
  { id: 'd8', name: 'Limpeza', slug: 'limpeza', icon: '✨', description: 'Deixa tudo brilhando' },
  { id: 'd9', name: 'Fornecedores', slug: 'fornecedores', icon: '📦', description: 'Parceiros externos da colmeia' }
]

function avatar(seed: number) {
  return `https://i.pravatar.cc/300?img=${seed}`
}

export const mockProfiles: Profile[] = [
  {
    id: 'p1', first_name: 'Marina', last_name: 'Souza', birth_date: '1994-03-12', cpf: '111.111.111-11',
    phone: '(11) 99999-0001', email: 'marina@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Ana Souza', father_name: 'Carlos Souza', emergency_contact_name: 'Ana Souza', emergency_contact_phone: '(11) 98888-0001',
    department_id: 'd1', role: 'Diretora de Operações', experience_level: 'Líder de bar', entry_date: '2019-02-01',
    work_location: 'São Paulo - SP', skills: ['Gestão', 'Negociação', 'Liderança'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Apaixonada por criar experiências inesquecíveis.', fun_fact: 'Já produziu mais de 200 eventos.',
    favorite_events: 'Festivais de música', instagram: '@marinasouza', personal_quote: 'Quem faz mel não tem tempo de ser abelha triste.',
    avatar_url: avatar(1), onboarding_completed: true, created_at: '2019-02-01T10:00:00Z'
  },
  {
    id: 'p2', first_name: 'Rafael', last_name: 'Lima', birth_date: '1990-07-22', cpf: '111.111.111-12',
    phone: '(11) 99999-0002', email: 'rafael@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Rosa Lima', father_name: 'José Lima', emergency_contact_name: 'Rosa Lima', emergency_contact_phone: '(11) 98888-0002',
    department_id: 'd2', role: 'Coordenador de Produção', experience_level: 'Colaborador frequente', entry_date: '2020-05-10',
    work_location: 'São Paulo - SP', skills: ['Logística', 'Montagem de palco', 'Gestão de equipe'],
    health_conditions: null, allergies: 'Poeira', important_notes: null,
    about_me: 'Resolve qualquer imprevisto 20 minutos antes do show.', fun_fact: 'Já dormiu num palco montado.',
    favorite_events: 'Shows de rock', instagram: '@rafaellima', personal_quote: 'Produção boa é aquela que ninguém percebe.',
    avatar_url: avatar(12), onboarding_completed: true, created_at: '2020-05-10T10:00:00Z'
  },
  {
    id: 'p3', first_name: 'Bianca', last_name: 'Alves', birth_date: '1998-11-02', cpf: '111.111.111-13',
    phone: '(21) 99999-0003', email: 'bianca@beetz.com', city: 'Rio de Janeiro', state: 'RJ',
    mother_name: 'Sandra Alves', father_name: 'Marcos Alves', emergency_contact_name: 'Sandra Alves', emergency_contact_phone: '(21) 98888-0003',
    department_id: 'd3', role: 'Bartender Líder', experience_level: 'Líder de bar', entry_date: '2021-01-15',
    work_location: 'Rio de Janeiro - RJ', skills: ['Coquetelaria', 'Atendimento', 'Gestão de estoque'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Transformo pedido de drink em experiência.', fun_fact: 'Sabe fazer 40 drinks diferentes de cabeça.',
    favorite_events: 'Festas open bar', instagram: '@biancaalves', personal_quote: 'Um bom drink resolve metade dos problemas.',
    avatar_url: avatar(5), onboarding_completed: true, created_at: '2021-01-15T10:00:00Z'
  },
  {
    id: 'p4', first_name: 'Diego', last_name: 'Ferreira', birth_date: '1996-04-18', cpf: '111.111.111-14',
    phone: '(11) 99999-0004', email: 'diego@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Marta Ferreira', father_name: 'Paulo Ferreira', emergency_contact_name: 'Marta Ferreira', emergency_contact_phone: '(11) 98888-0004',
    department_id: 'd3', role: 'Bartender', experience_level: 'Colaborador frequente', entry_date: '2022-03-01',
    work_location: 'São Paulo - SP', skills: ['Flair', 'Atendimento rápido'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Bar cheio é o meu habitat natural.', fun_fact: 'Já fez 500 caipirinhas em uma noite.',
    favorite_events: 'Carnaval', instagram: '@diegoferreira', personal_quote: 'Sorriso no rosto, gelo no copo.',
    avatar_url: avatar(13), onboarding_completed: true, created_at: '2022-03-01T10:00:00Z'
  },
  {
    id: 'p5', first_name: 'Camila', last_name: 'Rocha', birth_date: '2000-09-09', cpf: '111.111.111-15',
    phone: '(11) 99999-0005', email: 'camila@beetz.com', city: 'Campinas', state: 'SP',
    mother_name: 'Luiza Rocha', father_name: 'Renato Rocha', emergency_contact_name: 'Luiza Rocha', emergency_contact_phone: '(11) 98888-0005',
    department_id: 'd4', role: 'Operadora de Caixa', experience_level: 'Em treinamento', entry_date: '2024-06-01',
    work_location: 'Campinas - SP', skills: ['Organização', 'Conferência de valores'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Detalhista com números, gentil com pessoas.', fun_fact: 'Nunca fechou o caixa com diferença.',
    favorite_events: 'Feiras', instagram: '@camilarocha', personal_quote: 'Confiança se constrói centavo a centavo.',
    avatar_url: avatar(9), onboarding_completed: true, created_at: '2024-06-01T10:00:00Z'
  },
  {
    id: 'p6', first_name: 'Lucas', last_name: 'Martins', birth_date: '1995-01-30', cpf: '111.111.111-16',
    phone: '(11) 99999-0006', email: 'lucas@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Denise Martins', father_name: 'Fábio Martins', emergency_contact_name: 'Denise Martins', emergency_contact_phone: '(11) 98888-0006',
    department_id: 'd5', role: 'Garçom Líder', experience_level: 'Líder de bar', entry_date: '2020-08-20',
    work_location: 'São Paulo - SP', skills: ['Atendimento', 'Organização de mesas', 'Treinamento de equipe'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Cada mesa bem servida é uma vitória.', fun_fact: 'Já atendeu uma banda internacional inteira.',
    favorite_events: 'Eventos corporativos', instagram: '@lucasmartins', personal_quote: 'Atenção aos detalhes muda tudo.',
    avatar_url: avatar(14), onboarding_completed: true, created_at: '2020-08-20T10:00:00Z'
  },
  {
    id: 'p7', first_name: 'Juliana', last_name: 'Costa', birth_date: '1999-06-14', cpf: '111.111.111-17',
    phone: '(11) 99999-0007', email: 'juliana@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Vera Costa', father_name: 'Edson Costa', emergency_contact_name: 'Vera Costa', emergency_contact_phone: '(11) 98888-0007',
    department_id: 'd5', role: 'Garçonete', experience_level: 'Colaborador frequente', entry_date: '2022-10-05',
    work_location: 'São Paulo - SP', skills: ['Simpatia', 'Agilidade'],
    health_conditions: null, allergies: 'Amendoim', important_notes: null,
    about_me: 'Gosto de deixar o convidado à vontade.', fun_fact: 'Decorou o cardápio inteiro em um dia.',
    favorite_events: 'Casamentos', instagram: '@julianacosta', personal_quote: 'Sorrir também é servir.',
    avatar_url: avatar(20), onboarding_completed: true, created_at: '2022-10-05T10:00:00Z'
  },
  {
    id: 'p8', first_name: 'Thiago', last_name: 'Pereira', birth_date: '1988-12-25', cpf: '111.111.111-18',
    phone: '(11) 99999-0008', email: 'thiago@beetz.com', city: 'Guarulhos', state: 'SP',
    mother_name: 'Sonia Pereira', father_name: 'Nelson Pereira', emergency_contact_name: 'Sonia Pereira', emergency_contact_phone: '(11) 98888-0008',
    department_id: 'd6', role: 'Coordenador de Segurança', experience_level: 'Líder de bar', entry_date: '2018-11-01',
    work_location: 'Guarulhos - SP', skills: ['Gestão de crises', 'Primeiros socorros'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Prefiro prevenir do que remediar.', fun_fact: 'Trabalhou em mais de 300 eventos.',
    favorite_events: 'Shows de grande público', instagram: '@thiagopereira', personal_quote: 'Segurança é cuidado, não é medo.',
    avatar_url: avatar(15), onboarding_completed: true, created_at: '2018-11-01T10:00:00Z'
  },
  {
    id: 'p9', first_name: 'Fernanda', last_name: 'Dias', birth_date: '2001-02-08', cpf: '111.111.111-19',
    phone: '(11) 99999-0009', email: 'fernanda@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Patricia Dias', father_name: 'Roberto Dias', emergency_contact_name: 'Patricia Dias', emergency_contact_phone: '(11) 98888-0009',
    department_id: 'd7', role: 'Credenciamento', experience_level: 'Nova abelha', entry_date: '2025-11-01',
    work_location: 'São Paulo - SP', skills: ['Simpatia', 'Organização'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Sou a primeira pessoa que você vê na entrada!', fun_fact: 'Memoriza rostos com facilidade.',
    favorite_events: 'Festivais', instagram: '@fernandadias', personal_quote: 'Primeira impressão é a que fica.',
    avatar_url: avatar(23), onboarding_completed: true, created_at: '2025-11-01T10:00:00Z'
  },
  {
    id: 'p10', first_name: 'Bruno', last_name: 'Cardoso', birth_date: '1993-05-17', cpf: '111.111.111-20',
    phone: '(11) 99999-0010', email: 'bruno@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Regina Cardoso', father_name: 'Sérgio Cardoso', emergency_contact_name: 'Regina Cardoso', emergency_contact_phone: '(11) 98888-0010',
    department_id: 'd8', role: 'Supervisor de Limpeza', experience_level: 'Colaborador frequente', entry_date: '2021-07-19',
    work_location: 'São Paulo - SP', skills: ['Organização', 'Gestão de equipe'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Evento limpo é evento de respeito com o público.', fun_fact: 'Já organizou limpeza de um festival de 3 dias.',
    favorite_events: 'Festivais de grande porte', instagram: '@brunocardoso', personal_quote: 'Nos detalhes mora a excelência.',
    avatar_url: avatar(33), onboarding_completed: true, created_at: '2021-07-19T10:00:00Z'
  },
  {
    id: 'p11', first_name: 'Larissa', last_name: 'Nogueira', birth_date: '1997-10-03', cpf: '111.111.111-21',
    phone: '(19) 99999-0011', email: 'larissa@beetz.com', city: 'Campinas', state: 'SP',
    mother_name: 'Célia Nogueira', father_name: 'Adão Nogueira', emergency_contact_name: 'Célia Nogueira', emergency_contact_phone: '(19) 98888-0011',
    department_id: 'd9', role: 'Relacionamento com Fornecedores', experience_level: 'Colaborador frequente', entry_date: '2021-09-12',
    work_location: 'Campinas - SP', skills: ['Negociação', 'Contratos'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Conecto quem faz acontecer com quem faz o evento.', fun_fact: 'Conhece mais de 100 fornecedores pelo nome.',
    favorite_events: 'Feiras corporativas', instagram: '@larissanogueira', personal_quote: 'Boas parcerias fazem grandes eventos.',
    avatar_url: avatar(29), onboarding_completed: true, created_at: '2021-09-12T10:00:00Z'
  },
  {
    id: 'p12', first_name: 'Pedro', last_name: 'Araújo', birth_date: '1992-08-27', cpf: '111.111.111-22',
    phone: '(11) 99999-0012', email: 'pedro@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Ivone Araújo', father_name: 'Cláudio Araújo', emergency_contact_name: 'Ivone Araújo', emergency_contact_phone: '(11) 98888-0012',
    department_id: 'd2', role: 'Técnico de Som', experience_level: 'Colaborador frequente', entry_date: '2019-10-10',
    work_location: 'São Paulo - SP', skills: ['Sonorização', 'Iluminação'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Cuido para o som chegar redondinho na plateia.', fun_fact: 'Já operou som para mais de 15 mil pessoas.',
    favorite_events: 'Shows ao vivo', instagram: '@pedroaraujo', personal_quote: 'Sem som bom, não tem show.',
    avatar_url: avatar(52), onboarding_completed: true, created_at: '2019-10-10T10:00:00Z'
  },
  {
    id: 'p13', first_name: 'Aline', last_name: 'Barros', birth_date: '2003-01-19', cpf: '111.111.111-23',
    phone: '(11) 99999-0013', email: 'aline@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Tania Barros', father_name: 'Wagner Barros', emergency_contact_name: 'Tania Barros', emergency_contact_phone: '(11) 98888-0013',
    department_id: 'd7', role: 'Credenciamento', experience_level: 'Nova abelha', entry_date: '2026-04-01',
    work_location: 'São Paulo - SP', skills: ['Organização'],
    health_conditions: null, allergies: null, important_notes: 'Prefere eventos diurnos.',
    about_me: 'Ainda aprendendo tudo, mas com muita vontade!', fun_fact: 'Este é meu primeiro emprego formal.',
    favorite_events: 'Feiras', instagram: '@alinebarros', personal_quote: 'Toda lenda um dia foi iniciante.',
    avatar_url: avatar(45), onboarding_completed: true, created_at: '2026-04-01T10:00:00Z'
  },
  {
    id: 'p14', first_name: 'Gustavo', last_name: 'Ramos', birth_date: '1991-03-03', cpf: '111.111.111-24',
    phone: '(11) 99999-0014', email: 'gustavo@beetz.com', city: 'São Paulo', state: 'SP',
    mother_name: 'Marlene Ramos', father_name: 'Antônio Ramos', emergency_contact_name: 'Marlene Ramos', emergency_contact_phone: '(11) 98888-0014',
    department_id: 'd1', role: 'CEO', experience_level: 'Líder de bar', entry_date: '2017-01-01',
    work_location: 'São Paulo - SP', skills: ['Visão de negócio', 'Liderança'],
    health_conditions: null, allergies: null, important_notes: null,
    about_me: 'Construindo a colmeia desde o primeiro tijolo.', fun_fact: 'Fundou a Beetz na garagem de casa.',
    favorite_events: 'Todos, sem exceção', instagram: '@gustavoramos', personal_quote: 'Sozinho vamos rápido, juntos vamos longe.',
    avatar_url: avatar(60), onboarding_completed: true, created_at: '2017-01-01T10:00:00Z'
  }
]

export const mockEvents: EventItem[] = [
  { id: 'e1', name: 'Festival Colmeia de Verão', event_date: '2026-01-18', location: 'Parque Ibirapuera', city: 'São Paulo', status: 'Concluído', leader_id: 'p1', created_at: '2025-11-01T10:00:00Z' },
  { id: 'e2', name: 'Beetz Night Rooftop', event_date: '2026-06-20', location: 'Edifício Copan Rooftop', city: 'São Paulo', status: 'Concluído', leader_id: 'p6', created_at: '2026-05-01T10:00:00Z' },
  { id: 'e3', name: 'Feira Corporativa TechExpo', event_date: '2026-07-15', location: 'Expo Center Norte', city: 'São Paulo', status: 'Confirmado', leader_id: 'p2', created_at: '2026-06-10T10:00:00Z' },
  { id: 'e4', name: 'Casamento Villa Bela', event_date: '2026-08-02', location: 'Villa Bela Eventos', city: 'Campinas', status: 'Planejado', leader_id: 'p11', created_at: '2026-06-25T10:00:00Z' },
  { id: 'e5', name: 'Réveillon Beetz na Praia', event_date: '2025-12-31', location: 'Orla de Santos', city: 'Santos', status: 'Concluído', leader_id: 'p8', created_at: '2025-10-01T10:00:00Z' }
]

function member(id: string, event_id: string, profile_id: string, role_in_event: string): EventMember {
  return { id, event_id, profile_id, role_in_event, created_at: '2026-01-01T10:00:00Z' }
}

export const mockEventMembers: EventMember[] = [
  member('m1', 'e1', 'p1', 'Coordenação geral'), member('m2', 'e1', 'p2', 'Produção'), member('m3', 'e1', 'p3', 'Bar'),
  member('m4', 'e1', 'p4', 'Bar'), member('m5', 'e1', 'p6', 'Garçons'), member('m6', 'e1', 'p8', 'Segurança'),
  member('m7', 'e1', 'p9', 'Credenciamento'), member('m8', 'e1', 'p10', 'Limpeza'),
  member('m9', 'e2', 'p6', 'Coordenação geral'), member('m10', 'e2', 'p3', 'Bar'), member('m11', 'e2', 'p4', 'Bar'),
  member('m12', 'e2', 'p7', 'Garçons'), member('m13', 'e2', 'p8', 'Segurança'),
  member('m14', 'e3', 'p2', 'Coordenação geral'), member('m15', 'e3', 'p12', 'Som'), member('m16', 'e3', 'p9', 'Credenciamento'),
  member('m17', 'e3', 'p13', 'Credenciamento'), member('m18', 'e3', 'p5', 'Caixa'),
  member('m19', 'e4', 'p11', 'Coordenação geral'), member('m20', 'e4', 'p6', 'Garçons'), member('m21', 'e4', 'p7', 'Garçons'),
  member('m22', 'e5', 'p8', 'Coordenação geral'), member('m23', 'e5', 'p3', 'Bar'), member('m24', 'e5', 'p10', 'Limpeza'),
  member('m25', 'e5', 'p1', 'Diretoria'), member('m26', 'e5', 'p2', 'Produção')
]

export const mockHoneyPoints: HoneyPoint[] = [
  { id: 'h1', from_profile_id: 'p1', to_profile_id: 'p3', amount: 5, reason: 'Bar impecável no Festival de Verão', created_at: '2026-01-19T10:00:00Z' },
  { id: 'h2', from_profile_id: 'p6', to_profile_id: 'p7', amount: 3, reason: 'Atendimento nota 10', created_at: '2026-06-21T10:00:00Z' },
  { id: 'h3', from_profile_id: 'p8', to_profile_id: 'p9', amount: 2, reason: 'Simpatia com o público', created_at: '2026-01-19T12:00:00Z' },
  { id: 'h4', from_profile_id: 'p2', to_profile_id: 'p12', amount: 4, reason: 'Som perfeito', created_at: '2026-06-21T11:00:00Z' },
  { id: 'h5', from_profile_id: 'p14', to_profile_id: 'p1', amount: 10, reason: 'Liderança exemplar', created_at: '2026-01-20T09:00:00Z' },
  { id: 'h6', from_profile_id: 'p11', to_profile_id: 'p5', amount: 3, reason: 'Caixa fechado sem erros', created_at: '2026-06-16T09:00:00Z' }
]

export const mockCompliments: Compliment[] = [
  { id: 'c1', from_profile_id: 'p1', to_profile_id: 'p3', message: 'Bianca, seu bar foi o point da festa toda! 🍹', created_at: '2026-01-19T10:05:00Z' },
  { id: 'c2', from_profile_id: 'p6', to_profile_id: 'p7', message: 'Juliana, sua energia contagia a equipe inteira!', created_at: '2026-06-21T10:05:00Z' },
  { id: 'c3', from_profile_id: 'p8', to_profile_id: 'p9', message: 'Fernanda, mesmo nova você já é referência de simpatia.', created_at: '2026-01-19T12:05:00Z' },
  { id: 'c4', from_profile_id: 'p14', to_profile_id: 'p1', message: 'Marina, obrigado por segurar a barra com tanta classe.', created_at: '2026-01-20T09:05:00Z' }
]

export const mockBadges: Badge[] = [
  { id: 'b1', profile_id: 'p1', badge_type: 'leader_highlight', awarded_at: '2026-01-20T10:00:00Z' },
  { id: 'b2', profile_id: 'p8', badge_type: 'punctuality', awarded_at: '2026-01-20T10:00:00Z' },
  { id: 'b3', profile_id: 'p3', badge_type: 'most_complimented', awarded_at: '2026-01-20T10:00:00Z' }
]
