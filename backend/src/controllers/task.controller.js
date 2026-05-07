import Task from '../models/Task.js';
import { enqueueTask } from '../services/queue.service.js';

const stamp = (msg) => `${new Date().toISOString()} - ${msg}`;

export const createTask = async (req, res, next) => {
  try {
    const { title, input, operation } = req.body;
    const task = await Task.create({
      title,
      input,
      operation,
      status: 'pending',
      logs: [stamp('task created')],
      userId: req.user.id
    });

    await enqueueTask({ taskId: task._id.toString(), userId: req.user.id });
    task.logs.push(stamp('task enqueued'));
    await task.save();

    return res.status(201).json(task);
  } catch (error) {
    return next(error);
  }
};

export const getTasks = async (req, res, next) => {
  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.status(200).json(tasks);
  } catch (error) {
    return next(error);
  }
};

export const getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    return res.status(200).json(task);
  } catch (error) {
    return next(error);
  }
};

export const updateTaskStatus = async (req, res, next) => {
  try {
    const { status, result, log } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (status) task.status = status;
    if (result !== undefined) task.result = String(result);
    if (log) task.logs.push(stamp(log));

    await task.save();
    return res.status(200).json(task);
  } catch (error) {
    return next(error);
  }
};
