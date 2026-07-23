import type { AlertTypeDef, AlertFlagKey } from './types'

// O catálogo dos alertas que a Colmeia sabe disparar. Cada linha aqui tem uma
// flag correspondente em role_permissions E um trigger no banco — se algum dia
// alguém adicionar um item aqui sem criar o trigger, a tela vai prometer um
// aviso que nunca chega. Os três andam juntos: catálogo, flag, trigger.
//
// 'gatilho' é o que a tela mostra pra Diretoria entender QUANDO aquilo dispara.
// Sem isso, "Estoque baixo" é adivinhação: baixo em relação a quê?
export const ALERT_TYPES: AlertTypeDef[] = [
  {
    key: 'can_receive_alert_staffing_decision',
    label: 'Sua escala foi decidida',
    description: 'Avisa a pessoa quando o líder confirma ou recusa a candidatura dela.',
    kind: 'Escala',
    escopo: 'pessoal',
    gatilho: 'Quando o líder muda o status da candidatura no evento.'
  },
  {
    key: 'can_receive_alert_expense_reviewed',
    label: 'Sua despesa foi revisada',
    description: 'Avisa quem lançou a despesa quando ela é aprovada, paga ou rejeitada.',
    kind: 'Despesa',
    escopo: 'pessoal',
    gatilho: 'Quando a despesa muda para Aprovado, Pago ou Rejeitado.'
  },
  {
    key: 'can_receive_alert_staffing_application',
    label: 'Alguém se candidatou',
    description: 'Avisa o líder do evento que chegou candidatura nova para avaliar.',
    kind: 'Escala',
    escopo: 'pessoal',
    gatilho: 'Quando alguém se candidata a uma vaga de um evento que você lidera.'
  },
  {
    key: 'can_receive_alert_staffing_new_slot',
    label: 'Vaga aberta em evento',
    description: 'Avisa a turma quando uma vaga nova é cadastrada num evento.',
    kind: 'Escala',
    escopo: 'global',
    gatilho: 'Quando uma vaga é criada no resumo do evento.'
  },
  {
    key: 'can_receive_alert_stock_low',
    label: 'Estoque abaixo do mínimo',
    description: 'Avisa quando o saldo de um produto fica igual ou menor que o mínimo definido no catálogo.',
    kind: 'Estoque',
    escopo: 'global',
    gatilho: 'Após qualquer movimentação, se o saldo furar o mínimo do produto.'
  },
  {
    key: 'can_receive_alert_event_changed',
    label: 'Evento alterado',
    description: 'Avisa quem está confirmado no evento quando a data ou o status muda.',
    kind: 'Evento',
    escopo: 'global',
    gatilho: 'Quando a data ou o status do evento é alterado.'
  },
  {
    key: 'can_receive_alert_inventory_diff',
    label: 'Divergência de inventário',
    description: 'Avisa quando a contagem física não bate com o sistema e gera ajuste.',
    kind: 'Estoque',
    escopo: 'global',
    gatilho: 'Quando o inventário físico gera um ajuste. Correção avulsa não conta.'
  },
  {
    key: 'can_receive_alert_stock_idle',
    label: 'Produto parado',
    description: 'Avisa quando um produto tem saldo mas ninguém movimenta há mais de 30 dias.',
    kind: 'Estoque',
    escopo: 'global',
    gatilho: 'Rotina diária às 9h. Não repete o mesmo produto por 7 dias.'
  },
  {
    key: 'can_receive_alert_pending_return',
    label: 'Devolução pendente',
    description: 'Avisa quando um evento já passou e saiu mais produto do que voltou.',
    kind: 'Estoque',
    escopo: 'global',
    gatilho: 'Rotina diária às 9h, em eventos com data passada. Não repete por 7 dias.'
  },
  {
    key: 'can_receive_alert_application_sent',
    label: 'Sua candidatura foi enviada',
    description: 'Confirma na hora que a candidatura a uma vaga entrou na fila do líder.',
    kind: 'Escala',
    escopo: 'pessoal',
    gatilho: 'Quando você toca em "Quero essa vaga".'
  },
  {
    key: 'can_receive_alert_profile_updated',
    label: 'Seu perfil foi alterado',
    description: 'Avisa quando dados visíveis do seu perfil mudam — se não foi você, dá pra reagir rápido.',
    kind: 'Geral',
    escopo: 'pessoal',
    gatilho: 'Quando nome, foto, telefone, cidade ou outros dados do perfil são salvos.'
  },
  {
    key: 'can_receive_alert_profile_complete',
    label: 'Medalha: perfil completo',
    description: 'Parabeniza quando a pessoa preenche o perfil inteiro (foto, contato, Pix) e ganha a medalha 🪪.',
    kind: 'Geral',
    escopo: 'pessoal',
    gatilho: 'Uma vez na vida, quando nome, sobrenome, telefone, cidade, nascimento, foto e chave Pix ficam todos preenchidos.'
  },
  {
    key: 'can_receive_alert_login',
    label: 'Novo acesso à sua conta',
    description: 'Avisa a cada login — seus outros aparelhos ficam sabendo do acesso.',
    kind: 'Geral',
    escopo: 'pessoal',
    gatilho: 'Quando alguém entra na sua conta (senha ou Google).'
  },
  {
    key: 'can_receive_alert_logout',
    label: 'Saída da conta',
    description: 'Confirma quando a sessão é encerrada num aparelho.',
    kind: 'Geral',
    escopo: 'pessoal',
    gatilho: 'Quando você toca em Sair.'
  }
]

export const ALERT_FLAG_KEYS: AlertFlagKey[] = ALERT_TYPES.map((a) => a.key)

export function alertTypesByEscopo(escopo: 'pessoal' | 'global') {
  return ALERT_TYPES.filter((a) => a.escopo === escopo)
}
