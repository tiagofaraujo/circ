import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const modules = [
  { to: '/admin', end: true, number: '01', label: 'Inscrições', permission: 'canManageRegistrations' },
  { to: '/admin/submissoes', number: '02', label: 'Submissões', permission: 'canManageSubmissions' },
  { to: '/admin/secretariado', number: '03', label: 'Secretariado', permission: 'canUseSecretariat' },
];

export default function AdminModuleNav() {
  const { access } = useAuth();
  const visibleModules = modules.filter((module) => access?.[module.permission]);

  return (
    <nav className="admin-module-nav" aria-label="Módulos de administração">
      {visibleModules.map((module) => (
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
