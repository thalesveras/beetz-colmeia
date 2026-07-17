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
  }
]

export const ALERT_FLAG_KEYS: AlertFlagKey[] = ALERT_TYPES.map((a) => a.key)

export function alertTypesByEscopo(escopo: 'pessoal' | 'global') {
  return ALERT_TYPES.filter((a) => a.escopo === escopo)
}
