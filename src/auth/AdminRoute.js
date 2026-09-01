import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const permissionFields = {
  registrations: 'canManageRegistrations',
  submissions: 'canManageSubmissions',
  secretariat: 'canUseSecretariat',
};

function firstAllowedPath(access) {
  if (access?.canManageRegistrations) return '/admin';
  if (access?.canManageSubmissions) return '/admin/submissoes';
  if (access?.canUseSecretariat) return '/admin/secretariado';
  return '/conta';
}

function AdminRoute({ children, permission = 'registrations' }) {
  const { user, access, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="auth-loading" aria-live="polite">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p>A validar permissões de administração…</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const permissionField = permissionFields[permission] || permissionFields.registrations;
  if (!access?.[permissionField]) {
    return <Navigate to={firstAllowedPath(access)} replace state={{ adminDenied: true }} />;
  }

  return children;
}

export default AdminRoute;
