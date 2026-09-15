import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

test('renders the not-found route inside the application router', () => {
  render(<MemoryRouter initialEntries={['/rota-inexistente']}><App /></MemoryRouter>);
  expect(screen.getByText(/Página não encontrada/i)).toBeInTheDocument();
});
