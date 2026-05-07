import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import TaskList from '../components/TaskList.jsx';
import client from '../api/client.js';

export default function DashboardPage() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const { data } = await client.get('/tasks');
        setTasks(data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load tasks');
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout title="Task Dashboard">
      {error && <p className="error">{error}</p>}
      <TaskList tasks={tasks} />
    </Layout>
  );
}
