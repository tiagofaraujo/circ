import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import emailjs from 'emailjs-com';
import { useLanguage } from '../../context/LanguageContext';
import ContactForm from './ContactForm';

jest.mock('emailjs-com', () => ({ send: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  useLanguage.mockReturnValue({ language: 'pt' });
});

test.each([
  ['pt', ['Nome', 'Email', 'Assunto', 'Mensagem'], 'Enviar'],
  ['en', ['Name', 'Email', 'Subject', 'Message'], 'Send'],
])('contact fields have persistent associated labels in %s', (language, names, button) => {
  useLanguage.mockReturnValue({ language });
  render(<ContactForm />);

  for (const name of names) {
    const control = screen.getByRole('textbox', { name });
    expect(control).toBeRequired();
    expect(control).toHaveAttribute('id');
  }
  expect(screen.getByRole('button', { name: button })).toBeEnabled();
  expect(emailjs.send).not.toHaveBeenCalled();
});

test('labelled controls preserve the existing email template field names', async () => {
  emailjs.send.mockResolvedValue({ status: 200 });
  render(<ContactForm />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Pessoa Teste' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'exemplo@example.org' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Assunto' }), { target: { value: 'Pergunta' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mensagem' }), { target: { value: 'Mensagem de ensaio' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Mensagem enviada com sucesso'));
  expect(emailjs.send).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      name: 'Pessoa Teste',
      email: 'exemplo@example.org',
      subject: 'Pergunta',
      message: 'Mensagem de ensaio',
    }),
    expect.any(String)
  );
});

test('rejects whitespace-only messages without sending', () => {
  render(<ContactForm />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: '   ' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Enviar' }).closest('form'));
  expect(emailjs.send).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveFocus();
});

test('failed sending preserves the text and offers an encoded manual email without duplicate requests', async () => {
  let reject;
  emailjs.send.mockImplementation(() => new Promise((resolve, fail) => { reject = fail; }));
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ContactForm />);
  for (const [name, value] of [['Nome', 'Pessoa Teste'], ['Email', 'exemplo@example.org'], ['Assunto', 'Ajuda & inscrição'], ['Mensagem', 'Olá, preciso de ajuda.']]) {
    fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
  }
  const form = screen.getByRole('button', { name: 'Enviar' }).closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(emailjs.send).toHaveBeenCalledTimes(1);
  reject({ status: 412, text: 'Service unavailable' });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('O texto foi mantido'));
  expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveValue('Olá, preciso de ajuda.');
  const fallback = screen.getByRole('link', { name: 'Abrir na minha aplicação de email' });
  const url = new URL(fallback.href);
  expect(url.pathname).toBe('circ.chuc@gmail.com');
  expect(url.searchParams.get('subject')).toBe('Ajuda & inscrição');
  expect(url.searchParams.get('body')).toContain('Olá, preciso de ajuda.');
  expect(screen.getByRole('status')).toHaveFocus();
  errorLog.mockRestore();
});
