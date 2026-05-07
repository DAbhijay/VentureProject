import { Link } from 'react-router-dom';

export default function TaskList({ tasks }) {
  if (!tasks.length) return <p>No tasks yet.</p>;

  return (
    <div className="card-list">
      {tasks.map((task) => (
        <article key={task._id} className="card">
          <h3>{task.title}</h3>
          <p><strong>Operation:</strong> {task.operation}</p>
          <p><strong>Status:</strong> {task.status}</p>
          <p><strong>Created:</strong> {new Date(task.createdAt).toLocaleString()}</p>
          <Link to={`/tasks/${task._id}`}>View details</Link>
        </article>
      ))}
    </div>
  );
}
