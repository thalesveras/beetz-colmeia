import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from '../components/ui/BrandLogo'

// Páginas públicas exigidas pela tela de consentimento do Google (OAuth):
// Política de Privacidade e Termos de Serviço. São públicas de propósito —
// o Google visita esses links sem estar logado. Respondem tanto nos
// endereços curtos cadastrados no Google Console (/priv e /tems) quanto
// nos bonitos (/privacidade e /termos).

function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-beetz-dark py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl p-6 md:p-10">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <BrandLogo size="sm" withName />
          <Link to="/" className="text-sm font-semibold underline text-beetz-dark/70">← Voltar ao início</Link>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-beetz-dark">{title}</h1>
        <p className="text-xs text-beetz-dark/50 mt-1 mb-6">Última atualização: {updated}</p>
        <div className="space-y-4 text-[15px] leading-relaxed text-beetz-dark/90">
          {children}
        </div>
      </div>
    </div>
  )
}

const H = ({ children }: { children: ReactNode }) => (
  <h2 className="text-lg font-bold text-beetz-dark pt-2">{children}</h2>
)

export function PrivacyPage() {
  return (
    <LegalShell title="Política de Privacidade" updated="julho de 2026">
      <p>
        A <strong>Colmeia</strong> é o aplicativo interno da Beetz para organização da nossa
        equipe e dos nossos eventos. Esta política explica, em linguagem simples, quais dados
        tratamos e por quê, em conformidade com a Lei Geral de Proteção de Dados
        (LGPD — Lei nº 13.709/2018).
      </p>

      <H>Quais dados coletamos</H>
      <p>
        Dados de cadastro fornecidos por você: nome, e-mail, telefone, data de nascimento,
        foto de perfil e informações profissionais (função, departamento, experiência).
        Dados operacionais gerados pelo trabalho: escalas, participação em eventos,
        recebimentos, despesas, comprovantes e registros de estoque. Para pagamentos,
        armazenamos a chave Pix que você informar.
      </p>

      <H>Login com Google</H>
      <p>
        Se você entrar com o Google, recebemos apenas seu nome, e-mail e foto — o suficiente
        para identificar sua conta. Não acessamos seus arquivos, contatos, agenda nem qualquer
        outro conteúdo da sua Conta Google.
      </p>

      <H>Para que usamos</H>
      <p>
        Exclusivamente para a operação da Beetz: montar escalas, organizar eventos, calcular e
        registrar pagamentos, controlar estoque e manter a comunicação interna (avisos no app e,
        se você ativar, notificações no celular e por e-mail — que podem ser desligadas a
        qualquer momento na tela de Alertas).
      </p>

      <H>Com quem compartilhamos</H>
      <p>
        Não vendemos nem cedemos seus dados a terceiros para publicidade. Os dados ficam
        armazenados em provedores de nuvem contratados pela Beetz (hospedagem na região de
        São Paulo), e o acesso dentro do app é restrito por perfil — cada pessoa enxerga apenas
        o que a sua função permite.
      </p>

      <H>Seus direitos</H>
      <p>
        Você pode acessar, corrigir ou pedir a exclusão dos seus dados a qualquer momento,
        além de revogar consentimentos. É só falar com a Diretoria da Beetz pelos canais
        oficiais ou pelo próprio aplicativo.
      </p>

      <H>Segurança e retenção</H>
      <p>
        Usamos autenticação com senha ou Google, criptografia em trânsito e regras de acesso
        por perfil. Registros financeiros e operacionais são mantidos pelo prazo exigido por
        obrigações legais e fiscais; o restante é mantido enquanto sua conta estiver ativa.
      </p>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Termos de Serviço" updated="julho de 2026">
      <p>
        Estes termos regem o uso da <strong>Colmeia</strong>, o aplicativo interno da Beetz.
        Ao criar uma conta ou entrar no aplicativo, você concorda com eles.
      </p>

      <H>Quem pode usar</H>
      <p>
        O aplicativo é destinado a colaboradores, prestadores e parceiros da Beetz. A conta é
        pessoal e intransferível: mantenha sua senha em sigilo e não permita que outras pessoas
        usem seu acesso.
      </p>

      <H>Suas responsabilidades</H>
      <p>
        Manter seus dados de cadastro corretos e atualizados (incluindo a chave Pix usada em
        pagamentos) e registrar informações verdadeiras. Lançamentos de recebimentos, despesas
        e estoque são registros internos de trabalho da Beetz e podem ser revisados pela
        Diretoria.
      </p>

      <H>Uso adequado</H>
      <p>
        É proibido usar o aplicativo para fins alheios à operação da Beetz, tentar acessar
        dados de outras pessoas além do que seu perfil permite, ou comprometer a segurança do
        sistema.
      </p>

      <H>Suspensão e encerramento</H>
      <p>
        A Diretoria pode suspender ou encerrar contas em caso de desligamento da equipe ou
        violação destes termos. Você pode pedir o encerramento da sua conta a qualquer momento.
      </p>

      <H>Disponibilidade e alterações</H>
      <p>
        Trabalhamos para manter o aplicativo no ar, mas ele pode ficar temporariamente
        indisponível por manutenção ou fatores externos. Estes termos podem ser atualizados;
        mudanças relevantes serão avisadas pelo próprio aplicativo.
      </p>

      <H>Lei aplicável</H>
      <p>
        Estes termos são regidos pelas leis brasileiras. Dúvidas? Fale com a Diretoria da
        Beetz pelos canais oficiais.
      </p>
    </LegalShell>
  )
}
