import { speakers2027 } from '../data/speakers2027';
import { moderators2027 } from '../data/moderators2027';

const titles = {
  '/admin/notificacoes': ['Notificações da organização', 'Organiser notifications'],
  '/conta/notificacoes': ['Notificações', 'Notifications'],
  '/programa': ['Programa científico', 'Scientific programme'], '/conta/programa': ['Programa científico', 'Scientific programme'],
  '/oradores': ['Oradores e moderadores', 'Speakers and moderators'], '/participar': ['Inscrições e cursos', 'Registration and courses'],
  '/conta': ['My CIRC', 'My CIRC'], '/conta/perfil': ['O meu perfil', 'My profile'],
  '/conta/inscricoes': ['As minhas inscrições', 'My registrations'], '/conta/submissoes': ['Os meus trabalhos', 'My submissions'],
  '/conta/seguranca': ['Segurança da conta', 'Account security'], '/login': ['Iniciar sessão', 'Sign in'],
  '/registar': ['Criar conta', 'Create account'], '/recuperar-password': ['Recuperar palavra-passe', 'Reset password'],
  '/contactos': ['Contactos', 'Contact'], '/coimbra': ['Coimbra e alojamento', 'Coimbra and accommodation'],
  '/parcerias': ['Parcerias', 'Partners'], '/organizacao': ['Organização', 'Organisation'],
  '/privacidade': ['Privacidade', 'Privacy'], '/cookies': ['Cookies', 'Cookies'], '/termos': ['Termos de utilização', 'Terms of use'],
  '/regulamento': ['Regulamento', 'Event regulations'], '/regulamento/submissoes': ['Regulamento de trabalhos', 'Submission rules'],
  '/admin': ['Gestão de inscrições', 'Registration management'], '/admin/faturacao': ['Faturação', 'Invoicing'],
  '/admin/transferencias': ['Transferências', 'Bank transfers'], '/admin/submissoes': ['Gestão de trabalhos', 'Submission management'],
  '/admin/empresas': ['Empresas e vouchers', 'Companies and vouchers'], '/admin/estudantes': ['Validar estudantes', 'Student verification'],
  '/admin/secretariado': ['Secretariado', 'Event desk'], '/admin/avaliacoes': ['Gestão de avaliações', 'Review management'],
  '/conta/revisoes': ['As minhas avaliações', 'My reviews'], '/2025': ['Edição 2025', '2025 edition'],
};

export function pageTitle(pathname, language) {
  if (pathname === '/media') return 'Media Center | CIRC 2027';
  const slug = pathname.startsWith('/oradores/') ? pathname.split('/')[2] : null;
  const person = slug && (speakers2027.find(item => item.id === slug) || moderators2027[slug]);
  const label = person?.name || titles[pathname]?.[language === 'en' ? 1 : 0];
  return label ? `${label} | CIRC 2027` : language === 'en' ? 'CIRC 2027 · 8–10 April · Coimbra' : 'CIRC 2027 · 8–10 de abril · Coimbra';
}
