import React from 'react';
import {render,screen,within,fireEvent} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
const defaultRows=[{id:'circ-2027-pending',eventId:'circ-2027',userId:'pending',participantName:'Pessoa Pendente',status:'submitted',payment:{status:'pending',amountCents:9500,currency:'EUR'}},
  {id:'legacy',participantName:'Registo Histórico',status:'draft',payment:{status:'paid',amountCents:0,currency:'EUR'}}];
const mockRows=[];
const mockPayments=[];
jest.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{uid:'admin',email:'circ.chuc@gmail.com'},signOut:jest.fn()})}));
jest.mock('../components/AdminModuleNav',()=>()=>null);
jest.mock('../components/RegistrationRelease',()=>({registration,onReleased})=><button type="button" onClick={()=>onReleased({released:true,registrationId:registration.id,archiveId:'archive'})}>Libertar inscrição de {registration.participantEmail}</button>);
jest.mock('../auth/adminStore',()=>({paymentStatuses:['pending','paid','refunded'],subscribeToRegistrations:fn=>{fn(mockRows);return()=>{};},
  subscribeToRegistrationPayments:fn=>{fn(mockPayments);return()=>{};},
  subscribeToRegistrationNotes:fn=>{fn({});return()=>{};},updateRegistrationNote:jest.fn()}));
jest.mock('../auth/presenceStore',()=>({subscribeToUserStats:fn=>{fn({total:2,online:1});return()=>{};}}));
beforeEach(()=>{mockRows.splice(0,mockRows.length,...defaultRows);mockPayments.splice(0);});
test('normal registration and payment statuses are read-only and historical mismatches are visible',()=>{
  render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AdminDashboardPage/></MemoryRouter>);
  expect(screen.getAllByRole('combobox')).toHaveLength(1);
  const pending=screen.getByRole('row',{name:/Pessoa Pendente/});
  expect(within(pending).getByLabelText('Estado da inscrição de Pessoa Pendente')).toHaveTextContent('Submetida');
  expect(within(pending).getByLabelText('Estado do pagamento de Pessoa Pendente')).toHaveTextContent('Pendente');
  expect(within(pending).queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByText('Estados por conferir — registo histórico')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Registar reembolso efetuado'})).not.toBeInTheDocument();
});
test('only the designated participant row exposes release and a completed archive is acknowledged',()=>{
 mockRows.push({...defaultRows[0],id:'circ-2027-designated',participantName:'Participante designado',participantEmail:'araujotiagofc@gmail.com'},
  {...defaultRows[0],id:'circ-2027-other',participantName:'Outro participante',participantEmail:'other@example.com'});
 render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AdminDashboardPage/></MemoryRouter>);
 const release=screen.getByRole('button',{name:'Libertar inscrição de araujotiagofc@gmail.com'});
 expect(screen.queryByRole('button',{name:'Libertar inscrição de other@example.com'})).not.toBeInTheDocument();
 fireEvent.click(release);
 expect(screen.getByRole('status')).toHaveTextContent('Os pagamentos e documentos anteriores foram preservados');
});

function CurrentLocation(){const location=useLocation();return <output aria-label="Localização atual">{location.pathname}{location.search}</output>;}

test('profile dashboard can be opened directly and switching panels preserves other URL parameters',()=>{
 render(<MemoryRouter initialEntries={['/admin?painel=perfis&origem=gestao']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AdminDashboardPage/><CurrentLocation/></MemoryRouter>);
 expect(screen.getByRole('tab',{name:/Perfis dos congressistas/})).toHaveAttribute('aria-selected','true');
 expect(screen.getByRole('heading',{name:'Quem se inscreve no CIRC'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:/Visão geral/}));
 expect(screen.getByLabelText('Localização atual')).toHaveTextContent('/admin?painel=geral&origem=gestao');
 expect(screen.getByRole('tab',{name:/Visão geral/})).toHaveAttribute('aria-selected','true');
});

test('searching the participant list never changes congress-wide dashboard figures',()=>{
 mockRows.splice(0,mockRows.length,...['one','two'].map(uid=>({id:`circ-2027-${uid}`,eventId:'circ-2027',userId:uid,primaryRegistration:true,isTest:false,testMode:false,status:'confirmed',
 participantName:`Participante ${uid}`,selection:{profile:'external',congressMode:'onsite'},entitlements:{congressMode:'onsite'},payment:{status:'paid',amountCents:9500}})));
 render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AdminDashboardPage/></MemoryRouter>);
 const onsite=screen.getByRole('article',{name:'Congresso presencial'});
 expect(within(onsite).getByText('398')).toBeInTheDocument();
 fireEvent.change(screen.getByPlaceholderText('Nome, email ou ID'),{target:{value:'Participante one'}});
 expect(screen.queryByRole('row',{name:/Participante two/})).not.toBeInTheDocument();
 expect(within(onsite).getByText('398')).toBeInTheDocument();
 expect(screen.getByRole('row',{name:/Participante one/})).toBeInTheDocument();
});
