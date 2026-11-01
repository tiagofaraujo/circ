import React from 'react';
import {render,screen,within,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
const defaultRows=[{id:'circ-2027-pending',eventId:'circ-2027',userId:'pending',participantName:'Pessoa Pendente',status:'submitted',payment:{status:'pending',amountCents:9500,currency:'EUR'}},
  {id:'legacy',participantName:'Registo Histórico',status:'draft',payment:{status:'paid',amountCents:0,currency:'EUR'}}];
const mockRows=[];
jest.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{uid:'admin',email:'circ.chuc@gmail.com'},signOut:jest.fn()})}));
jest.mock('../components/AdminModuleNav',()=>()=>null);
jest.mock('../components/RegistrationRelease',()=>({registration,onReleased})=><button type="button" onClick={()=>onReleased({released:true,registrationId:registration.id,archiveId:'archive'})}>Libertar inscrição de {registration.participantEmail}</button>);
jest.mock('../auth/adminStore',()=>({paymentStatuses:['pending','paid','refunded'],subscribeToRegistrations:fn=>{fn(mockRows);return()=>{};},
  subscribeToRegistrationNotes:fn=>{fn({});return()=>{};},updateRegistrationNote:jest.fn()}));
jest.mock('../auth/presenceStore',()=>({subscribeToUserStats:fn=>{fn({total:2,online:1});return()=>{};}}));
beforeEach(()=>{mockRows.splice(0,mockRows.length,...defaultRows);});
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
