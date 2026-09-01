import React from 'react';
import { NavLink } from 'react-router-dom';

const modules = [
  { to: '/admin', end: true, number: '01', label: 'Inscrições' },
  { to: '/admin/submissoes', number: '02', label: 'Submissões' },
  { to: '/admin/secretariado', number: '03', label: 'Secretariado' },
];

export default function AdminModuleNav() {
  return (
    <nav className="admin-module-nav" aria-label="Módulos de administração">
      {modules.map((module) => (
        <NavLink
          key={module.to}
          to={module.to}
          end={module.end}
          className={({ isActive }) => (isActive ? 'is-active' : '')}
        >
          <span>{module.number}</span>
          <strong>{module.label}</strong>
        </NavLink>
      ))}
    </nav>
  );
}
