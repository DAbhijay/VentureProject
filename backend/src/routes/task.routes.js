import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createTask, getTask, getTasks, updateTaskStatus } from '../controllers/task.controller.js';

const router = Router();
router.use(authMiddleware);
router.post('/', createTask);
router.get('/', getTasks);
router.get('/:id', getTask);
router.patch('/:id/status', updateTaskStatus);

export default router;
