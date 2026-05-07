import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import client from '../api/client.js';

export default function TaskCreatePage() {
  const [form, setForm] = useState({ title: '', input: '', operation: 'uppercase' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await client.post('/tasks', form);
      navigate(`/tasks/${data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create task');
    }
  };

  return (
    <Layout title="Create Task">
      <form onSubmit={submit} className="task-form">
        <input placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <textarea placeholder="Input text" value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} rows={5} required />
        <select value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })}>
          <option value="uppercase">uppercase</option>
          <option value="lowercase">lowercase</option>
          <option value="reverse">reverse string</option>
          <option value="wordcount">word count</option>
        </select>
        <button type="submit">Submit Task</button>
        {error && <p className="error">{error}</p>}
      </form>
    </Layout>
  );
}
