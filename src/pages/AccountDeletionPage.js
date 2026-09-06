import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import '../recoveredContent.css';

export default function AccountDeletionPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const en = language === 'en';

  return (
    <main className="page legal-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">{en ? 'My CIRC · Account' : 'My CIRC · Conta'}</p>
          <h1>{en ? 'Delete your CIRC account' : 'Eliminar a sua conta CIRC'}</h1>
        </div>
        <div className="page-hero__aside">
          <span className="status-chip">CIRC 2027</span>
          <p>
            {en
              ? 'A public resource to request or complete deletion of your My CIRC account and associated profile data.'
              : 'Recurso público para pedir ou concluir a eliminação da conta My CIRC e dos dados de perfil associados.'}
          </p>
        </div>
      </section>

      <div className="legal-intro">
        {en
          ? 'The My CIRC account is managed by Associação Hemisfério Disciplinado (AHD). You can delete it directly through the website. The operation is permanent.'
          : 'A conta My CIRC é gerida pela Associação Hemisfério Disciplinado (AHD). Pode eliminá-la diretamente através do website. A operação é permanente.'}
      </div>

      <section className="legal-section">
        <h2>{en ? '1. Delete the account online' : '1. Eliminar a conta online'}</h2>
        <p>
          {en
            ? 'Use the button below. If you are not signed in, you will first be asked to authenticate and will then return to the account security page.'
            : 'Utilize o botão abaixo. Se não tiver sessão iniciada, ser-lhe-á primeiro pedido que faça a autenticação e regressará depois à página de segurança da conta.'}
        </p>
        <p>
          <Link className="button account-primary-button" to="/conta/seguranca">
            {user
              ? (en ? 'Open account security' : 'Abrir segurança da conta')
              : (en ? 'Sign in and delete account' : 'Entrar e eliminar conta')}
          </Link>
        </p>
        <p>
          {en
            ? 'On the Security page, choose “Permanently delete account” and confirm your identity. Email/password accounts require the current password; accounts using Google or Microsoft use provider reauthentication.'
            : 'Na página Segurança, escolha “Eliminar conta permanentemente” e confirme a sua identidade. Contas com email/palavra-passe exigem a palavra-passe atual; contas Google ou Microsoft utilizam a reautenticação do respetivo fornecedor.'}
        </p>
      </section>

      <section className="legal-section">
        <h2>{en ? '2. What is deleted' : '2. O que é eliminado'}</h2>
        <ul>
          <li>{en ? 'The Firebase Authentication account used to access My CIRC.' : 'A conta Firebase Authentication utilizada para aceder ao My CIRC.'}</li>
          <li>{en ? 'The My CIRC participant profile stored in the CIRC user database.' : 'O perfil de participante My CIRC armazenado na base de dados de utilizadores CIRC.'}</li>
          <li>{en ? 'Local My CIRC profile data stored by this website in the browser.' : 'Os dados locais do perfil My CIRC guardados por este website no browser.'}</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>{en ? '3. Data that may need to be retained' : '3. Dados que podem ter de ser conservados'}</h2>
        <p>
          {en
            ? 'When registrations, payments or invoicing are active, some transaction, accounting, audit or legally required records may have to be retained for the applicable statutory period. Such records are not retained merely to keep the deleted account active and are handled according to the Privacy Policy and applicable law.'
            : 'Quando estiverem ativas inscrições, pagamentos ou faturação, alguns registos transacionais, contabilísticos, de auditoria ou legalmente obrigatórios poderão ter de ser conservados durante o prazo legal aplicável. Esses registos não são conservados para manter ativa a conta eliminada e são tratados nos termos da Política de Privacidade e da legislação aplicável.'}
        </p>
      </section>

      <section className="legal-section">
        <h2>{en ? '4. If you cannot access your account' : '4. Se não conseguir aceder à conta'}</h2>
        <p>
          {en
            ? 'If you cannot sign in or need an additional erasure request regarding associated personal data, contact the CIRC organisation. Identity verification may be required before acting on the request.'
            : 'Se não conseguir iniciar sessão ou necessitar de um pedido adicional de apagamento relativo a dados pessoais associados, contacte a organização do CIRC. Poderá ser necessária verificação de identidade antes de executar o pedido.'}
        </p>
        <p><Link className="text-link" to="/contactos">{en ? 'Contact CIRC' : 'Contactar o CIRC'}</Link></p>
      </section>

      <section className="legal-section">
        <h2>{en ? '5. Privacy information' : '5. Informação de privacidade'}</h2>
        <p>
          <Link className="text-link" to="/privacidade">{en ? 'Read the Privacy Policy' : 'Consultar a Política de Privacidade'}</Link>
        </p>
      </section>

      <div className="legal-meta">
        <span>{en ? 'Last updated · 6 September 2026' : 'Última atualização · 6 setembro 2026'}</span>
        <span>circ-coimbra.org</span>
        <span>Associação Hemisfério Disciplinado · NIF 517 072 262</span>
      </div>
    </main>
  );
}
