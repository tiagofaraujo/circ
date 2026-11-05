import React from 'react';
import {render,screen,within,fireEvent} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
import {useAuth} from '../auth/AuthContext';
import {subscribeToRegistrations,subscribeToRegistrationPayments,subscribeToRegistrationNotes} from '../auth/adminStore';
import {subscribeToUserStats} from '../auth/presenceStore';
const defaultRows=[{id:'circ-2027-pending',eventId:'circ-2027',userId:'pending',participantName:'Pessoa Pendente',status:'submitted',payment:{status:'pending',amountCents:9500,currency:'EUR'}},
  {id:'legacy',participantName:'Registo Histórico',status:'draft',payment:{status:'paid',amountCents:0,currency:'EUR'}}];
const mockRows=[];
const mockPayments=[];
jest.mock('../auth/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('../components/AdminModuleNav',()=>()=>null);
jest.mock('../components/RegistrationRelease',()=>({registration,onReleased})=><button type="button" onClick={()=>onReleased({released:true,registrationId:registration.id,archiveId:'archive'})}>Libertar inscrição de {registration.participantEmail}</button>);
jest.mock('../auth/adminStore',()=>({paymentStatuses:['pending','paid','refunded'],subscribeToRegistrations:jest.fn(fn=>{fn(mockRows);return()=>{};}),
  subscribeToRegistrationPayments:jest.fn(fn=>{fn(mockPayments);return()=>{};}),
  subscribeToRegistrationNotes:jest.fn(fn=>{fn({});return()=>{};}),updateRegistrationNote:jest.fn()}));
jest.mock('../auth/presenceStore',()=>({subscribeToUserStats:jest.fn(fn=>{fn({total:2,online:1});return()=>{};})}));
beforeEach(()=>{jest.clearAllMocks();mockRows.splice(0,mockRows.length,...defaultRows);mockPayments.splice(0);
 useAuth.mockReturnValue({user:{uid:'admin',email:'circ.chuc@gmail.com'},isAdmin:true,access:{canManageRegistrations:true,canViewRegistrations:true},signOut:jest.fn()});
 subscribeToRegistrations.mockImplementation(fn=>{fn(mockRows);return()=>{};});
 subscribeToRegistrationPayments.mockImplementation(fn=>{fn(mockPayments);return()=>{};});
 subscribeToRegistrationNotes.mockImplementation(fn=>{fn({});return()=>{};});
 subscribeToUserStats.mockImplementation(fn=>{fn({total:2,online:1});return()=>{};});
});
afterEach(()=>{delete global.fetch;});
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

test('the consultation account reads the server projection without any administrative Firestore subscription or action',async()=>{
 const user={uid:'paulo',email:'paulojaneiro77@gmail.com',getIdToken:jest.fn(async()=>'viewer-token')};
 useAuth.mockReturnValue({user,isAdmin:false,access:{canViewRegistrations:true,canManageRegistrations:false},signOut:jest.fn()});
 const selected={congressMode:'onsite',profile:'external',morningCourse:true,dinnerQuantity:2};
 const registration={id:'circ-2027-designated',eventId:'circ-2027',userId:'designated',primaryRegistration:true,isTest:false,testMode:false,
  participantName:'Participante inscrito',participantEmail:'araujotiagofc@gmail.com',status:'confirmed',selection:selected,entitlements:selected,
  payment:{status:'paid',method:'multibanco',amountCents:9500,currency:'EUR',reference:'123456789',orderId:'12345678-1234-4123-8123-123456789abc'}};
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({registrations:[registration],payments:[],generatedAt:'2026-11-05T12:00:00Z'})}));
 render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AdminDashboardPage/></MemoryRouter>);
 expect(await screen.findByRole('row',{name:/Participante inscrito/})).toBeInTheDocument();
 expect(screen.getByText('Consulta autorizada')).toBeInTheDocument();
 expect(screen.queryByText('Administrador verificado')).not.toBeInTheDocument();
 expect(screen.queryByRole('region',{name:'Utilização do My CIRC'})).not.toBeInTheDocument();
 expect(screen.queryByRole('textbox',{name:/Observações sobre/})).not.toBeInTheDocument();
 expect(screen.queryByRole('columnheader',{name:'Observações'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Libertar inscrição|Registar reembolso|Consultar faturação|Retomar faturação/})).not.toBeInTheDocument();
 for(const subscribe of [subscribeToRegistrations,subscribeToRegistrationPayments,subscribeToRegistrationNotes,subscribeToUserStats])expect(subscribe).not.toHaveBeenCalled();
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(fetch).toHaveBeenCalledWith('/api/admin/registrations/report',expect.objectContaining({method:'GET',headers:{Authorization:'Bearer viewer-token'}}));
});
