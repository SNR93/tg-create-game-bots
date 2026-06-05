/**
 * Codex developer notes:
 * Страница LoginPage: крупный экран приложения, который собирает API-вызовы, состояние и дочерние компоненты.
 * Страницы отвечают за пользовательский workflow целиком, а мелкая логика должна уходить в компоненты, хуки и API-клиент.
 * При изменениях проверяй не только визуальное состояние, но и сохранение данных на backend.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useState } from 'react';
import { login } from '../api';

export default function LoginPage({ onLogin }) {
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const user = await login(loginValue, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.page}>
      <form style={styles.form} onSubmit={handleSubmit}>
        <h1 style={styles.title}>Вход</h1>
        <label style={styles.label}>
          Логин
          <input
            style={styles.input}
            value={loginValue}
            onChange={event => setLoginValue(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label style={styles.label}>
          Пароль
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} disabled={submitting}>
          {submitting ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#12131a',
    padding: 24,
  },
  form: {
    width: '100%',
    maxWidth: 380,
    background: '#171925',
    border: '1px solid #2d3458',
    borderRadius: 8,
    padding: 24,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 28,
    marginBottom: 22,
  },
  label: {
    display: 'grid',
    gap: 8,
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 16,
  },
  input: {
    background: '#111827',
    border: '1px solid #2d3458',
    borderRadius: 8,
    color: '#e2e8f0',
    padding: '11px 12px',
    fontSize: 15,
    outline: 'none',
  },
  error: {
    color: '#fecaca',
    background: '#3b1720',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 16,
  },
  button: {
    width: '100%',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 15,
    fontWeight: 600,
  },
};
