import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import client from '../api/client.js';

export default function TaskDetailsPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const { data } = await client.get(`/tasks/${id}`);
        setTask(data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load task');
      }
    };

    fetchTask();
    const interval = setInterval(fetchTask, 4000);
    return () => clearInterval(interval);
  }, [id]);

  return (
    <Layout title="Task Details">
      {error && <p className="error">{error}</p>}
      {task && (
        <section className="card">
          <h2>{task.title}</h2>
          <p><strong>Status:</strong> {task.status}</p>
          <p><strong>Operation:</strong> {task.operation}</p>
          <p><strong>Input:</strong> {task.input}</p>
          <p><strong>Result:</strong> {task.result || 'Processing...'}</p>
          <h3>Logs</h3>
          <ul>
            {task.logs.map((log, index) => (
              <li key={`${task._id}-${index}`}>{log}</li>
            ))}
          </ul>
        </section>
      )}
    </Layout>
  );
}
