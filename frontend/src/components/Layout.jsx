import { Link, useNavigate } from 'react-router-dom';

export default function Layout({ title, children }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>{title}</h1>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/tasks/new">Create Task</Link>
          <button type="button" onClick={logout}>Logout</button>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
